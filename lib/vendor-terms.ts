// Warunki umowne kontrahenta (kaucja gwarancyjna + koszty budowy).
// Zrodlo: VendorTerms (wiersz investment='' = domyslne). Fallback: legacy
// pola Vendor.defaultDepositPct / defaultBuildingCostsPct (sprzed migracji).

import { prisma } from './prisma'

export type CalcBasis = 'BRUTTO' | 'NETTO'

export type EffectiveTerms = {
  depositPct: number | null
  depositReturnMonths: number | null
  buildingCostsPct: number | null
  depositBasis: CalcBasis       // baza % kaucji (umowy bywaja od netto)
  buildingCostsBasis: CalcBasis // baza % KB — moze byc INNA niz kaucji (umowy mieszane)
  notes: string | null
  source: 'terms' | 'legacy' | null // skad wziete (null = brak jakichkolwiek warunkow)
}

const EMPTY: EffectiveTerms = { depositPct: null, depositReturnMonths: null, buildingCostsPct: null, depositBasis: 'BRUTTO', buildingCostsBasis: 'BRUTTO', notes: null, source: null }

/** Normalizacja bazy: pole per-potracenie, fallback na legacy calcBasis, default BRUTTO. */
function resolveBasis(perField: string | null | undefined, legacy: string | null | undefined): CalcBasis {
  return (perField ?? legacy) === 'NETTO' ? 'NETTO' : 'BRUTTO'
}

/** Kwota-baza do naliczen % wg warunkow umowy (netto lub brutto). */
export function termsBase(amountNet: number, amountGross: number, basis: CalcBasis): number {
  return basis === 'NETTO' ? amountNet : amountGross
}

/**
 * Efektywne warunki kontrahenta dla danej budowy.
 * Kolejnosc: wiersz VendorTerms dla budowy → wiersz domyslny ('') → legacy
 * pola vendora. Pola NIE sa mieszane miedzy poziomami — wygrywa pierwszy
 * poziom, ktory ma jakakolwiek wartosc (warunki per budowa to komplet
 * ustalen z JEDNEJ umowy, nie skladanka).
 */
export async function getEffectiveTerms(vendorId: string, investment = ''): Promise<EffectiveTerms> {
  const [rows, vendor] = await Promise.all([
    prisma.vendorTerms.findMany({ where: { vendorId, investment: { in: investment ? [investment, ''] : [''] } } }),
    prisma.vendor.findUnique({ where: { id: vendorId }, select: { defaultDepositPct: true, defaultBuildingCostsPct: true } }),
  ])
  const pick = (inv: string) => rows.find((r) => r.investment === inv)
  const chosen = (investment && pick(investment)) || pick('')
  if (chosen && (chosen.depositPct != null || chosen.depositReturnMonths != null || chosen.buildingCostsPct != null)) {
    return {
      depositPct: chosen.depositPct,
      depositReturnMonths: chosen.depositReturnMonths,
      buildingCostsPct: chosen.buildingCostsPct,
      depositBasis: resolveBasis(chosen.depositBasis, chosen.calcBasis),
      buildingCostsBasis: resolveBasis(chosen.buildingCostsBasis, chosen.calcBasis),
      notes: chosen.notes,
      source: 'terms',
    }
  }
  if (vendor && (vendor.defaultDepositPct != null || vendor.defaultBuildingCostsPct != null)) {
    return {
      depositPct: vendor.defaultDepositPct,
      depositReturnMonths: null,
      buildingCostsPct: vendor.defaultBuildingCostsPct,
      depositBasis: 'BRUTTO',
      buildingCostsBasis: 'BRUTTO',
      notes: null,
      source: 'legacy',
    }
  }
  return EMPTY
}

/** Termin zwrotu kaucji = data wystawienia FV + N miesiecy (z umowy). */
export function computeDepositReturnDate(issueDate: Date, months: number): Date {
  const d = new Date(issueDate)
  d.setMonth(d.getMonth() + months)
  return d
}
