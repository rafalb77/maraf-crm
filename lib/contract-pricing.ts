import { prisma } from './prisma'

/** Opłata rezerwacyjna = 1% wartości przedmiotu rezerwacji. */
export const RESERVATION_FEE_RATE = 0.01

/** 1% wartości brutto, zaokrąglone do grosza. */
export function computeReservationFee(totalGross: number): number {
  return Math.round(totalGross * RESERVATION_FEE_RATE * 100) / 100
}

export type UnitPrice = { priceNet: number; priceGross: number }

/**
 * Ustala ceny lokali dla umowy klienta: priorytet cena z OFERTY klienta
 * (OfferItem.finalGross — po rabacie), w razie braku — cena bazowa z cennika.
 * Wynik to snapshot zapisywany na ContractUnit (zamrożone kwoty umowy).
 */
export async function resolveUnitPricesForClient(
  clientId: string | null,
  unitIds: string[],
): Promise<Map<string, UnitPrice>> {
  const result = new Map<string, UnitPrice>()
  if (unitIds.length === 0) return result

  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds } },
    select: { id: true, priceNet: true, priceGross: true },
  })
  for (const u of units) result.set(u.id, { priceNet: u.priceNet, priceGross: u.priceGross })

  if (!clientId) return result

  // Pozycje ofert tego klienta dla tych lokali — wybierz najlepszą per lokal:
  // najpierw zaakceptowana, potem najnowsza. Anulowane pomijamy.
  const offerItems = await prisma.offerItem.findMany({
    where: { unitId: { in: unitIds }, offer: { clientId } },
    select: {
      unitId: true,
      finalNet: true,
      finalGross: true,
      offer: { select: { status: true, updatedAt: true } },
    },
  })
  const best = new Map<string, { score: number; time: number; net: number; gross: number }>()
  for (const it of offerItems) {
    if (!it.unitId || it.finalGross <= 0) continue
    if (it.offer.status === 'ANULOWANA') continue
    const score = it.offer.status === 'ZAAKCEPTOWANA' ? 2 : 1
    const time = it.offer.updatedAt.getTime()
    const prev = best.get(it.unitId)
    if (!prev || score > prev.score || (score === prev.score && time > prev.time)) {
      best.set(it.unitId, { score, time, net: it.finalNet, gross: it.finalGross })
    }
  }
  for (const [unitId, b] of best) {
    result.set(unitId, { priceNet: b.net, priceGross: b.gross })
  }
  return result
}

export type UnitConflict = { id: string; number: string; units: string[] }

/**
 * Dedup: czy klient ma już aktywną (niezrozwiązaną/nieanulowaną) umowę
 * zawierającą którykolwiek z podanych lokali. Zwraca kolidującą umowę lub null.
 * Blokuje tworzenie drugiej umowy na ten sam lokal dla tego samego klienta.
 */
export async function findClientUnitConflict(
  clientId: string,
  unitIds: string[],
  excludeContractId?: string,
): Promise<UnitConflict | null> {
  if (unitIds.length === 0) return null
  const conflict = await prisma.contract.findFirst({
    where: {
      clientId,
      status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] },
      ...(excludeContractId ? { id: { not: excludeContractId } } : {}),
      contractUnits: { some: { unitId: { in: unitIds } } },
    },
    select: {
      id: true,
      number: true,
      contractUnits: {
        where: { unitId: { in: unitIds } },
        select: { unit: { select: { number: true } } },
      },
    },
  })
  if (!conflict) return null
  return { id: conflict.id, number: conflict.number, units: conflict.contractUnits.map((cu) => cu.unit.number) }
}
