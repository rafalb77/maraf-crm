// Jedno źródło prawdy dla ceny lokalu wyceny „za m²".
//
// Reguła: netto lokalu = powierzchnia × stawka netto/m², a BRUTTO lokalu =
// netto lokalu × (1 + VAT) — zaokrąglane do groszy dopiero na końcu.
// Wcześniej brutto liczono jako powierzchnia × (stawka brutto/m² zaokrąglona
// do groszy), co dawało rozjazd rzędu kilku groszy wobec netto × 1,08
// (np. 40,42 m² × 8093,40 zł = 327 135,23 zł netto → 353 306,05 zł brutto,
// a stara metoda dawała 353 305,97 zł).

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function grossFromNet(net: number, vatRate: number): number {
  return round2(net * (1 + vatRate / 100))
}

export function netFromGross(gross: number, vatRate: number): number {
  return round2(gross / (1 + vatRate / 100))
}

/**
 * Brutto lokalu wg STAREGO wzoru (powierzchnia × zaokrąglona stawka brutto/m²).
 * Snapshoty umów sprzed zmiany reguły były liczone tak — różnią się od
 * bieżącego cennika o grosze. Taki snapshot to dryf zaokrągleń, nie rabat.
 */
export function legacyGrossPerSqm(area: number, pricePerSqmGross: number, fallbackGross: number): number {
  return pricePerSqmGross > 0 && area > 0 ? round2(area * pricePerSqmGross) : fallbackGross
}

/**
 * Rabat udzielony na lokalu = cennik − snapshot z umowy, ale 0 gdy snapshot
 * jest którąś z „równoważnych" cen cennikowych (bieżący cennik, cennik wg
 * starego wzoru, cennik z dnia umowy) — czyli różnica wynika ze zmiany
 * reguły liczenia albo cennika, a nie z decyzji handlowej.
 */
export function discountVsCennik(cennikGross: number, snapshotGross: number, equivalentGross: number[]): number {
  return Math.max(0, priceDeltaVsCennik(cennikGross, snapshotGross, equivalentGross))
}

/**
 * Różnica cennik − snapshot ZE ZNAKIEM: dodatnia = rabat, ujemna = dopłata
 * (cena umowna powyżej cennika, np. ujemny rabat w edytorze składników).
 * Równoważne ceny cennikowe (dryf) = 0.
 */
export function priceDeltaVsCennik(cennikGross: number, snapshotGross: number, equivalentGross: number[]): number {
  if (equivalentGross.some((g) => Math.abs(g - snapshotGross) < 0.005)) return 0
  return round2(cennikGross - snapshotGross)
}

/**
 * Ceny całkowite lokalu ze stawek za m². Gdy podano stawkę netto — to ona
 * jest źródłem; gdy tylko brutto — liczymy od brutto (netto = brutto ÷ 1,08).
 */
export function unitTotalsPerSqm(
  area: number,
  ppmNet: number,
  ppmGross: number,
  vatRate: number,
): { priceNet: number; priceGross: number } {
  if (ppmNet > 0) {
    const priceNet = round2(area * ppmNet)
    return { priceNet, priceGross: grossFromNet(priceNet, vatRate) }
  }
  const priceGross = round2(area * ppmGross)
  return { priceNet: netFromGross(priceGross, vatRate), priceGross }
}
