import { prisma } from '@/lib/prisma'

// Log zmian ceny/statusu lokalu do modelu PriceHistory. Zrodlo daty "od ktorej
// obowiazuje oferta" w raporcie dane.gov.pl. Model wspolny z integracja 3D Estate.

type PriceSnapshot = {
  pricePerSqmNet: number
  pricePerSqmGross: number
  priceNet: number
  priceGross: number
  status: string
}

// Zapisuje wpis historii bezwarunkowo (np. przy tworzeniu lokalu).
export async function recordPriceHistory(unitId: string, snap: PriceSnapshot): Promise<void> {
  await prisma.priceHistory.create({ data: { unitId, ...snap } })
}

// Zapisuje wpis tylko jesli cena lub status faktycznie sie zmienily wzgledem
// stanu `before`. Wywolywac przy edycji lokalu — `before` to stan sprzed update'u.
export async function recordPriceHistoryIfChanged(
  unitId: string,
  before: PriceSnapshot,
  after: PriceSnapshot,
): Promise<void> {
  const changed =
    before.pricePerSqmNet !== after.pricePerSqmNet ||
    before.pricePerSqmGross !== after.pricePerSqmGross ||
    before.priceNet !== after.priceNet ||
    before.priceGross !== after.priceGross ||
    before.status !== after.status
  if (changed) await recordPriceHistory(unitId, after)
}
