// Logika widoku „Rzuty pięter" + alert osieroconych komórek lokatorskich.
// Czyste funkcje bez Prisma — testowalne, używane przez stronę /rzuty
// i silnik zadań (reguła ORPHAN_KL w lib/tasks.ts).
//
// Struktura inwestycji: budynek B1, 3 klatki (A/B/C — pole Unit.building,
// np. "B1 / Klatka C"), kondygnacje 0-4. Numer lokalu koduje KONDYGNACJĘ
// (B1.2.M28 = 2 piętro), nie klatkę.

export type FloorplanUnit = {
  number: string
  type: string
  status: string
  floor: number | null
  building: string | null
}

/** Klatka z pola Unit.building ("B1 / Klatka C" → "C"); null gdy brak. */
export function staircaseOf(building: string | null): string | null {
  if (!building) return null
  const m = /klatka\s*([A-Z0-9]+)/i.exec(building)
  return m ? m[1].toUpperCase() : null
}

export type OrphanStorageAlert = {
  floor: number
  /** null = lokale bez klatki w danych — grupa obejmuje całe piętro. */
  staircase: string | null
  severity: 'alert' | 'warning'
  totalApartments: number
  freeApartments: number
  freeStorage: string[]
}

/**
 * Alert: w grupie (klatka × kondygnacja) wszystkie mieszkania sprzedane,
 * a komórki lokatorskie zostały wolne — grozi „osierocenie" komórek.
 * Warning: zostało dokładnie 1 wolne mieszkanie, a wolnych komórek jest
 * więcej niż wolnych mieszkań (ostatni kupujący nie weźmie wszystkich).
 */
export function computeOrphanStorageAlerts(units: FloorplanUnit[]): OrphanStorageAlert[] {
  type Group = { apartments: FloorplanUnit[]; storage: FloorplanUnit[] }
  const groups = new Map<string, Group>()
  const keyOf = (floor: number, st: string | null) => `${floor}|${st ?? '-'}`

  for (const u of units) {
    if (u.floor == null) continue
    if (u.type !== 'MIESZKALNY' && u.type !== 'KOMORKA') continue
    const key = keyOf(u.floor, staircaseOf(u.building))
    let g = groups.get(key)
    if (!g) {
      g = { apartments: [], storage: [] }
      groups.set(key, g)
    }
    if (u.type === 'MIESZKALNY') g.apartments.push(u)
    else g.storage.push(u)
  }

  const alerts: OrphanStorageAlert[] = []
  for (const [key, g] of groups) {
    if (g.apartments.length === 0 || g.storage.length === 0) continue
    const freeApartments = g.apartments.filter((u) => u.status === 'WOLNY' || u.status === 'ZAREZERWOWANY').length
    // NIEDOSTEPNY nie jest do sprzedania — nie wstrzymuje alertu.
    const soldAll =
      freeApartments === 0 && g.apartments.some((u) => u.status === 'SPRZEDANY')
    const freeStorage = g.storage
      .filter((u) => u.status === 'WOLNY')
      .map((u) => u.number)
      .sort((a, b) => a.localeCompare(b, 'pl', { numeric: true }))
    if (freeStorage.length === 0) continue

    const [floorStr, st] = key.split('|')
    const base = {
      floor: Number(floorStr),
      staircase: st === '-' ? null : st,
      totalApartments: g.apartments.length,
      freeApartments,
      freeStorage,
    }
    if (soldAll) {
      alerts.push({ ...base, severity: 'alert' })
    } else if (freeApartments === 1 && freeStorage.length > freeApartments) {
      alerts.push({ ...base, severity: 'warning' })
    }
  }

  const sevRank = { alert: 0, warning: 1 }
  return alerts.sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity] || a.floor - b.floor || String(a.staircase).localeCompare(String(b.staircase)),
  )
}

export function floorLabel(floor: number): string {
  return floor === 0 ? 'parter' : `${floor} piętro`
}

export function orphanAlertText(a: OrphanStorageAlert): string {
  const where = a.staircase ? `Klatka ${a.staircase}, ${floorLabel(a.floor)}` : `${floorLabel(a.floor)}`
  return a.severity === 'alert'
    ? `${where}: wszystkie mieszkania sprzedane — wolne komórki: ${a.freeStorage.join(', ')}`
    : `${where}: zostało 1 wolne mieszkanie, a wolnych komórek ${a.freeStorage.length} (${a.freeStorage.join(', ')})`
}
