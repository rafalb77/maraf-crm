import * as XLSX from 'xlsx'
import { prisma } from './prisma'
import type { ContractType, ContractStatus } from './types'

// =====================================================================
// Importer umów (Contract) z xlsx — backfill historii sprzedaży.
//
// Format pliku (z nagłówkiem w wierszu 1):
//   A Nr umowy* · B Typ · C Status · D Klient(zy) · E Telefon · F Email
//   G Lokale (numery, przecinkami) · H Inwestycja · I Data wprowadzenia
//   J Data podpisania · K Wartość netto · L Wartość brutto · M Kaucja
//   N Rabat · O Notatki · P Źródło
//
// Zachowanie:
//  - idempotentny po "Nr umowy" (istniejąca → update, nowa → create)
//  - klient dopasowany po imię+nazwisko; brakujący tworzony (createMissingClients)
//  - data wprowadzenia → introducedAt umowy ORAZ createdAt nowo tworzonego klienta
//    (żeby "cykl sprzedaży" liczył się też dla historii)
//  - lokale dopasowane po numerze; brakujące → ostrzeżenie (lokale importuj wcześniej)
//  - NIE zmienia statusu lokali (to robi import lokali) — patrz docs/statystyki-decyzje.md
// =====================================================================

const COL = {
  number: 0,
  type: 1,
  status: 2,
  clients: 3,
  phone: 4,
  email: 5,
  units: 6,
  investment: 7,
  introducedAt: 8,
  signedAt: 9,
  valueNet: 10,
  valueGross: 11,
  reservationFee: 12,
  discount: 13,
  notes: 14,
  source: 15,
} as const

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
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })

  const out: ParsedRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const rowIndex = i + 1
    const number = String(r[COL.number] || '').trim()
    if (!number) continue

    const type = matchType(String(r[COL.type] || '').trim())
    if (!type) {
      out.push({ rowIndex, error: { rowIndex, number, reason: `Nieznany typ umowy: "${String(r[COL.type] || '')}"` } })
      continue
    }

    const clientNames = splitNames(r[COL.clients])
    if (clientNames.length === 0) {
      out.push({ rowIndex, error: { rowIndex, number, reason: 'Brak klienta' } })
      continue
    }

    const signedAt = parseDate(r[COL.signedAt])
    const status = matchStatus(String(r[COL.status] || '').trim(), !!signedAt)

    const unitNumbers = String(r[COL.units] || '')
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
        phone: String(r[COL.phone] || '').trim() || null,
        email: String(r[COL.email] || '').trim() || null,
        source: String(r[COL.source] || '').trim() || null,
        unitNumbers,
        investmentName: String(r[COL.investment] || '').trim() || 'Inwestycja',
        introducedAt: parseDate(r[COL.introducedAt]),
        signedAt,
        valueNet: parseMoney(r[COL.valueNet]),
        valueGross: parseMoney(r[COL.valueGross]),
        reservationFee: parseMoney(r[COL.reservationFee]),
        discount: parseMoney(r[COL.discount]),
        notes: String(r[COL.notes] || '').trim() || null,
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
    prisma.client.findMany({ select: { id: true, firstName: true, lastName: true } }),
    prisma.unit.findMany({ select: { number: true } }),
  ])
  const existingNumbers = new Set(existingContracts.map((c) => c.number))
  const unitNumberSet = new Set(allUnits.map((u) => u.number))
  const clientCountByName = new Map<string, number>()
  for (const c of allClients) {
    const key = `${c.firstName} ${c.lastName}`.trim().toLowerCase()
    clientCountByName.set(key, (clientCountByName.get(key) || 0) + 1)
  }

  const rows: PreviewRow[] = []
  const missingUnits = new Set<string>()
  let willCreateClients = 0

  for (const v of valid) {
    const d = v.data
    const primary = d.clientNames[0]
    const key = primary.trim().toLowerCase()
    const matchCount = clientCountByName.get(key) || 0
    let clientResolution: PreviewRow['clientResolution']
    if (matchCount === 1) clientResolution = 'matched'
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

    // Cache klientów po nazwie (lower) → lista id
    const clients = await tx.client.findMany({ select: { id: true, firstName: true, lastName: true } })
    const clientIdsByName = new Map<string, string[]>()
    for (const c of clients) {
      const key = `${c.firstName} ${c.lastName}`.trim().toLowerCase()
      const arr = clientIdsByName.get(key) || []
      arr.push(c.id)
      clientIdsByName.set(key, arr)
    }

    async function resolveClientId(fullName: string, d: ContractRowData): Promise<string | null> {
      const key = fullName.trim().toLowerCase()
      const ids = clientIdsByName.get(key)
      if (ids && ids.length >= 1) return ids[0]
      if (!opts.createMissingClients) return null
      const { firstName, lastName } = nameParts(fullName)
      const created = await tx.client.create({
        data: {
          firstName,
          lastName,
          phone: d.phone,
          email: d.email,
          source: d.source,
          // status pochodny z umowy (pomaga ożywić lejek/ROI dla historii)
          status: d.status === 'PODPISANA' ? 'UMOWA' : 'REZERWACJA',
          // backfill daty leada → realny "cykl sprzedaży"
          ...(d.introducedAt ? { createdAt: d.introducedAt } : {}),
        },
        select: { id: true },
      })
      clientIdsByName.set(key, [created.id])
      clientsCreated++
      return created.id
    }

    for (const v of valid) {
      const d = v.data
      const primaryId = await resolveClientId(d.clientNames[0], d)
      if (!primaryId) {
        errors.push({ rowIndex: v.rowIndex, number: d.number, reason: `Klient "${d.clientNames[0]}" nie istnieje (tworzenie wyłączone)` })
        continue
      }

      const baseData = {
        type: d.type,
        status: d.status,
        investmentName: d.investmentName,
        clientId: primaryId,
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

      // Współkupujący (pozycje 2..n) — primary trzymamy też w ContractClient pos 1
      const allNameIds: string[] = []
      for (const name of d.clientNames) {
        const id = await resolveClientId(name, d)
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
