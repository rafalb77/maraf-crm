import * as XLSX from 'xlsx'
import { prisma } from './prisma'

// =====================================================================
// Powiązanie lokali z umowami (ContractUnit) i klientami (ClientUnit)
// z eksportu lokali zawierającego kolumnę "Umowa" (numer umowy per lokal).
//
// Mapowanie po nazwach nagłówków: Numer→unitNumber, Umowa→contract,
// Klient→client. Lokal łączymy z WSZYSTKIMI umowami tego samego numeru
// bazowego (numer bez końcówki /R÷/D÷/P) — bo lokal przechodzi przez
// umowę rezerwacyjną i deweloperską tej samej transakcji.
//
// NIE tworzy lokali ani umów — tylko powiązania między istniejącymi.
// =====================================================================

const T = (v: unknown) => String(v ?? '').trim()
const norm = (v: unknown) => T(v).toLowerCase()

const HEADER_ALIASES: Record<string, 'unitNumber' | 'contract' | 'client'> = {
  numer: 'unitNumber',
  'numer lokalu': 'unitNumber',
  lokal: 'unitNumber',
  umowa: 'contract',
  klient: 'client',
}

/** Numer bazowy umowy — bez końcówki typu /R, /D, /P. */
export function baseContractNumber(num: string): string {
  return T(num).replace(/\/[RDPrdp]$/, '')
}

export type LinkPreviewRow = {
  rowIndex: number
  unitNumber: string
  contractNumbers: string[] // umowy do podpięcia (już istniejące w bazie)
  clientName: string | null
  clientResolved: boolean
}

export type LinkSkip = { rowIndex: number; unitNumber: string; reason: string }

export type UnitsLinkDiff = {
  contractLinks: { unitNumber: string; contractNumber: string }[] // nowe ContractUnit
  clientLinks: { unitNumber: string; clientName: string }[] // nowe ClientUnit
  rows: LinkPreviewRow[]
  unitNotFound: string[]
  contractNotFound: string[] // numery bazowe bez umowy w bazie
  clientNotFound: string[]
  alreadyLinkedContracts: number
  alreadyLinkedClients: number
  totalRowsInFile: number
}

export type UnitsLinkCommit = UnitsLinkDiff & {
  applied: { contractLinksCreated: number; clientLinksCreated: number }
}

type Parsed = { rowIndex: number; unitNumber: string; contractRaw: string; clientName: string | null }

function parseSheet(buffer: Buffer): Parsed[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('Plik nie zawiera żadnego arkusza')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false })
  if (rows.length < 2) throw new Error('Plik nie zawiera danych (brak wierszy poza nagłówkiem)')

  const colOf: Partial<Record<'unitNumber' | 'contract' | 'client', number>> = {}
  rows[0].forEach((h, c) => {
    const f = HEADER_ALIASES[norm(h)]
    if (f && colOf[f] === undefined) colOf[f] = c
  })
  if (colOf.unitNumber === undefined) throw new Error('Brak kolumny "Numer" (numer lokalu) w nagłówku.')
  if (colOf.contract === undefined) throw new Error('Brak kolumny "Umowa" w nagłówku.')
  const get = (r: unknown[], f: 'unitNumber' | 'contract' | 'client') =>
    colOf[f] !== undefined ? r[colOf[f]!] : ''

  const out: Parsed[] = []
  for (let i = 1; i < rows.length; i++) {
    const unitNumber = T(get(rows[i], 'unitNumber'))
    if (!unitNumber) continue
    out.push({
      rowIndex: i + 1,
      unitNumber,
      contractRaw: T(get(rows[i], 'contract')),
      clientName: colOf.client !== undefined ? T(get(rows[i], 'client')) || null : null,
    })
  }
  return out
}

export async function buildUnitsLinkDiff(buffer: Buffer): Promise<UnitsLinkDiff> {
  const parsed = parseSheet(buffer)

  const [units, contracts, clients, existingCU, existingClientU] = await Promise.all([
    prisma.unit.findMany({ select: { id: true, number: true } }),
    prisma.contract.findMany({ select: { id: true, number: true } }),
    prisma.client.findMany({ select: { id: true, firstName: true, lastName: true } }),
    prisma.contractUnit.findMany({ select: { contractId: true, unitId: true } }),
    prisma.clientUnit.findMany({ select: { clientId: true, unitId: true } }),
  ])
  const unitIdByNumber = new Map(units.map((u) => [u.number, u.id]))
  // umowy pogrupowane po numerze bazowym → [{id, number}]
  const contractsByBase = new Map<string, { id: string; number: string }[]>()
  for (const c of contracts) {
    const base = baseContractNumber(c.number)
    const arr = contractsByBase.get(base) || []
    arr.push({ id: c.id, number: c.number })
    contractsByBase.set(base, arr)
  }
  const clientIdsByName = new Map<string, string[]>()
  for (const c of clients) {
    const key = `${c.firstName} ${c.lastName}`.trim().toLowerCase()
    const arr = clientIdsByName.get(key) || []
    arr.push(c.id)
    clientIdsByName.set(key, arr)
  }
  const cuSet = new Set(existingCU.map((x) => `${x.contractId}|${x.unitId}`))
  const cliSet = new Set(existingClientU.map((x) => `${x.clientId}|${x.unitId}`))

  const contractLinks: { unitNumber: string; contractNumber: string }[] = []
  const clientLinks: { unitNumber: string; clientName: string }[] = []
  const rows: LinkPreviewRow[] = []
  const unitNotFound = new Set<string>()
  const contractNotFound = new Set<string>()
  const clientNotFound = new Set<string>()
  let alreadyLinkedContracts = 0
  let alreadyLinkedClients = 0
  const plannedCU = new Set<string>() // dedup w obrębie pliku
  const plannedCli = new Set<string>()

  for (const p of parsed) {
    const unitId = unitIdByNumber.get(p.unitNumber)
    if (!unitId) {
      unitNotFound.add(p.unitNumber)
      continue
    }

    const matchedContractNumbers: string[] = []
    if (p.contractRaw) {
      const base = baseContractNumber(p.contractRaw)
      const matches = contractsByBase.get(base) || []
      if (matches.length === 0) {
        contractNotFound.add(p.contractRaw)
      } else {
        for (const m of matches) {
          matchedContractNumbers.push(m.number)
          const key = `${m.id}|${unitId}`
          if (cuSet.has(key)) { alreadyLinkedContracts++; continue }
          if (plannedCU.has(key)) continue
          plannedCU.add(key)
          contractLinks.push({ unitNumber: p.unitNumber, contractNumber: m.number })
        }
      }
    }

    let clientResolved = false
    if (p.clientName) {
      const ids = clientIdsByName.get(p.clientName.toLowerCase())
      if (ids && ids.length === 1) {
        clientResolved = true
        const key = `${ids[0]}|${unitId}`
        if (cliSet.has(key)) alreadyLinkedClients++
        else if (!plannedCli.has(key)) {
          plannedCli.add(key)
          clientLinks.push({ unitNumber: p.unitNumber, clientName: p.clientName })
        }
      } else {
        clientNotFound.add(p.clientName) // brak lub niejednoznaczny
      }
    }

    rows.push({
      rowIndex: p.rowIndex,
      unitNumber: p.unitNumber,
      contractNumbers: matchedContractNumbers,
      clientName: p.clientName,
      clientResolved,
    })
  }

  return {
    contractLinks,
    clientLinks,
    rows,
    unitNotFound: [...unitNotFound],
    contractNotFound: [...contractNotFound],
    clientNotFound: [...clientNotFound],
    alreadyLinkedContracts,
    alreadyLinkedClients,
    totalRowsInFile: parsed.length,
  }
}

export async function commitUnitsLink(buffer: Buffer): Promise<UnitsLinkCommit> {
  const diff = await buildUnitsLinkDiff(buffer)

  let contractLinksCreated = 0
  let clientLinksCreated = 0

  await prisma.$transaction(async (tx) => {
    const units = await tx.unit.findMany({ select: { id: true, number: true } })
    const unitIdByNumber = new Map(units.map((u) => [u.number, u.id]))
    const contracts = await tx.contract.findMany({ select: { id: true, number: true } })
    const contractIdByNumber = new Map(contracts.map((c) => [c.number, c.id]))
    const clients = await tx.client.findMany({ select: { id: true, firstName: true, lastName: true } })
    const clientIdByName = new Map<string, string>()
    for (const c of clients) clientIdByName.set(`${c.firstName} ${c.lastName}`.trim().toLowerCase(), c.id)

    for (const l of diff.contractLinks) {
      const unitId = unitIdByNumber.get(l.unitNumber)
      const contractId = contractIdByNumber.get(l.contractNumber)
      if (!unitId || !contractId) continue
      await tx.contractUnit.upsert({
        where: { contractId_unitId: { contractId, unitId } },
        create: { contractId, unitId },
        update: {},
      })
      contractLinksCreated++
    }
    for (const l of diff.clientLinks) {
      const unitId = unitIdByNumber.get(l.unitNumber)
      const clientId = clientIdByName.get(l.clientName.toLowerCase())
      if (!unitId || !clientId) continue
      await tx.clientUnit.upsert({
        where: { clientId_unitId: { clientId, unitId } },
        create: { clientId, unitId },
        update: {},
      })
      clientLinksCreated++
    }
  }, { timeout: 120_000 })

  return { ...diff, applied: { contractLinksCreated, clientLinksCreated } }
}
