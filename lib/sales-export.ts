// =====================================================================
// Zestawienie sprzedaży dla banku: podpisane umowy DEWELOPERSKIE w okresie
// (wg daty podpisania etapu deweloperskiego) z nabywcami, lokalami, ceną
// i subrachunkiem OMRP. Czyste funkcje (bez Prisma) — testowalne; zapytanie
// i XLSX składa app/api/sales/export/route.ts.
// =====================================================================

import { UNIT_TYPE_LABELS, type UnitType } from './types'

export type ExportBuyer = {
  firstName: string
  lastName: string
  pesel: string | null
  address: string | null
  zipCode: string | null
  city: string | null
}

export type ExportContract = {
  number: string
  investmentName: string
  type: string
  status: string
  signedAt: Date | null
  valueNet: number | null
  valueGross: number | null
  escrowSubaccount: string | null
  client: ExportBuyer
  contractClients: { position: number; client: ExportBuyer }[]
  stages: { stage: string; status: string; number: string | null; signedAt: Date | null }[]
  contractUnits: {
    priceGross: number | null
    priceNet: number | null
    unit: { number: string; type: string; area: number; escrowSubaccount: string | null; priceGross: number; priceNet: number }
  }[]
  payments: { status: string; plannedAmount: number; paidAmount: number | null }[]
}

export type ExportOptions = { withPesel: boolean; withAddress: boolean }

const MAIN_UNIT_TYPES = new Set(['MIESZKALNY', 'USLUGOWY'])

/** Data podpisania umowy deweloperskiej: etap DEWELOPERSKA, fallback Contract.signedAt. */
export function developerSignedAt(c: ExportContract): Date | null {
  const st = c.stages.find((s) => s.stage === 'DEWELOPERSKA')
  return st?.signedAt ?? c.signedAt ?? null
}

/** Numer aktu / repertorium etapu deweloperskiego. */
export function developerActNumber(c: ExportContract): string {
  return c.stages.find((s) => s.stage === 'DEWELOPERSKA')?.number ?? ''
}

/**
 * Czy umowa wchodzi do zestawienia: podpisany etap deweloperski (wiersz
 * ContractStage albo legacy: type=DEWELOPERSKA i status PODPISANA), data
 * podpisania w okresie [from, to], umowa nie rozwiązana/anulowana.
 */
export function isSignedDeveloperContractInPeriod(c: ExportContract, from: Date, to: Date): boolean {
  if (c.status === 'ROZWIAZANA' || c.status === 'ANULOWANA') return false
  const st = c.stages.find((s) => s.stage === 'DEWELOPERSKA')
  const signedStage = st ? st.status === 'PODPISANA' : c.type === 'DEWELOPERSKA' && c.status === 'PODPISANA'
  if (!signedStage) return false
  const d = developerSignedAt(c)
  if (!d) return false
  return d.getTime() >= from.getTime() && d.getTime() <= to.getTime()
}

export function buyersOf(c: ExportContract): ExportBuyer[] {
  const co = [...c.contractClients].sort((a, b) => a.position - b.position).map((cc) => cc.client)
  return [c.client, ...co]
}

export function buyerName(b: ExportBuyer): string {
  return `${b.firstName} ${b.lastName}`.replace(/\s+/g, ' ').trim()
}

export function buyerAddress(b: ExportBuyer): string {
  const line2 = [b.zipCode, b.city].filter(Boolean).join(' ')
  return [b.address, line2].filter(Boolean).join(', ')
}

export function contractGross(c: ExportContract): number {
  return c.valueGross ?? c.contractUnits.reduce((s, cu) => s + (cu.priceGross ?? cu.unit.priceGross ?? 0), 0)
}

export function contractNet(c: ExportContract): number | null {
  if (c.valueNet != null) return c.valueNet
  const nets = c.contractUnits.map((cu) => cu.priceNet ?? cu.unit.priceNet ?? null)
  if (nets.some((n) => n == null)) return null
  return nets.reduce((s, n) => s + (n as number), 0)
}

export function escrowSubaccountOf(c: ExportContract): string {
  if (c.escrowSubaccount) return c.escrowSubaccount
  const main = c.contractUnits.find((cu) => MAIN_UNIT_TYPES.has(cu.unit.type) && cu.unit.escrowSubaccount)
  return main?.unit.escrowSubaccount ?? c.contractUnits.find((cu) => cu.unit.escrowSubaccount)?.unit.escrowSubaccount ?? ''
}

export function formatDatePl(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function unitLabel(u: { number: string; type: string }): string {
  const label = UNIT_TYPE_LABELS[u.type as UnitType]
  return label ? `${u.number} (${label.toLowerCase()})` : u.number
}

/** Arkusz 1: jeden wiersz na umowę. Klucze = nagłówki kolumn w XLSX. */
export function buildContractRows(contracts: ExportContract[], opts: ExportOptions): Record<string, string | number>[] {
  const sorted = [...contracts].sort((a, b) => {
    const da = developerSignedAt(a)?.getTime() ?? 0
    const db = developerSignedAt(b)?.getTime() ?? 0
    return da - db || a.number.localeCompare(b.number, 'pl')
  })
  return sorted.map((c, i) => {
    const buyers = buyersOf(c)
    const mainUnits = c.contractUnits.filter((cu) => MAIN_UNIT_TYPES.has(cu.unit.type))
    const otherUnits = c.contractUnits.filter((cu) => !MAIN_UNIT_TYPES.has(cu.unit.type))
    const paid = c.payments.filter((p) => p.status === 'OPLACONA').reduce((s, p) => s + (p.paidAmount ?? p.plannedAmount), 0)
    const planned = c.payments.reduce((s, p) => s + p.plannedAmount, 0)
    const net = contractNet(c)
    const row: Record<string, string | number> = {
      'Lp.': i + 1,
      'Nr umowy': c.number,
      'Data podpisania': formatDatePl(developerSignedAt(c)),
      'Nr aktu (rep.)': developerActNumber(c),
      Nabywcy: buyers.map(buyerName).join('; '),
    }
    if (opts.withPesel) row['PESEL'] = buyers.map((b) => b.pesel || '—').join('; ')
    if (opts.withAddress) row['Adres'] = buyers.map((b) => buyerAddress(b) || '—').join('; ')
    row['Inwestycja'] = c.investmentName
    row['Lokal'] = mainUnits.map((cu) => cu.unit.number).join(', ')
    row['Pow. lokalu [m²]'] = round2(mainUnits.reduce((s, cu) => s + (cu.unit.area || 0), 0))
    row['Pomieszczenia przynależne / miejsca'] = otherUnits.map((cu) => unitLabel(cu.unit)).join(', ')
    row['Cena brutto [zł]'] = round2(contractGross(c))
    row['Cena netto [zł]'] = net != null ? round2(net) : ''
    row['Subrachunek OMRP'] = escrowSubaccountOf(c)
    row['Raty w harmonogramie'] = c.payments.length
    row['Harmonogram [zł]'] = round2(planned)
    row['Wpłacono [zł]'] = round2(paid)
    return row
  })
}

/** Arkusz 2: jeden wiersz na nabywcę (bank zakłada subrachunki per osoba). */
export function buildBuyerRows(contracts: ExportContract[], opts: ExportOptions): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = []
  const sorted = [...contracts].sort((a, b) => (developerSignedAt(a)?.getTime() ?? 0) - (developerSignedAt(b)?.getTime() ?? 0))
  for (const c of sorted) {
    const mainUnits = c.contractUnits.filter((cu) => MAIN_UNIT_TYPES.has(cu.unit.type))
    buyersOf(c).forEach((b, idx) => {
      const row: Record<string, string | number> = {
        'Lp.': rows.length + 1,
        'Nr umowy': c.number,
        'Data podpisania': formatDatePl(developerSignedAt(c)),
        Nabywca: buyerName(b),
        Rola: idx === 0 ? 'nabywca' : 'współnabywca',
      }
      if (opts.withPesel) row['PESEL'] = b.pesel || ''
      if (opts.withAddress) row['Adres'] = buyerAddress(b)
      row['Lokal'] = mainUnits.map((cu) => cu.unit.number).join(', ')
      row['Subrachunek OMRP'] = escrowSubaccountOf(c)
      rows.push(row)
    })
  }
  return rows
}
