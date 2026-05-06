import * as XLSX from 'xlsx'
import { prisma } from './prisma'
import type { UnitType, UnitStatus } from './types'

// =====================================================================
// Format pliku xlsx (eksport CRM):
//   A=Numer, B=Typ lokalu, C=Status, D=Klient, E=Kolejka,
//   F=Budynek, G=Klatka, H=Kondygnacja, I=Pokoje, J=Pietro,
//   K=Powierzchnia, L=Cena/m2 brutto, M=Cena brutto, N=Cechy, O=Umowa
// =====================================================================

const COL = {
  number: 0,
  typeLabel: 1,
  status: 2,
  client: 3,
  building: 5,
  klatka: 6,
  kondygnacja: 7,
  area: 10,
  priceGross: 12,
} as const

const TYPE_MAP: Record<string, UnitType> = {
  'Lokal mieszkalny': 'MIESZKALNY',
  'Lokal usługowy': 'USLUGOWY',
  'Miejsce postojowe': 'PARKING',
  'Miejsce garażowe': 'GARAZ',
  'Komórka lokatorska': 'KOMORKA',
}

const STATUS_MAP: Record<string, UnitStatus> = {
  Wolny: 'WOLNY',
  Sprzedany: 'SPRZEDANY',
  Rezerwacja: 'ZAREZERWOWANY',
  'Wyłączony ze sprzedaży': 'NIEDOSTEPNY',
}

// VAT 8% dla wszystkich (per business rule)
const VAT_RATE = 8
// Cena/m² liczona tylko dla typów które mają sens m² (nie parking/garaż)
const PER_SQM_TYPES = new Set<UnitType>(['MIESZKALNY', 'USLUGOWY', 'KOMORKA'])

const round2 = (n: number) => Math.round(n * 100) / 100

// =====================================================================
// Typy publiczne — użyte przez API i UI
// =====================================================================

export type ImportOptions = {
  syncStatusAndClients: boolean
}

export type UnitData = {
  number: string
  type: UnitType
  area: number
  pricePerSqmNet: number
  pricePerSqmGross: number
  priceNet: number
  priceGross: number
  vatRate: number
  floor: number | null
  building: string | null
  // Te pola tylko gdy syncStatusAndClients = true:
  status?: UnitStatus
  clientNames?: string[]
}

export type NewRow = {
  rowIndex: number
  data: UnitData
}

export type UpdateRow = {
  rowIndex: number
  number: string
  changes: Record<string, { old: unknown; new: unknown }>
  data: UnitData
}

export type SkipRow = {
  rowIndex: number
  number: string
  reason: string
}

export type DeleteRow = {
  id: string
  number: string
  type: string
  area: number
  priceGross: number
  isProtected: boolean
  protectedReasons: string[]
}

export type ClientAssignmentPreview = {
  unitNumber: string
  clientName: string
  resolvedClientId: string | null
  alreadyAssigned: boolean
}

export type UnresolvedClient = {
  unitNumber: string
  clientName: string
}

export type DiffResult = {
  newRows: NewRow[]
  updateRows: UpdateRow[]
  skipRows: SkipRow[]
  deleteRows: DeleteRow[]
  clientAssignments: ClientAssignmentPreview[]
  unresolvedClients: UnresolvedClient[]
  totalRowsInFile: number
}

export type CommitResult = DiffResult & {
  applied: {
    created: number
    updated: number
    deleted: number
    skipped: number
    protectedKept: number
    clientsAssigned: number
  }
}

// =====================================================================
// Parser xlsx → "raw" UnitData per wiersz, plus skip-rows
// =====================================================================

function normalizeBuilding(buildingNum: unknown, klatka: unknown): string | null {
  const parts: string[] = []
  if (buildingNum !== null && buildingNum !== undefined && String(buildingNum).trim() !== '') {
    parts.push(`B${String(buildingNum).trim()}`)
  }
  if (klatka !== null && klatka !== undefined && String(klatka).trim() !== '') {
    parts.push(`Klatka ${String(klatka).trim()}`)
  }
  return parts.length ? parts.join(' / ') : null
}

function parseFloor(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  return Number.isFinite(n) ? n : null
}

function parseClientNames(raw: unknown): string[] {
  const s = String(raw || '').trim()
  if (!s) return []
  return s
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
}

type ParsedRow = { rowIndex: number; data: UnitData } | { rowIndex: number; skip: SkipRow }

function parseSheet(buffer: Buffer, opts: ImportOptions): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('Plik nie zawiera żadnego arkusza')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })

  const result: ParsedRow[] = []
  // Pomijamy nagłówek (row 0). Indeks wiersza w arkuszu = idx + 1.
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const rowIndex = i + 1 // 1-based wiersz w Excelu (z nagłówkiem)

    const number = String(r[COL.number] || '').trim()
    if (!number) continue // pomiń puste wiersze (np. trailing)

    const typeLabel = String(r[COL.typeLabel] || '').trim()
    const type = TYPE_MAP[typeLabel]
    if (!type) {
      result.push({
        rowIndex,
        skip: { rowIndex, number, reason: `Nieznany typ lokalu: "${typeLabel}"` },
      })
      continue
    }

    const area = parseFloat(String(r[COL.area] || '0')) || 0
    const priceGross = parseFloat(String(r[COL.priceGross] || '0')) || 0
    if (priceGross <= 0) {
      result.push({
        rowIndex,
        skip: { rowIndex, number, reason: 'Brak/niepoprawna cena brutto' },
      })
      continue
    }

    const priceNet = round2(priceGross / (1 + VAT_RATE / 100))
    const ppmGross =
      PER_SQM_TYPES.has(type) && area > 0 ? round2(priceGross / area) : 0
    const ppmNet = PER_SQM_TYPES.has(type) && area > 0 ? round2(priceNet / area) : 0

    const data: UnitData = {
      number,
      type,
      area,
      pricePerSqmNet: ppmNet,
      pricePerSqmGross: ppmGross,
      priceNet,
      priceGross,
      vatRate: VAT_RATE,
      floor: parseFloor(r[COL.kondygnacja]),
      building: normalizeBuilding(r[COL.building], r[COL.klatka]),
    }

    if (opts.syncStatusAndClients) {
      const statusLabel = String(r[COL.status] || '').trim()
      const status = STATUS_MAP[statusLabel]
      if (status) data.status = status
      data.clientNames = parseClientNames(r[COL.client])
    }

    result.push({ rowIndex, data })
  }
  return result
}

// =====================================================================
// Diff i commit
// =====================================================================

const FIELD_LABELS: Record<keyof UnitData, string> = {
  number: 'Numer',
  type: 'Typ',
  area: 'Powierzchnia',
  pricePerSqmNet: 'Cena/m² netto',
  pricePerSqmGross: 'Cena/m² brutto',
  priceNet: 'Cena netto',
  priceGross: 'Cena brutto',
  vatRate: 'VAT',
  floor: 'Kondygnacja',
  building: 'Budynek/Klatka',
  status: 'Status',
  clientNames: 'Klienci',
}

const COMPARE_FIELDS: (keyof UnitData)[] = [
  'type',
  'area',
  'pricePerSqmNet',
  'pricePerSqmGross',
  'priceNet',
  'priceGross',
  'floor',
  'building',
]

function diffFields(
  fromXlsx: UnitData,
  inDb: { [k: string]: unknown },
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {}
  for (const f of COMPARE_FIELDS) {
    const newVal = (fromXlsx as Record<string, unknown>)[f]
    const oldVal = inDb[f]
    // Floats: porównuj z tolerancją 0.01
    if (typeof newVal === 'number' && typeof oldVal === 'number') {
      if (Math.abs(newVal - oldVal) > 0.01) {
        changes[FIELD_LABELS[f] || f] = { old: oldVal, new: newVal }
      }
    } else if (newVal !== oldVal) {
      changes[FIELD_LABELS[f] || f] = { old: oldVal ?? null, new: newVal ?? null }
    }
  }
  return changes
}

export async function buildDiff(
  buffer: Buffer,
  opts: ImportOptions,
): Promise<DiffResult> {
  const parsed = parseSheet(buffer, opts)

  const skipRows: SkipRow[] = []
  const numbersInFile = new Set<string>()
  const validRows: { rowIndex: number; data: UnitData }[] = []
  for (const p of parsed) {
    if ('skip' in p) skipRows.push(p.skip)
    else {
      if (numbersInFile.has(p.data.number)) {
        skipRows.push({
          rowIndex: p.rowIndex,
          number: p.data.number,
          reason: 'Duplikat numeru w pliku xlsx',
        })
        continue
      }
      numbersInFile.add(p.data.number)
      validRows.push(p)
    }
  }

  // Pobierz wszystkie istniejące lokale jednym zapytaniem
  const existing = await prisma.unit.findMany({
    select: {
      id: true,
      number: true,
      type: true,
      area: true,
      pricePerSqmNet: true,
      pricePerSqmGross: true,
      priceNet: true,
      priceGross: true,
      vatRate: true,
      floor: true,
      building: true,
      status: true,
      // Relacje "w użyciu" — zliczamy żeby ustalić "chronione"
      contractUnits: { select: { id: true }, take: 1 },
      clientUnits: { select: { clientId: true } },
      serviceRequests: { select: { id: true }, take: 1 },
      offerItems: { select: { id: true }, take: 1 },
    },
  })
  const existingByNumber = new Map(existing.map((u) => [u.number, u]))

  const newRows: NewRow[] = []
  const updateRows: UpdateRow[] = []

  for (const v of validRows) {
    const exist = existingByNumber.get(v.data.number)
    if (!exist) {
      newRows.push({ rowIndex: v.rowIndex, data: v.data })
      continue
    }
    const changes = diffFields(v.data, exist)
    if (opts.syncStatusAndClients) {
      if (v.data.status && v.data.status !== exist.status) {
        changes[FIELD_LABELS.status!] = { old: exist.status, new: v.data.status }
      }
    }
    if (Object.keys(changes).length > 0) {
      updateRows.push({ rowIndex: v.rowIndex, number: v.data.number, changes, data: v.data })
    }
  }

  // Lokale w bazie których nie ma w pliku → kandydaci do usunięcia
  const deleteRows: DeleteRow[] = []
  for (const exist of existing) {
    if (numbersInFile.has(exist.number)) continue
    const reasons: string[] = []
    if (exist.contractUnits.length) reasons.push('w umowie')
    if (exist.clientUnits.length) reasons.push('przypisany do klienta')
    if (exist.serviceRequests.length) reasons.push('ma zgłoszenie serwisowe')
    if (exist.offerItems.length) reasons.push('w ofercie')
    deleteRows.push({
      id: exist.id,
      number: exist.number,
      type: exist.type,
      area: exist.area,
      priceGross: exist.priceGross,
      isProtected: reasons.length > 0,
      protectedReasons: reasons,
    })
  }

  // Klienci do przypisania (gdy włączone)
  const clientAssignments: ClientAssignmentPreview[] = []
  const unresolvedClients: UnresolvedClient[] = []

  if (opts.syncStatusAndClients) {
    // Zbierz wszystkie unikatowe (firstName, lastName) z xlsx
    const wantedClients = new Set<string>()
    const rowToNames: { unitNumber: string; names: string[] }[] = []
    for (const v of validRows) {
      const names = v.data.clientNames || []
      if (names.length === 0) continue
      rowToNames.push({ unitNumber: v.data.number, names })
      for (const name of names) wantedClients.add(name)
    }

    // Wyszukaj wszystkich w bazie po imieniu+nazwisku (jednym zapytaniem)
    const queries = Array.from(wantedClients).map((fullName) => {
      const parts = fullName.split(/\s+/)
      const firstName = parts[0] || ''
      const lastName = parts.slice(1).join(' ') || ''
      return { firstName, lastName, fullName }
    })
    const matched = await prisma.client.findMany({
      where: {
        OR: queries.map((q) => ({ firstName: q.firstName, lastName: q.lastName })),
      },
      select: { id: true, firstName: true, lastName: true },
    })
    const matchedByName = new Map<string, string>()
    for (const c of matched) {
      matchedByName.set(`${c.firstName} ${c.lastName}`.trim(), c.id)
    }

    // Już istniejące przypisania (żeby nie pokazywać "do dodania" dla istniejących)
    const existingAssignments = new Map<string, Set<string>>() // unitNumber → Set<clientId>
    for (const u of existing) {
      existingAssignments.set(u.number, new Set(u.clientUnits.map((cu) => cu.clientId)))
    }

    for (const r of rowToNames) {
      const already = existingAssignments.get(r.unitNumber) || new Set()
      for (const name of r.names) {
        const clientId = matchedByName.get(name) || null
        if (!clientId) {
          unresolvedClients.push({ unitNumber: r.unitNumber, clientName: name })
          continue
        }
        clientAssignments.push({
          unitNumber: r.unitNumber,
          clientName: name,
          resolvedClientId: clientId,
          alreadyAssigned: already.has(clientId),
        })
      }
    }
  }

  return {
    newRows,
    updateRows,
    skipRows,
    deleteRows,
    clientAssignments,
    unresolvedClients,
    totalRowsInFile: validRows.length + skipRows.length,
  }
}

export async function commitImport(
  buffer: Buffer,
  opts: ImportOptions,
): Promise<CommitResult> {
  const diff = await buildDiff(buffer, opts)

  let created = 0
  let updated = 0
  let deleted = 0
  let protectedKept = 0
  let clientsAssigned = 0

  await prisma.$transaction(async (tx) => {
    // 1. Usuń te które nie są chronione
    for (const d of diff.deleteRows) {
      if (d.isProtected) {
        protectedKept++
        continue
      }
      await tx.unit.delete({ where: { id: d.id } })
      deleted++
    }

    // 2. Utwórz nowe
    for (const n of diff.newRows) {
      const createData: Record<string, unknown> = {
        number: n.data.number,
        type: n.data.type,
        area: n.data.area,
        pricePerSqmNet: n.data.pricePerSqmNet,
        pricePerSqmGross: n.data.pricePerSqmGross,
        priceNet: n.data.priceNet,
        priceGross: n.data.priceGross,
        vatRate: n.data.vatRate,
        floor: n.data.floor,
        building: n.data.building,
        // Status dla NOWYCH:
        // - jeśli sync włączony i xlsx ma rozpoznany status → użyj go
        // - inaczej domyślnie WOLNY
        status: opts.syncStatusAndClients && n.data.status ? n.data.status : 'WOLNY',
      }
      await tx.unit.create({ data: createData as never })
      created++
    }

    // 3. Aktualizuj istniejące
    for (const u of diff.updateRows) {
      const updateData: Record<string, unknown> = {
        type: u.data.type,
        area: u.data.area,
        pricePerSqmNet: u.data.pricePerSqmNet,
        pricePerSqmGross: u.data.pricePerSqmGross,
        priceNet: u.data.priceNet,
        priceGross: u.data.priceGross,
        vatRate: u.data.vatRate,
        floor: u.data.floor,
        building: u.data.building,
      }
      if (opts.syncStatusAndClients && u.data.status) {
        updateData.status = u.data.status
      }
      await tx.unit.update({ where: { number: u.data.number }, data: updateData as never })
      updated++
    }

    // 4. Przypisania klientów (tylko dodajemy brakujące, nie usuwamy istniejących)
    if (opts.syncStatusAndClients) {
      const numberToId = new Map<string, string>()
      const allUnits = await tx.unit.findMany({
        where: { number: { in: diff.clientAssignments.map((c) => c.unitNumber) } },
        select: { id: true, number: true },
      })
      for (const u of allUnits) numberToId.set(u.number, u.id)

      for (const a of diff.clientAssignments) {
        if (a.alreadyAssigned || !a.resolvedClientId) continue
        const unitId = numberToId.get(a.unitNumber)
        if (!unitId) continue
        // upsert na unique [clientId, unitId]
        await tx.clientUnit.upsert({
          where: {
            clientId_unitId: { clientId: a.resolvedClientId, unitId },
          },
          create: { clientId: a.resolvedClientId, unitId },
          update: {},
        })
        clientsAssigned++
      }
    }
  })

  return {
    ...diff,
    applied: {
      created,
      updated,
      deleted,
      skipped: diff.skipRows.length,
      protectedKept,
      clientsAssigned,
    },
  }
}
