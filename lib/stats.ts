import { prisma } from '@/lib/prisma'

// =============================================================
// Statystyki CRM — agregacje dla strony /statystyki.
// Wszystko liczone w JS po pobraniu minimalnych pól (wolumeny CRM są małe:
// setki rekordów). Brak zależności od historii cen — używamy createdAt /
// signedAt / status, które już są w schemacie.
// =============================================================

// Kolejność etapów lejka (Client.status). Klient jest w JEDNYM statusie naraz,
// więc "lejek" budujemy jako liczbę klientów którzy OSIĄGNĘLI dany etap lub dalszy
// (atOrBeyond) — klient w UMOWA przeszedł wcześniej OFERTA/REZERWACJA.
export const FUNNEL_STAGES = ['ZAPYTANIE', 'OFERTA', 'REZERWACJA', 'UMOWA', 'ODBIOR'] as const
export type FunnelStage = (typeof FUNNEL_STAGES)[number]

export type FunnelStep = {
  stage: FunnelStage
  current: number // ilu klientów jest DOKŁADNIE w tym statusie
  atOrBeyond: number // ilu osiągnęło ten etap lub dalszy
  conversionFromPrev: number | null // % przejścia z poprzedniego etapu (null dla pierwszego)
  isBottleneck: boolean // najniższa konwersja między etapami
}

export type LeadSourceRow = {
  source: string
  total: number
  converted: number // status UMOWA lub ODBIOR
  conversion: number // converted/total (0..1)
}

export type VelocityMonth = {
  month: string // 'YYYY-MM'
  label: string // 'sie 2025'
  signed: number // umowy podpisane w miesiącu
  revenue: number // Σ valueGross podpisanych w miesiącu
  cumulativeRevenue: number
}

export type HeatmapCell = {
  floor: number
  total: number
  sold: number
  ratio: number // sold/total
}
export type HeatmapBuilding = {
  building: string
  total: number
  sold: number
  ratio: number
  cells: HeatmapCell[]
}
export type Heatmap = {
  floors: number[] // posortowane unikalne piętra (kolumny)
  buildings: HeatmapBuilding[]
}

export type CrmStats = {
  funnel: FunnelStep[]
  totalClients: number
  leadSources: LeadSourceRow[]
  velocity: VelocityMonth[]
  heatmap: Heatmap
}

const CONVERTED_STATUSES = new Set(['UMOWA', 'ODBIOR'])
const MONTH_LABELS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']

/** Budynek z pola Unit.building, a gdy puste — prefiks numeru (np. "B1.1.M3" → "B1"). */
function buildingKey(building: string | null, number: string): string {
  if (building && building.trim()) return building.trim()
  const prefix = number.split('.')[0]
  return prefix || '—'
}

export async function getCrmStats(): Promise<CrmStats> {
  const [clients, contracts, units] = await Promise.all([
    prisma.client.findMany({ select: { status: true, source: true } }),
    prisma.contract.findMany({
      where: { status: 'PODPISANA' },
      select: { signedAt: true, introducedAt: true, valueGross: true },
    }),
    prisma.unit.findMany({ select: { status: true, building: true, number: true, floor: true } }),
  ])

  const totalClients = clients.length

  // ---- Lejek + konwersja ----
  const currentByStage = new Map<string, number>()
  for (const c of clients) currentByStage.set(c.status, (currentByStage.get(c.status) || 0) + 1)

  // atOrBeyond[i] = suma current dla etapów i..koniec
  const atOrBeyond: number[] = FUNNEL_STAGES.map((_, i) =>
    FUNNEL_STAGES.slice(i).reduce((s, st) => s + (currentByStage.get(st) || 0), 0)
  )

  // Konwersje między kolejnymi etapami — do wykrycia wąskiego gardła.
  const conversions: (number | null)[] = FUNNEL_STAGES.map((_, i) => {
    if (i === 0) return null
    const prev = atOrBeyond[i - 1]
    return prev > 0 ? atOrBeyond[i] / prev : 0
  })
  // Bottleneck = najniższa niezerowa konwersja (pomijamy pierwszy etap = null).
  let minIdx = -1
  let minVal = Infinity
  conversions.forEach((cv, i) => {
    if (cv !== null && cv < minVal) {
      minVal = cv
      minIdx = i
    }
  })

  const funnel: FunnelStep[] = FUNNEL_STAGES.map((stage, i) => ({
    stage,
    current: currentByStage.get(stage) || 0,
    atOrBeyond: atOrBeyond[i],
    conversionFromPrev: conversions[i],
    isBottleneck: i === minIdx && atOrBeyond[0] > 0,
  }))

  // ---- Ranking źródeł leadów (ROI) ----
  const bySource = new Map<string, { total: number; converted: number }>()
  for (const c of clients) {
    const key = c.source?.trim() || 'Bez źródła'
    const row = bySource.get(key) || { total: 0, converted: 0 }
    row.total += 1
    if (CONVERTED_STATUSES.has(c.status)) row.converted += 1
    bySource.set(key, row)
  }
  const leadSources: LeadSourceRow[] = [...bySource.entries()]
    .map(([source, v]) => ({
      source,
      total: v.total,
      converted: v.converted,
      conversion: v.total > 0 ? v.converted / v.total : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // ---- Tempo sprzedaży (ostatnie 12 miesięcy) ----
  const now = new Date()
  const buckets: VelocityMonth[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    buckets.push({
      month: key,
      label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
      signed: 0,
      revenue: 0,
      cumulativeRevenue: 0,
    })
  }
  const bucketByKey = new Map(buckets.map((b) => [b.month, b]))
  for (const ct of contracts) {
    const when = ct.signedAt ?? ct.introducedAt
    if (!when) continue
    const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`
    const b = bucketByKey.get(key)
    if (!b) continue // starsze niż 12 mc — pomijamy
    b.signed += 1
    b.revenue += ct.valueGross ?? 0
  }
  let cum = 0
  for (const b of buckets) {
    cum += b.revenue
    b.cumulativeRevenue = cum
  }

  // ---- Heatmapa budynek × piętro ----
  const floorsSet = new Set<number>()
  const byBuilding = new Map<string, Map<number, { total: number; sold: number }>>()
  for (const u of units) {
    const bld = buildingKey(u.building, u.number)
    const floor = u.floor ?? 0
    floorsSet.add(floor)
    if (!byBuilding.has(bld)) byBuilding.set(bld, new Map())
    const floors = byBuilding.get(bld)!
    const cell = floors.get(floor) || { total: 0, sold: 0 }
    cell.total += 1
    if (u.status === 'SPRZEDANY') cell.sold += 1
    floors.set(floor, cell)
  }
  const floors = [...floorsSet].sort((a, b) => a - b)
  const buildings: HeatmapBuilding[] = [...byBuilding.entries()]
    .map(([building, floorMap]) => {
      let total = 0
      let sold = 0
      const cells: HeatmapCell[] = floors.map((f) => {
        const c = floorMap.get(f) || { total: 0, sold: 0 }
        total += c.total
        sold += c.sold
        return { floor: f, total: c.total, sold: c.sold, ratio: c.total > 0 ? c.sold / c.total : 0 }
      })
      return { building, total, sold, ratio: total > 0 ? sold / total : 0, cells }
    })
    .sort((a, b) => a.building.localeCompare(b.building, 'pl', { numeric: true }))

  return {
    funnel,
    totalClients,
    leadSources,
    velocity: buckets,
    heatmap: { floors, buildings },
  }
}
