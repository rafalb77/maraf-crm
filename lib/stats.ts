import { prisma } from '@/lib/prisma'
import { UNIT_TYPE_LABELS, type UnitType } from '@/lib/types'

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

export type Delta = { current: number; prev: number; changePct: number | null; spark: number[] }
export type Momentum = {
  monthLabel: string
  leads: Delta
  signed: Delta
  revenue: Delta
}

export type CrmStats = {
  funnel: FunnelStep[]
  totalClients: number
  leadSources: LeadSourceRow[]
  velocity: VelocityMonth[]
  heatmap: Heatmap
  momentum: Momentum
}

const CONVERTED_STATUSES = new Set(['UMOWA', 'ODBIOR'])
const MONTH_LABELS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000)
}

/** Etykieta mieszkania wg liczby pokoi. Brak/0 pokoi → grupa zbiorcza. */
function roomsLabel(rooms: number | null): string {
  if (!rooms || rooms < 1) return 'Mieszkanie (bez liczby pokoi)'
  return `Mieszkanie ${rooms}-pokojowe`
}

function changePct(current: number, prev: number): number | null {
  if (prev === 0) return current > 0 ? null : 0 // null = "nowość" (brak bazy), wyświetlamy jako —
  return (current - prev) / prev
}

/** Budynek z pola Unit.building, a gdy puste — prefiks numeru (np. "B1.1.M3" → "B1"). */
function buildingKey(building: string | null, number: string): string {
  if (building && building.trim()) return building.trim()
  const prefix = number.split('.')[0]
  return prefix || '—'
}

export async function getCrmStats(): Promise<CrmStats> {
  const [clients, contracts, units] = await Promise.all([
    prisma.client.findMany({ select: { status: true, source: true, createdAt: true } }),
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
  // ---- Momentum: bieżący miesiąc vs poprzedni + sparkline 6 mc ----
  // Leady per miesiąc z client.createdAt (te same 12 bucketów co velocity).
  const leadsByKey = new Map(buckets.map((b) => [b.month, 0]))
  for (const c of clients) {
    const key = monthKey(c.createdAt)
    if (leadsByKey.has(key)) leadsByKey.set(key, (leadsByKey.get(key) || 0) + 1)
  }
  const leadsSeries = buckets.map((b) => leadsByKey.get(b.month) || 0)
  const signedSeries = buckets.map((b) => b.signed)
  const revenueSeries = buckets.map((b) => b.revenue)
  const last = buckets.length - 1
  const mkDelta = (series: number[]): Delta => ({
    current: series[last] ?? 0,
    prev: series[last - 1] ?? 0,
    changePct: changePct(series[last] ?? 0, series[last - 1] ?? 0),
    spark: series.slice(-6),
  })
  const momentum: Momentum = {
    monthLabel: buckets[last]?.label ?? '',
    leads: mkDelta(leadsSeries),
    signed: mkDelta(signedSeries),
    revenue: mkDelta(revenueSeries),
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
    momentum,
  }
}

// =============================================================
// Insighty (paczka #2) — cykl sprzedaży, czas do sprzedaży per typ,
// leady do odgrzania, prognoza pipeline, puls aktywności.
// =============================================================

export type CycleStats = {
  overallMedianDays: number
  sampleSize: number
  bySource: { source: string; medianDays: number; count: number }[]
}

// Mieszkania rozbijane po liczbie pokoi (1-pok., 2-pok., …); pozostałe typy
// grupowane po typie lokalu. `key` = stabilny klucz mapy/React, `label` gotowy do wyświetlenia.
export type TimeToSaleRow = { key: string; label: string; soldCount: number; medianDays: number }

export type StaleLead = {
  id: string
  name: string
  status: string
  daysSinceTouch: number
  lastTouch: Date
}

export type Pipeline = {
  prepContractsValue: number
  prepContractsCount: number
  sentOffersValue: number
  sentOffersCount: number
  weightedForecast: number
}

export type ActivityMonth = {
  label: string
  NOTATKA: number
  TELEFON: number
  EMAIL: number
  SPOTKANIE: number
  DOKUMENT: number
}

export type CrmInsights = {
  cycle: CycleStats
  timeToSale: TimeToSaleRow[]
  staleLeads: StaleLead[]
  pipeline: Pipeline
  activity: ActivityMonth[]
}

// Wagi prognozy pipeline (dokumentowane, do strojenia). Umowa w przygotowaniu
// jest bliżej finalizacji niż świeżo wysłana oferta.
const PREP_CONTRACT_WEIGHT = 0.6
const SENT_OFFER_WEIGHT = 0.25

// Próg "leadu do odgrzania" — brak kontaktu od tylu dni.
export const STALE_LEAD_DAYS = 21
const STALE_LEAD_STATUSES = ['ZAPYTANIE', 'OFERTA', 'REZERWACJA']
const ACTIVITY_TYPES = ['NOTATKA', 'TELEFON', 'EMAIL', 'SPOTKANIE', 'DOKUMENT'] as const

export async function getCrmInsights(): Promise<CrmInsights> {
  const now = new Date()

  const [signedContracts, prepContracts, sentOffers, leadClients, activities] = await Promise.all([
    prisma.contract.findMany({
      where: { status: 'PODPISANA', signedAt: { not: null } },
      select: {
        signedAt: true,
        client: { select: { createdAt: true, source: true } },
        contractUnits: { select: { unit: { select: { type: true, rooms: true, createdAt: true } } } },
      },
    }),
    prisma.contract.findMany({
      where: { status: 'W_PRZYGOTOWANIU' },
      select: { valueGross: true },
    }),
    prisma.offer.findMany({ where: { status: 'WYSLANA' }, select: { totalGross: true } }),
    prisma.client.findMany({
      where: { status: { in: STALE_LEAD_STATUSES } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        activities: { select: { date: true }, orderBy: { date: 'desc' }, take: 1 },
      },
    }),
    prisma.activity.findMany({ select: { date: true, type: true } }),
  ])

  // ---- Cykl sprzedaży: dni od client.createdAt do contract.signedAt ----
  const cycleDays: number[] = []
  const cycleBySource = new Map<string, number[]>()
  for (const ct of signedContracts) {
    if (!ct.signedAt || !ct.client) continue
    const d = daysBetween(ct.signedAt, ct.client.createdAt)
    if (d < 0) continue // dane niespójne (umowa przed dodaniem klienta) — pomijamy
    cycleDays.push(d)
    const src = ct.client.source?.trim() || 'Bez źródła'
    if (!cycleBySource.has(src)) cycleBySource.set(src, [])
    cycleBySource.get(src)!.push(d)
  }
  const cycle: CycleStats = {
    overallMedianDays: median(cycleDays),
    sampleSize: cycleDays.length,
    bySource: [...cycleBySource.entries()]
      .map(([source, arr]) => ({ source, medianDays: median(arr), count: arr.length }))
      .sort((a, b) => b.count - a.count),
  }

  // ---- Co schodzi najszybciej: mediana dni do sprzedaży ----
  // Mieszkania (MIESZKALNY) rozbijamy po liczbie pokoi (1-pok., 2-pok., …),
  // pozostałe typy lokali grupujemy po typie.
  const daysByGroup = new Map<string, { label: string; days: number[] }>()
  for (const ct of signedContracts) {
    if (!ct.signedAt) continue
    for (const cu of ct.contractUnits) {
      const u = cu.unit
      if (!u) continue
      const d = daysBetween(ct.signedAt, u.createdAt)
      if (d < 0) continue
      const isFlat = u.type === 'MIESZKALNY'
      const key = isFlat ? `MIESZKALNY:${u.rooms ?? 0}` : u.type
      const label = isFlat ? roomsLabel(u.rooms) : (UNIT_TYPE_LABELS[u.type as UnitType] ?? u.type)
      let entry = daysByGroup.get(key)
      if (!entry) { entry = { label, days: [] }; daysByGroup.set(key, entry) }
      entry.days.push(d)
    }
  }
  const timeToSale: TimeToSaleRow[] = [...daysByGroup.entries()]
    .map(([key, v]) => ({ key, label: v.label, soldCount: v.days.length, medianDays: median(v.days) }))
    .sort((a, b) => a.medianDays - b.medianDays)

  // ---- Leady do odgrzania: brak kontaktu od STALE_LEAD_DAYS dni ----
  const staleLeads: StaleLead[] = leadClients
    .map((c) => {
      const lastTouch = c.activities[0]?.date ?? c.createdAt
      return {
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        status: c.status,
        daysSinceTouch: daysBetween(now, lastTouch),
        lastTouch,
      }
    })
    .filter((l) => l.daysSinceTouch >= STALE_LEAD_DAYS)
    .sort((a, b) => b.daysSinceTouch - a.daysSinceTouch)
    .slice(0, 15)

  // ---- Prognoza pipeline ----
  const prepValue = prepContracts.reduce((s, c) => s + (c.valueGross ?? 0), 0)
  const offersValue = sentOffers.reduce((s, o) => s + (o.totalGross ?? 0), 0)
  const pipeline: Pipeline = {
    prepContractsValue: prepValue,
    prepContractsCount: prepContracts.length,
    sentOffersValue: offersValue,
    sentOffersCount: sentOffers.length,
    weightedForecast: prepValue * PREP_CONTRACT_WEIGHT + offersValue * SENT_OFFER_WEIGHT,
  }

  // ---- Puls aktywności: ostatnie 12 mc, stackowane po typie ----
  const actBuckets: ActivityMonth[] = []
  const actByKey = new Map<string, ActivityMonth>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const m: ActivityMonth = {
      label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      NOTATKA: 0, TELEFON: 0, EMAIL: 0, SPOTKANIE: 0, DOKUMENT: 0,
    }
    actBuckets.push(m)
    actByKey.set(monthKey(d), m)
  }
  for (const a of activities) {
    const m = actByKey.get(monthKey(a.date))
    if (!m) continue
    if ((ACTIVITY_TYPES as readonly string[]).includes(a.type)) {
      m[a.type as (typeof ACTIVITY_TYPES)[number]] += 1
    }
  }

  return { cycle, timeToSale, staleLeads, pipeline, activity: actBuckets }
}
