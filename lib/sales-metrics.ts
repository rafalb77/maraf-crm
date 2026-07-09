import { prisma } from './prisma'

const BINDING = ['DEWELOPERSKA', 'PRZENIESIENIA'] as const
const STAGE_RANK: Record<string, number> = { REZERWACYJNA: 1, DEWELOPERSKA: 2, PRZENIESIENIA: 3 }

/**
 * Wartość sprzedaży — JEDNO źródło prawdy dla pulpitu i modułu Sprzedaż.
 *
 * Sprzedaż = lokale o statusie SPRZEDANY (czyli objęte umową wiążącą:
 * deweloperską lub przeniesienia). Cena = snapshot z tej umowy (po rabacie),
 * fallback cena bazowa lokalu. Każdy lokal liczony DOKŁADNIE RAZ, więc
 * rezerwacyjna + deweloperska tej samej transakcji nie dublują wartości.
 */
export async function getSalesValue(): Promise<{
  total: number
  residential: number
  soldCount: number
  residentialCount: number
}> {
  const soldUnits = await prisma.unit.findMany({
    where: { status: 'SPRZEDANY' },
    select: {
      id: true,
      type: true,
      priceGross: true,
      contractUnits: {
        where: { contract: { type: { in: [...BINDING] } } },
        select: { priceGross: true, contract: { select: { type: true } } },
      },
    },
  })

  let total = 0
  let residential = 0
  let residentialCount = 0
  for (const u of soldUnits) {
    // Cena sprzedaży = snapshot z umowy wiążącej najdalszego etapu; fallback cennik.
    const cu = [...u.contractUnits].sort(
      (a, b) => (STAGE_RANK[b.contract.type] || 0) - (STAGE_RANK[a.contract.type] || 0),
    )[0]
    const price = cu?.priceGross ?? u.priceGross ?? 0
    total += price
    if (u.type === 'MIESZKALNY') {
      residential += price
      residentialCount++
    }
  }
  return { total, residential, soldCount: soldUnits.length, residentialCount }
}
