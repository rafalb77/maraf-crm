import * as XLSX from 'xlsx'
import { prisma } from './prisma'

// =====================================================================
// Import klientów z xlsx (eksport CRM).
// Mapowanie po NAZWACH nagłówków (odporne na kolejność kolumn).
// Tryb: tylko dodawanie nowych. Dedup po PESEL.
//
// Rozpoznawane nagłówki (case-insensitive):
//   Imiona/Imię → firstName, Nazwisko → lastName, Miasto → city,
//   Ulica/Adres → address, E-mail/Email → email,
//   Numer telefonu/Telefon → phone, PESEL → pesel
// Ignorowane: Nazwa, Umowy, Data utworzenia, Data modyfikacji.
// =====================================================================

export type ClientImportData = {
  firstName: string
  lastName: string
  city: string | null
  address: string | null
  email: string | null
  phone: string | null
  pesel: string | null
}

export type NewClientRow = {
  rowIndex: number
  data: ClientImportData
  hasPesel: boolean
}

export type SkipClientRow = {
  rowIndex: number
  name: string
  reason: string
}

export type ClientDiffResult = {
  newRows: NewClientRow[]
  skipRows: SkipClientRow[]
  totalRowsInFile: number
  withoutPeselCount: number
}

export type ClientCommitResult = ClientDiffResult & {
  applied: { created: number }
}

// Aliasy nagłówków → klucz pola. Klucze porównywane po normalizacji (lower+trim).
const HEADER_ALIASES: Record<string, keyof ClientImportData> = {
  imiona: 'firstName',
  imie: 'firstName',
  'imię': 'firstName',
  nazwisko: 'lastName',
  miasto: 'city',
  ulica: 'address',
  adres: 'address',
  'e-mail': 'email',
  email: 'email',
  'numer telefonu': 'phone',
  telefon: 'phone',
  pesel: 'pesel',
}

function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase()
}

function cleanStr(v: unknown): string {
  return String(v ?? '').trim()
}

function emptyToNull(v: unknown): string | null {
  const s = cleanStr(v)
  return s === '' ? null : s
}

/** Normalizuje PESEL do porównań/zapisu: usuwa białe znaki. */
function normPesel(v: unknown): string | null {
  const s = cleanStr(v).replace(/\s+/g, '')
  return s === '' ? null : s
}

type ParsedRow =
  | { rowIndex: number; data: ClientImportData }
  | { rowIndex: number; skip: SkipClientRow }

function parseSheet(buffer: Buffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('Plik nie zawiera żadnego arkusza')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  if (rows.length < 2) throw new Error('Plik nie zawiera danych (brak wierszy poza nagłówkiem)')

  // Zbuduj mapę: pole → indeks kolumny, na podstawie nagłówka (row 0).
  const header = rows[0]
  const colOf: Partial<Record<keyof ClientImportData, number>> = {}
  for (let c = 0; c < header.length; c++) {
    const field = HEADER_ALIASES[norm(header[c])]
    if (field && colOf[field] === undefined) colOf[field] = c
  }

  if (colOf.firstName === undefined && colOf.lastName === undefined) {
    throw new Error(
      'Nie znaleziono kolumn "Imiona"/"Nazwisko" w nagłówku. Sprawdź czy plik ma nagłówek w pierwszym wierszu.',
    )
  }

  const get = (r: unknown[], f: keyof ClientImportData): unknown =>
    colOf[f] !== undefined ? r[colOf[f]!] : ''

  const result: ParsedRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const rowIndex = i + 1 // 1-based wiersz w Excelu

    const firstName = cleanStr(get(r, 'firstName'))
    const lastName = cleanStr(get(r, 'lastName'))
    if (!firstName && !lastName) continue // puste/trailing wiersze pomijamy cicho

    const name = `${firstName} ${lastName}`.trim()
    if (!lastName) {
      result.push({ rowIndex, skip: { rowIndex, name, reason: 'Brak nazwiska' } })
      continue
    }

    const data: ClientImportData = {
      firstName,
      lastName,
      city: emptyToNull(get(r, 'city')),
      address: emptyToNull(get(r, 'address')),
      email: emptyToNull(get(r, 'email')),
      phone: emptyToNull(get(r, 'phone')),
      pesel: normPesel(get(r, 'pesel')),
    }
    result.push({ rowIndex, data })
  }
  return result
}

export async function buildClientDiff(buffer: Buffer): Promise<ClientDiffResult> {
  const parsed = parseSheet(buffer)

  // Istniejący klienci — PESEL odszyfrowany automatycznie (extension lib/prisma.ts).
  const existing = await prisma.client.findMany({ select: { pesel: true } })
  const existingPesels = new Set<string>()
  for (const c of existing) {
    const p = normPesel(c.pesel)
    if (p) existingPesels.add(p)
  }

  const newRows: NewClientRow[] = []
  const skipRows: SkipClientRow[] = []
  const seenInFile = new Set<string>()
  let withoutPeselCount = 0
  let total = 0

  for (const p of parsed) {
    total++
    if ('skip' in p) {
      skipRows.push(p.skip)
      continue
    }
    const { rowIndex, data } = p
    const name = `${data.firstName} ${data.lastName}`.trim()

    if (data.pesel) {
      if (existingPesels.has(data.pesel)) {
        skipRows.push({ rowIndex, name, reason: `Klient z PESEL ${data.pesel} już istnieje w bazie` })
        continue
      }
      if (seenInFile.has(data.pesel)) {
        skipRows.push({ rowIndex, name, reason: `Duplikat PESEL ${data.pesel} w pliku` })
        continue
      }
      seenInFile.add(data.pesel)
      newRows.push({ rowIndex, data, hasPesel: true })
    } else {
      // Brak PESEL — nie da się deduplikować. Dodajemy jako nowego, ale flagujemy.
      withoutPeselCount++
      newRows.push({ rowIndex, data, hasPesel: false })
    }
  }

  return { newRows, skipRows, totalRowsInFile: total, withoutPeselCount }
}

export async function commitClientImport(buffer: Buffer): Promise<ClientCommitResult> {
  const diff = await buildClientDiff(buffer)

  let created = 0
  await prisma.$transaction(async (tx) => {
    for (const n of diff.newRows) {
      // tx.client.create przechodzi przez extension → pola wrażliwe szyfrowane.
      await tx.client.create({
        data: {
          firstName: n.data.firstName,
          lastName: n.data.lastName,
          city: n.data.city,
          address: n.data.address,
          email: n.data.email,
          phone: n.data.phone,
          pesel: n.data.pesel,
          status: 'ZAPYTANIE',
          source: 'import',
        },
      })
      created++
    }
  })

  return { ...diff, applied: { created } }
}
