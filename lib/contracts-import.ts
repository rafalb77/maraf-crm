import * as XLSX from 'xlsx'
import { prisma } from './prisma'
import type { ContractType, ContractStatus } from './types'

// =====================================================================
// Importer umów (Contract) z xlsx — backfill historii sprzedaży.
//
// Mapowanie kolumn PO NAZWACH nagłówków (odporne na kolejność i format
// eksportu). Rozpoznawane nagłówki (case-insensitive) — patrz HEADER_ALIASES.
// Wspiera m.in. eksport z polami: Nazwa(=nr umowy), Typ umowy, Status umowy,
// Klienci, Email, Inwestycja, Data wprowadzenia, Planowana data podpisania,
// Data podpisania — oraz starszy format (Nr umowy, Telefon, Lokale, Wartości...).
//
// Zachowanie:
//  - idempotentny po numerze umowy (istniejąca → update, nowa → create)
//  - klient dopasowany NAJPIERW po emailu (pewniejsze), potem po imię+nazwisko;
//    brakujący tworzony (createMissingClients)
//  - data wprowadzenia → introducedAt umowy ORAZ createdAt nowo tworzonego klienta
//  - lokale dopasowane po numerze; brakujące → ostrzeżenie (lokale importuj wcześniej)
//  - NIE zmienia statusu lokali (to robi import lokali)
// =====================================================================

type ColKey =
  | 'number' | 'type' | 'status' | 'clients' | 'phone' | 'email' | 'units'
  | 'investment' | 'introducedAt' | 'plannedSignDate' | 'signedAt'
  | 'valueNet' | 'valueGross' | 'reservationFee' | 'discount' | 'notes' | 'source'

// Aliasy nagłówków → klucz kolumny (po normalizacji: lower+trim).
// Kolejność wpisana jest tak, by specyficzne nazwy ('nr umowy') miały
// pierwszeństwo nad ogólnymi ('nazwa') — patrz resolveColumns().
const HEADER_ALIASES: Record<string, ColKey> = {
  'nr umowy': 'number',
  'numer umowy': 'number',
  'numer': 'number',
  'nazwa': 'number', // eksport "Umowa sprzedaży" nazywa numer umowy "Nazwa"
  'typ umowy': 'type',
  'typ': 'type',
  'status umowy': 'status',
  'status': 'status',
  'klienci': 'clients',
  'klient': 'clients',
  'klient(zy)': 'clients',
  'klienci(zy)': 'clients',
  'email': 'email',
  'e-mail': 'email',
  'telefon': 'phone',
  'numer telefonu': 'phone',
  'lokale': 'units',
  'lokal': 'units',
  'inwestycja': 'investment',
  'data wprowadzenia': 'introducedAt',
  'planowana data podpisania': 'plannedSignDate',
  'data podpisania': 'signedAt',
  'wartość netto': 'valueNet',
  'wartosc netto': 'valueNet',
  'wartość brutto': 'valueGross',
  'wartosc brutto': 'valueGross',
  'kaucja': 'reservationFee',
  'opłata rezerwacyjna': 'reservationFee',
  'oplata rezerwacyjna': 'reservationFee',
  'rabat': 'discount',
  'notatki': 'notes',
  'źródło': 'source',
  'zrodlo': 'source',
}

// Aliasy o NIŻSZYM priorytecie — używane tylko gdy pole nie zostało
// rozpoznane przez bardziej specyficzny nagłówek (np. 'nazwa' → number
// tylko gdy brak kolumny 'nr umowy'/'numer umowy').
const LOW_PRIORITY = new Set<string>(['nazwa', 'typ', 'status', 'numer'])

function resolveColumns(header: unknown[]): Partial<Record<ColKey, number>> {
  const colOf: Partial<Record<ColKey, number>> = {}
  // Pierwsze przejście: tylko nagłówki o wysokim priorytecie.
  for (let c = 0; c < header.length; c++) {
    const key = String(header[c] ?? '').trim().toLowerCase()
    if (LOW_PRIORITY.has(key)) continue
    const field = HEADER_ALIASES[key]
    if (field && colOf[field] === undefined) colOf[field] = c
  }
  // Drugie przejście: nagłówki niskiego priorytetu uzupełniają braki.
  for (let c = 0; c < header.length; c++) {
    const key = String(header[c] ?? '').trim().toLowerCase()
    if (!LOW_PRIORITY.has(key)) continue
    const field = HEADER_ALIASES[key]
    if (field && colOf[field] === undefined) colOf[field] = c
  }
  return colOf
}

export type ImportContractsOptions = {
  createMissingClients: boolean
}

export type ContractRowData = {
  number: string
  type: ContractType
  status: ContractStatus
  clientNames: string[]
  phone: string | null
  email: string | null
  source: string | null
  unitNumbers: string[]
  investmentName: string
  introducedAt: Date | null
  plannedSignDate: Date | null
  signedAt: Date | null
  valueNet: number | null
  valueGross: number | null
  reservationFee: number | null
  discount: number | null
  notes: string | null
}

export type PreviewRow = {
  rowIndex: number
  number: string
  action: 'create' | 'update'
  type: ContractType
  status: ContractStatus
  primaryClient: string
  clientResolution: 'matched' | 'will-create' | 'ambiguous'
  unitsMatched: string[]
  unitsMissing: string[]
  signedAt: Date | null
  valueGross: number | null
}

export type ImportErrorRow = { rowIndex: number; number: string; reason: string }

export type ContractsDiff = {
  rows: PreviewRow[]
  errors: ImportErrorRow[]
  totalRowsInFile: number
  willCreateClients: number
  missingUnits: string[]
}

export type ContractsCommitResult = ContractsDiff & {
  applied: {
    contractsCreated: number
    contractsUpdated: number
    clientsCreated: number
    unitsLinked: number
  }
}

// ---------------------------------------------------------------------
// Parsery pól
// ---------------------------------------------------------------------

function matchType(raw: string): ContractType | null {
  const s = raw.toLowerCase()
  if (!s) return null
  if (s.includes('rezerw') || s === 'r') return 'REZERWACYJNA'
  if (s.includes('dewelop') || s === 'd') return 'DEWELOPERSKA'
  if (s.includes('przenies') || s === 'p') return 'PRZENIESIENIA'
  return null
}

function matchStatus(raw: string, hasSignedAt: boolean): ContractStatus {
  const s = raw.toLowerCase()
  if (s.includes('podpis')) return 'PODPISANA'
  if (s.includes('przygot')) return 'W_PRZYGOTOWANIU'
  if (s.includes('rozwiąz') || s.includes('rozwiaz')) return 'ROZWIAZANA'
  if (s.includes('anul')) return 'ANULOWANA'
  // brak/nierozpoznany status → wnioskuj z daty podpisania
  return hasSignedAt ? 'PODPISANA' : 'W_PRZYGOTOWANIU'
}

function parseMoney(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw)
    .replace(/\s/g, '')
    .replace(/zł/gi, '')
    .replace(/ /g, '')
    .replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function parseDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw
  if (typeof raw === 'number') {
    // Excel serial date → JS Date (epoch 1899-12-30)
    const ms = Math.round((raw - 25569) * 86400 * 1000)
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }
  const s = String(raw).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function splitNames(raw: unknown): string[] {
  return String(raw || '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function nameParts(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

type ParsedRow =
  | { rowIndex: number; data: ContractRowData }
  | { rowIndex: number; error: ImportErrorRow }

function parseSheet(buffer: Buffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('Plik nie zawiera żadnego arkusza')
  // blankrows:false — niektóre eksporty mają ogromny "used range" z pustymi
  // wierszami (sheet_to_json zwróciłby setki tysięcy pustych tablic).
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false })
  if (rows.length < 2) throw new Error('Plik nie zawiera danych (brak wierszy poza nagłówkiem)')

  const colOf = resolveColumns(rows[0])
  if (colOf.number === undefined) {
    throw new Error('Nie znaleziono kolumny z numerem umowy ("Nazwa"/"Nr umowy"). Sprawdź nagłówek pliku.')
  }
  if (colOf.clients === undefined) {
    throw new Error('Nie znaleziono kolumny "Klienci"/"Klient". Sprawdź nagłówek pliku.')
  }
  const get = (r: unknown[], f: ColKey): unknown => (colOf[f] !== undefined ? r[colOf[f]!] : '')

  const out: ParsedRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const rowIndex = i + 1
    const number = String(get(r, 'number') || '').trim()
    if (!number) continue

    const type = matchType(String(get(r, 'type') || '').trim())
    if (!type) {
      out.push({ rowIndex, error: { rowIndex, number, reason: `Nieznany typ umowy: "${String(get(r, 'type') || '')}"` } })
      continue
    }

    const clientNames = splitNames(get(r, 'clients'))
    if (clientNames.length === 0) {
      out.push({ rowIndex, error: { rowIndex, number, reason: 'Brak klienta' } })
      continue
    }

    const signedAt = parseDate(get(r, 'signedAt'))
    const status = matchStatus(String(get(r, 'status') || '').trim(), !!signedAt)

    const unitNumbers = String(get(r, 'units') || '')
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean)

    out.push({
      rowIndex,
      data: {
        number,
        type,
        status,
        clientNames,
        phone: String(get(r, 'phone') || '').trim() || null,
        email: String(get(r, 'email') || '').trim() || null,
        source: String(get(r, 'source') || '').trim() || null,
        unitNumbers,
        investmentName: String(get(r, 'investment') || '').trim() || 'Inwestycja',
        introducedAt: parseDate(get(r, 'introducedAt')),
        plannedSignDate: parseDate(get(r, 'plannedSignDate')),
        signedAt,
        valueNet: parseMoney(get(r, 'valueNet')),
        valueGross: parseMoney(get(r, 'valueGross')),
        reservationFee: parseMoney(get(r, 'reservationFee')),
        discount: parseMoney(get(r, 'discount')),
        notes: String(get(r, 'notes') || '').trim() || null,
      },
    })
  }
  return out
}

// ---------------------------------------------------------------------
// Diff (preview)
// ---------------------------------------------------------------------

export async function buildContractsDiff(
  buffer: Buffer,
  opts: ImportContractsOptions,
): Promise<ContractsDiff> {
  const parsed = parseSheet(buffer)
  const errors: ImportErrorRow[] = []
  const valid: { rowIndex: number; data: ContractRowData }[] = []
  const seen = new Set<string>()
  for (const p of parsed) {
    if ('error' in p) { errors.push(p.error); continue }
    if (seen.has(p.data.number)) {
      errors.push({ rowIndex: p.rowIndex, number: p.data.number, reason: 'Duplikat numeru umowy w pliku' })
      continue
    }
    seen.add(p.data.number)
    valid.push(p)
  }

  const [existingContracts, allClients, allUnits] = await Promise.all([
    prisma.contract.findMany({ select: { number: true } }),
    prisma.client.findMany({ select: { id: true, firstName: true, lastName: true, email: true } }),
    prisma.unit.findMany({ select: { number: true } }),
  ])
  const existingNumbers = new Set(existingContracts.map((c) => c.number))
  const unitNumberSet = new Set(allUnits.map((u) => u.number))
  const clientCountByName = new Map<string, number>()
  const emailSet = new Set<string>()
  for (const c of allClients) {
    const key = `${c.firstName} ${c.lastName}`.trim().toLowerCase()
    clientCountByName.set(key, (clientCountByName.get(key) || 0) + 1)
    if (c.email) emailSet.add(c.email.trim().toLowerCase())
  }

  const rows: PreviewRow[] = []
  const missingUnits = new Set<string>()
  let willCreateClients = 0

  for (const v of valid) {
    const d = v.data
    const primary = d.clientNames[0]
    const key = primary.trim().toLowerCase()
    const emailKey = d.email ? d.email.trim().toLowerCase() : ''
    const matchCount = clientCountByName.get(key) || 0
    let clientResolution: PreviewRow['clientResolution']
    // Email ma pierwszeństwo — pewniejszy niż imię+nazwisko.
    if (emailKey && emailSet.has(emailKey)) clientResolution = 'matched'
    else if (matchCount === 1) clientResolution = 'matched'
    else if (matchCount > 1) clientResolution = 'ambiguous'
    else {
      if (!opts.createMissingClients) {
        errors.push({ rowIndex: v.rowIndex, number: d.number, reason: `Klient "${primary}" nie istnieje (tworzenie wyłączone)` })
        continue
      }
      clientResolution = 'will-create'
      willCreateClients++
    }

    const unitsMatched: string[] = []
    const unitsMissing: string[] = []
    for (const un of d.unitNumbers) {
      if (unitNumberSet.has(un)) unitsMatched.push(un)
      else { unitsMissing.push(un); missingUnits.add(un) }
    }

    rows.push({
      rowIndex: v.rowIndex,
      number: d.number,
      action: existingNumbers.has(d.number) ? 'update' : 'create',
      type: d.type,
      status: d.status,
      primaryClient: primary,
      clientResolution,
      unitsMatched,
      unitsMissing,
      signedAt: d.signedAt,
      valueGross: d.valueGross,
    })
  }

  return {
    rows,
    errors,
    totalRowsInFile: valid.length + errors.length,
    willCreateClients,
    missingUnits: [...missingUnits],
  }
}

// ---------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------

export async function commitContractsImport(
  buffer: Buffer,
  opts: ImportContractsOptions,
): Promise<ContractsCommitResult> {
  const parsed = parseSheet(buffer)
  const errors: ImportErrorRow[] = []
  const valid: { rowIndex: number; data: ContractRowData }[] = []
  const seen = new Set<string>()
  for (const p of parsed) {
    if ('error' in p) { errors.push(p.error); continue }
    if (seen.has(p.data.number)) {
      errors.push({ rowIndex: p.rowIndex, number: p.data.number, reason: 'Duplikat numeru umowy w pliku' })
      continue
    }
    seen.add(p.data.number)
    valid.push(p)
  }

  let contractsCreated = 0
  let contractsUpdated = 0
  let clientsCreated = 0
  let unitsLinked = 0
  const missingUnits = new Set<string>()
  let willCreateClients = 0
  const previewRows: PreviewRow[] = []

  await prisma.$transaction(async (tx) => {
    // Cache lokali po numerze
    const units = await tx.unit.findMany({ select: { id: true, number: true } })
    const unitIdByNumber = new Map(units.map((u) => [u.number, u.id]))

    // Cache klientów po nazwie (lower) → lista id, oraz po emailu (lower) → id.
    const clients = await tx.client.findMany({ select: { id: true, firstName: true, lastName: true, email: true } })
    const clientIdsByName = new Map<string, string[]>()
    const clientIdByEmail = new Map<string, string>()
    for (const c of clients) {
      const key = `${c.firstName} ${c.lastName}`.trim().toLowerCase()
      const arr = clientIdsByName.get(key) || []
      arr.push(c.id)
      clientIdsByName.set(key, arr)
      if (c.email) clientIdByEmail.set(c.email.trim().toLowerCase(), c.id)
    }

    // useEmail: tylko dla GŁÓWNEGO klienta umowy — email z pliku należy do niego.
    // Współkupujący (2..n) dopasowywani wyłącznie po nazwisku.
    async function resolveClientId(fullName: string, d: ContractRowData, useEmail: boolean): Promise<string | null> {
      if (useEmail && d.email) {
        const eid = clientIdByEmail.get(d.email.trim().toLowerCase())
        if (eid) return eid
      }
      const key = fullName.trim().toLowerCase()
      const ids = clientIdsByName.get(key)
      if (ids && ids.length >= 1) return ids[0]
      if (!opts.createMissingClients) return null
      const { firstName, lastName } = nameParts(fullName)
      const created = await tx.client.create({
        data: {
          firstName,
          lastName,
          phone: useEmail ? d.phone : null,
          email: useEmail ? d.email : null, // email przypisujemy tylko głównemu
          source: d.source,
          // status pochodny z umowy (pomaga ożywić lejek/ROI dla historii)
          status: d.status === 'PODPISANA' ? 'UMOWA' : 'REZERWACJA',
          // backfill daty leada → realny "cykl sprzedaży"
          ...(d.introducedAt ? { createdAt: d.introducedAt } : {}),
        },
        select: { id: true },
      })
      clientIdsByName.set(key, [created.id])
      if (useEmail && d.email) clientIdByEmail.set(d.email.trim().toLowerCase(), created.id)
      clientsCreated++
      return created.id
    }

    for (const v of valid) {
      const d = v.data
      const primaryId = await resolveClientId(d.clientNames[0], d, true)
      if (!primaryId) {
        errors.push({ rowIndex: v.rowIndex, number: d.number, reason: `Klient "${d.clientNames[0]}" nie istnieje (tworzenie wyłączone)` })
        continue
      }

      const baseData = {
        type: d.type,
        status: d.status,
        investmentName: d.investmentName,
        clientId: primaryId,
        plannedSignDate: d.plannedSignDate,
        signedAt: d.signedAt,
        valueNet: d.valueNet,
        valueGross: d.valueGross,
        reservationFee: d.reservationFee,
        discount: d.discount,
        notes: d.notes,
      }

      const existing = await tx.contract.findUnique({ where: { number: d.number }, select: { id: true } })
      let contractId: string
      if (existing) {
        await tx.contract.update({
          where: { id: existing.id },
          data: { ...baseData, ...(d.introducedAt ? { introducedAt: d.introducedAt } : {}) },
        })
        contractId = existing.id
        contractsUpdated++
      } else {
        const created = await tx.contract.create({
          data: { number: d.number, ...baseData, ...(d.introducedAt ? { introducedAt: d.introducedAt } : {}) },
          select: { id: true },
        })
        contractId = created.id
        contractsCreated++
      }

      // Współkupujący (pozycje 2..n) — primary trzymamy też w ContractClient pos 1.
      // Główny (idx 0) z useEmail, reszta tylko po nazwisku.
      const allNameIds: string[] = []
      for (let ni = 0; ni < d.clientNames.length; ni++) {
        const id = await resolveClientId(d.clientNames[ni], d, ni === 0)
        if (id) allNameIds.push(id)
      }
      let pos = 1
      for (const cid of allNameIds) {
        await tx.contractClient.upsert({
          where: { contractId_clientId: { contractId, clientId: cid } },
          create: { contractId, clientId: cid, position: pos },
          update: { position: pos },
        })
        pos++
      }

      // Lokale
      for (const un of d.unitNumbers) {
        const unitId = unitIdByNumber.get(un)
        if (!unitId) { missingUnits.add(un); continue }
        await tx.contractUnit.upsert({
          where: { contractId_unitId: { contractId, unitId } },
          create: { contractId, unitId },
          update: {},
        })
        unitsLinked++
      }
    }
  }, { timeout: 120_000 })

  return {
    rows: previewRows,
    errors,
    totalRowsInFile: valid.length + errors.length,
    willCreateClients,
    missingUnits: [...missingUnits],
    applied: { contractsCreated, contractsUpdated, clientsCreated, unitsLinked },
  }
}
