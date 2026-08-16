import { ACTIVITY_TYPE_LABELS, CONTRACT_STAGE_ORDER, type ActivityType, type ContractType } from './types'

// =============================================================
// Portfel klienta („Klient 360") — czyste funkcje bez Prisma/IO.
// Jedno miejsce liczenia rabatów, KPI, flag i osi czasu dla strony
// app/(app)/clients/[id]. Rabat liczymy ZAWSZE brutto-z-brutto wobec
// cennika Z DNIA UMOWY (PriceHistory), nie ruchomego cennika bieżącego.
// =============================================================

// Kopia z lib/sales-metrics.ts (tam prywatna) — ranga etapu dealu.
export const STAGE_RANK: Record<string, number> = { REZERWACYJNA: 1, DEWELOPERSKA: 2, PRZENIESIENIA: 3 }

export function isActiveContract(c: { status: string }): boolean {
  return c.status !== 'ROZWIAZANA' && c.status !== 'ANULOWANA'
}

// ===== Typy wejściowe — strukturalne minimum, przyjmują wyniki Prisma =====

export type PortfolioUnit = {
  id: string
  number: string
  type: string
  status: string
  priceGross: number
  reservationType: string | null
  reservationExpiresAt: Date | null
}

export type PortfolioContract = {
  id: string
  number: string
  type: string
  status: string
  clientId: string
  client: { id: string; firstName: string; lastName: string }
  introducedAt: Date
  signedAt: Date | null
  plannedSignDate: Date | null
  reservationEndDate: Date | null
  contractUnits: { unitId: string; priceGross: number | null; annexId: string | null; unit: PortfolioUnit }[]
  stages: { stage: string; status: string; signedAt: Date | null; plannedSignDate: Date | null; number: string | null; createdAt: Date }[]
  annexes: { id: string; number: string | null; signedAt: Date | null; valueGrossDelta: number; createdAt: Date }[]
  contractClients: { clientId: string; client: { id: string; firstName: string; lastName: string } }[]
  history: { id: string; event: string; details: string | null; createdAt: Date }[]
}

export type PriceHistoryEntry = { unitId: string; priceGross: number; changedAt: Date }

// ===== Cennik referencyjny (z dnia umowy) =====

/** Grupuje wpisy PriceHistory per lokal; wpisy muszą przyjść posortowane rosnąco po changedAt. */
export function groupPriceHistory(entries: PriceHistoryEntry[]): Map<string, PriceHistoryEntry[]> {
  const map = new Map<string, PriceHistoryEntry[]>()
  for (const e of entries) {
    const arr = map.get(e.unitId)
    if (arr) arr.push(e)
    else map.set(e.unitId, [e])
  }
  return map
}

/**
 * Data referencyjna umowy do odczytu cennika: podpisanie najwcześniejszego
 * etapu, potem signedAt umowy, na końcu data wprowadzenia.
 */
export function contractRefDate(c: PortfolioContract): Date {
  const stageSigned = c.stages
    .map((s) => s.signedAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime())[0]
  return stageSigned ?? c.signedAt ?? c.introducedAt
}

/**
 * Cena cennikowa lokalu obowiązująca w refDate = ostatni wpis PriceHistory
 * z changedAt <= refDate (wpis rejestruje NOWĄ cenę w momencie zmiany).
 * Brak takiego wpisu (lokal sprzed wdrożenia historii) → bieżący cennik.
 */
export function cennikRefForUnit(
  unit: { id: string; priceGross: number },
  refDate: Date,
  historyByUnit: Map<string, PriceHistoryEntry[]>,
): number {
  const entries = historyByUnit.get(unit.id)
  if (entries) {
    let ref: number | null = null
    for (const e of entries) {
      if (e.changedAt.getTime() <= refDate.getTime()) ref = e.priceGross
      else break
    }
    if (ref != null) return ref
  }
  return unit.priceGross
}

// ===== Rabat per składnik umowy =====

export type UnitPricing = {
  cennikRef: number
  purchase: number
  discount: number
  discountPct: number
}

/**
 * NULL snapshot (legacy) = obowiązuje cennik → rabat 0, NIGDY „100%".
 * Ujemny rabat (cennik spadł poniżej snapshotu) przycinamy do 0.
 */
export function computeUnitDiscount(cennikRef: number, currentGross: number, snapshotGross: number | null): UnitPricing {
  const purchase = snapshotGross ?? currentGross
  const discount = snapshotGross != null ? Math.max(0, cennikRef - snapshotGross) : 0
  const discountPct = cennikRef > 0 ? (discount / cennikRef) * 100 : 0
  return { cennikRef, purchase, discount, discountPct }
}

// ===== Karta umowy (DTO dla ContractDealCard — daty jako ISO) =====

export type DealCardUnit = {
  unitId: string
  number: string
  unitType: string
  purchase: number
  cennikRef: number
  discount: number
  discountPct: number
  fromAnnex: boolean
}

export type DealCardData = {
  id: string
  number: string
  type: string
  status: string
  isCoBuyer: boolean
  introducedAtISO: string
  signedAtISO: string | null
  reservationEndDateISO: string | null
  stages: { stage: string; status: string; signedAt: string | null; number: string | null }[]
  daysInStage: number
  units: DealCardUnit[]
  valueGross: number
  cennikGross: number
  discountGross: number
  discountPct: number
  annexCount: number
  lastAnnexISO: string | null
  lastAnnexDelta: number
  coBuyers: { id: string; firstName: string; lastName: string }[]
}

export function buildDealCardData(
  c: PortfolioContract,
  clientId: string,
  historyByUnit: Map<string, PriceHistoryEntry[]>,
  now: Date = new Date(),
): DealCardData {
  const refDate = contractRefDate(c)
  const units: DealCardUnit[] = c.contractUnits.map((cu) => {
    const p = computeUnitDiscount(cennikRefForUnit(cu.unit, refDate, historyByUnit), cu.unit.priceGross, cu.priceGross)
    return {
      unitId: cu.unitId,
      number: cu.unit.number,
      unitType: cu.unit.type,
      purchase: p.purchase,
      cennikRef: p.cennikRef,
      discount: p.discount,
      discountPct: p.discountPct,
      fromAnnex: cu.annexId != null,
    }
  })
  const valueGross = units.reduce((s, u) => s + u.purchase, 0)
  const cennikGross = units.reduce((s, u) => s + u.cennikRef, 0)
  const discountGross = units.reduce((s, u) => s + u.discount, 0)

  // „X dni w etapie" — od podpisania poprzedniego etapu (start bieżącego).
  // Advance nie wymaga podpisu, więc gdy poprzedni etap nie ma signedAt,
  // bierzemy createdAt wpisu bieżącego etapu (tworzony przy advance) —
  // fallback na introducedAt tylko dla pierwszego etapu bez własnego wpisu.
  const idx = CONTRACT_STAGE_ORDER.indexOf(c.type as ContractType)
  const prevStage = idx > 0 ? CONTRACT_STAGE_ORDER[idx - 1] : null
  const prevSigned = prevStage ? c.stages.find((s) => s.stage === prevStage)?.signedAt : null
  const currentStageRow = c.stages.find((s) => s.stage === c.type)
  const stageStart = prevSigned ?? currentStageRow?.createdAt ?? c.introducedAt
  const daysInStage = Math.max(0, Math.floor((now.getTime() - stageStart.getTime()) / 86_400_000))

  const lastAnnex = c.annexes[0] ?? null

  return {
    id: c.id,
    number: c.number,
    type: c.type,
    status: c.status,
    isCoBuyer: c.clientId !== clientId,
    introducedAtISO: c.introducedAt.toISOString(),
    signedAtISO: c.signedAt?.toISOString() ?? null,
    reservationEndDateISO: c.reservationEndDate?.toISOString() ?? null,
    stages: c.stages.map((s) => ({
      stage: s.stage,
      status: s.status,
      signedAt: s.signedAt?.toISOString() ?? null,
      number: s.number,
    })),
    daysInStage,
    units,
    valueGross,
    cennikGross,
    discountGross,
    discountPct: cennikGross > 0 ? (discountGross / cennikGross) * 100 : 0,
    annexCount: c.annexes.length,
    lastAnnexISO: lastAnnex ? (lastAnnex.signedAt ?? lastAnnex.createdAt).toISOString() : null,
    lastAnnexDelta: lastAnnex?.valueGrossDelta ?? 0,
    coBuyers: buildOtherBuyers(c, clientId),
  }
}

/**
 * Pozostali kupujący z perspektywy OGLĄDANEGO klienta: główny kupujący umowy
 * + współkupujący, bez oglądanego i bez duplikatów (import/konwersja potrafiły
 * wrzucić głównego także do contractClients). Na stronie współkupującego
 * pokazuje to głównego kupującego — najistotniejszą osobę z jego perspektywy.
 */
function buildOtherBuyers(c: PortfolioContract, viewedClientId: string): { id: string; firstName: string; lastName: string }[] {
  const seen = new Set<string>([viewedClientId])
  const out: { id: string; firstName: string; lastName: string }[] = []
  for (const p of [c.client, ...c.contractClients.map((cc) => cc.client)]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push({ id: p.id, firstName: p.firstName, lastName: p.lastName })
  }
  return out
}

// ===== Portfel lokali (unia clientUnits ∪ lokale aktywnych umów) =====

export type PortfolioRow = {
  unitId: string
  number: string
  unitType: string
  status: string
  reservationType: string | null
  reservationExpiresAtISO: string | null
  /** Cennik referencyjny (z dnia umowy) gdy lokal ma umowę, inaczej bieżący cennik. */
  cennik: number
  /** Cena zakupu ze snapshotu umowy; null = lokal bez aktywnej umowy (samo przypisanie/rezerwacja). */
  purchase: number | null
  discount: number
  discountPct: number
  contract: { id: string; number: string; type: string } | null
  assignedAtISO: string | null
  fromAnnex: boolean
}

// Kolejność typów jak na liście lokali: mieszkania najpierw.
const UNIT_TYPE_ORDER: Record<string, number> = { MIESZKALNY: 0, USLUGOWY: 1, GARAZ: 2, PARKING: 3, KOMORKA: 4 }

export function buildPortfolioRows(
  clientUnits: { unitId: string; assignedAt: Date; unit: PortfolioUnit }[],
  contracts: PortfolioContract[],
  historyByUnit: Map<string, PriceHistoryEntry[]>,
): PortfolioRow[] {
  // Lokal na kilku AKTYWNYCH umowach → wygrywa umowa o najwyższym STAGE_RANK
  // (rezerwacyjna + deweloperska tej samej transakcji nie dubluje pozycji).
  const byUnit = new Map<string, { row: PortfolioRow; rank: number }>()

  for (const c of contracts.filter(isActiveContract)) {
    const refDate = contractRefDate(c)
    const rank = STAGE_RANK[c.type] || 0
    for (const cu of c.contractUnits) {
      const existing = byUnit.get(cu.unitId)
      if (existing && existing.rank >= rank) continue
      const p = computeUnitDiscount(cennikRefForUnit(cu.unit, refDate, historyByUnit), cu.unit.priceGross, cu.priceGross)
      byUnit.set(cu.unitId, {
        rank,
        row: {
          unitId: cu.unitId,
          number: cu.unit.number,
          unitType: cu.unit.type,
          status: cu.unit.status,
          reservationType: cu.unit.reservationType,
          reservationExpiresAtISO: cu.unit.reservationExpiresAt?.toISOString() ?? null,
          cennik: p.cennikRef,
          purchase: p.purchase,
          discount: p.discount,
          discountPct: p.discountPct,
          contract: { id: c.id, number: c.number, type: c.type },
          assignedAtISO: null,
          fromAnnex: cu.annexId != null,
        },
      })
    }
  }

  for (const cu of clientUnits) {
    const existing = byUnit.get(cu.unitId)
    if (existing) {
      existing.row.assignedAtISO = cu.assignedAt.toISOString()
      continue
    }
    byUnit.set(cu.unitId, {
      rank: 0,
      row: {
        unitId: cu.unitId,
        number: cu.unit.number,
        unitType: cu.unit.type,
        status: cu.unit.status,
        reservationType: cu.unit.reservationType,
        reservationExpiresAtISO: cu.unit.reservationExpiresAt?.toISOString() ?? null,
        cennik: cu.unit.priceGross,
        purchase: null,
        discount: 0,
        discountPct: 0,
        contract: null,
        assignedAtISO: cu.assignedAt.toISOString(),
        fromAnnex: false,
      },
    })
  }

  return [...byUnit.values()]
    .map((e) => e.row)
    .sort((a, b) => {
      const t = (UNIT_TYPE_ORDER[a.unitType] ?? 9) - (UNIT_TYPE_ORDER[b.unitType] ?? 9)
      if (t !== 0) return t
      return a.number.localeCompare(b.number, 'pl', { numeric: true })
    })
}

export type PortfolioSums = { cennik: number; purchase: number; discount: number; discountPct: number }

/** Sumy stopki portfela: cennik po wszystkich wierszach, zakup/rabat tylko po lokalach z umową. */
export function computePortfolioSums(rows: PortfolioRow[]): PortfolioSums {
  const withContract = rows.filter((r) => r.purchase != null)
  const cennik = rows.reduce((s, r) => s + r.cennik, 0)
  const purchase = withContract.reduce((s, r) => s + (r.purchase as number), 0)
  const discount = withContract.reduce((s, r) => s + r.discount, 0)
  const cennikContracted = withContract.reduce((s, r) => s + r.cennik, 0)
  return { cennik, purchase, discount, discountPct: cennikContracted > 0 ? (discount / cennikContracted) * 100 : 0 }
}

// ===== KPI paska podsumowania =====

export type ClientKpi = {
  purchaseTotal: number
  discountTotal: number
  discountPct: number
  unitsCount: number
  softCount: number
  topContract: { id: string; number: string; type: string; status: string } | null
}

export function computeClientKpi(rows: PortfolioRow[], contracts: PortfolioContract[]): ClientKpi {
  const sums = computePortfolioSums(rows)
  const top = contracts
    .filter(isActiveContract)
    .sort(
      (a, b) =>
        (STAGE_RANK[b.type] || 0) - (STAGE_RANK[a.type] || 0) || b.introducedAt.getTime() - a.introducedAt.getTime(),
    )[0]
  return {
    purchaseTotal: sums.purchase,
    discountTotal: sums.discount,
    discountPct: sums.discountPct,
    unitsCount: rows.length,
    // Lokal pod aktywną umową nie jest już „w rezerwacji miękkiej", nawet gdy
    // import zostawił na nim MIEKKA (expireSoftReservations celowo go nie czyści).
    softCount: rows.filter((r) => r.reservationType === 'MIEKKA' && !r.contract).length,
    topContract: top ? { id: top.id, number: top.number, type: top.type, status: top.status } : null,
  }
}

// ===== Flagi „Wymaga uwagi" =====

export type AttentionFlag = {
  kind: 'MIEKKA_WYGASA' | 'KONIEC_REZERWACJI' | 'TERMIN_PODPISANIA'
  severity: 'warn' | 'overdue'
  text: string
  href: string | null
}

const DAY = 86_400_000

function fmtPl(d: Date): string {
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

/**
 * Terminy zapisane jako data-bez-czasu (plannedSignDate, reservationEndDate)
 * obowiązują do KOŃCA dnia — bez tego flaga „minął termin" świeciłaby się
 * od godziny 00:00 samego dnia terminu.
 */
export function endOfDay(d: Date): number {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e.getTime()
}

export function computeAttentionFlags(
  rows: PortfolioRow[],
  contracts: PortfolioContract[],
  now: Date = new Date(),
): AttentionFlag[] {
  const flags: AttentionFlag[] = []

  // 1. Miękka rezerwacja wygasa ≤ 2 dni. Pomijamy lokale pod aktywną umową:
  //    expireSoftReservations CELOWO ich nie czyści (dane z importu bywają
  //    miękko-zarezerwowane mimo umowy) — bez tego flaga świeciłaby wiecznie.
  for (const r of rows) {
    if (r.contract || r.reservationType !== 'MIEKKA' || !r.reservationExpiresAtISO) continue
    const exp = new Date(r.reservationExpiresAtISO)
    const days = (exp.getTime() - now.getTime()) / DAY
    if (days <= 2) {
      flags.push({
        kind: 'MIEKKA_WYGASA',
        severity: days < 0 ? 'overdue' : 'warn',
        text: `Rezerwacja miękka lokalu ${r.number} wygasa ${fmtPl(exp)}`,
        href: null,
      })
    }
  }

  const active = contracts.filter(isActiveContract)

  // 2. Umowa rezerwacyjna z bliskim/minionym terminem zakończenia rezerwacji.
  for (const c of active) {
    if (c.type !== 'REZERWACYJNA' || !c.reservationEndDate) continue
    const days = (endOfDay(c.reservationEndDate) - now.getTime()) / DAY
    if (days < 0) {
      flags.push({
        kind: 'KONIEC_REZERWACJI',
        severity: 'overdue',
        text: `Termin rezerwacji umowy ${c.number} minął ${fmtPl(c.reservationEndDate)} — czas na umowę deweloperską`,
        href: `/sales/${c.id}`,
      })
    } else if (days <= 7) {
      flags.push({
        kind: 'KONIEC_REZERWACJI',
        severity: 'warn',
        text: `Rezerwacja umowy ${c.number} kończy się ${fmtPl(c.reservationEndDate)} — czas na umowę deweloperską`,
        href: `/sales/${c.id}`,
      })
    }
  }

  // 3. Minął planowany termin podpisania umowy w przygotowaniu.
  for (const c of active) {
    if (c.status !== 'W_PRZYGOTOWANIU' || !c.plannedSignDate) continue
    if (endOfDay(c.plannedSignDate) < now.getTime()) {
      flags.push({
        kind: 'TERMIN_PODPISANIA',
        severity: 'overdue',
        text: `Minął planowany termin podpisania umowy ${c.number} (${fmtPl(c.plannedSignDate)})`,
        href: `/sales/${c.id}`,
      })
    }
  }

  const sevRank = { overdue: 0, warn: 1 }
  return flags.sort((a, b) => sevRank[a.severity] - sevRank[b.severity])
}

// ===== Oś czasu: działania + zdarzenia umów =====

export type TimelineItem = {
  id: string
  kind: 'activity' | 'contract'
  /** Typ Activity (NOTATKA/EMAIL/...) albo event ContractHistory (UTWORZONO/...). */
  type: string
  title: string
  content: string | null
  dateISO: string
  href: string | null
}

// Zdarzenia umów pokazywane na osi. WYSLANO_MAILEM pomijamy (istnieje równoległe
// Activity EMAIL), EDYCJA_SKLADNIKOW pomijamy (szum operacyjny).
// Konwersja oferty zapisuje event w rodzaju żeńskim „UTWORZONA" — oba warianty.
// UWAGA: lista kluczy zsynchronizowana z filtrem `history.where.event.in`
// w app/(app)/clients/[id]/page.tsx.
const CONTRACT_EVENT_TITLES: Record<string, (number: string) => string> = {
  UTWORZONO: (n) => `Utworzono umowę ${n}`,
  UTWORZONA: (n) => `Utworzono umowę ${n}`,
  ZMIANA_STATUSU: (n) => `Zmiana statusu umowy ${n}`,
  ZMIANA_ETAPU: (n) => `Zmiana etapu umowy ${n}`,
  ANEKS: (n) => `Aneks do umowy ${n}`,
  WSPOLKUPUJACY: (n) => `Zmiana kupujących umowy ${n}`,
}

export function buildTimeline(
  activities: { id: string; type: string; title: string; content: string | null; date: Date }[],
  contracts: PortfolioContract[],
  cap = 200,
): TimelineItem[] {
  const items: TimelineItem[] = activities.map((a) => ({
    id: `a-${a.id}`,
    kind: 'activity',
    type: a.type,
    title: `${ACTIVITY_TYPE_LABELS[a.type as ActivityType] ?? a.type}${a.title ? ` — ${a.title}` : ''}`,
    content: a.content,
    dateISO: a.date.toISOString(),
    href: null,
  }))

  for (const c of contracts) {
    // Dopasowanie numeru z granicą: „7/2026/R" nie może łapać tytułów z „7/2026/R-2"
    // (kolejna umowa z tego miesiąca ma numer z sufiksem porządkowym „-N").
    const numRe = new RegExp(`${c.number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d-])`)
    for (const h of c.history) {
      const titleFn = CONTRACT_EVENT_TITLES[h.event]
      if (!titleFn) continue
      // Anty-duplikacja: konwersja oferty/rezerwacji pisze własne Activity DOKUMENT
      // z numerem umowy — wtedy wpis UTWORZONO/UTWORZONA z ContractHistory pomijamy.
      if (
        (h.event === 'UTWORZONO' || h.event === 'UTWORZONA') &&
        activities.some(
          (a) =>
            a.type === 'DOKUMENT' &&
            numRe.test(a.title) &&
            Math.abs(a.date.getTime() - h.createdAt.getTime()) <= DAY,
        )
      ) {
        continue
      }
      items.push({
        id: `c-${h.id}`,
        kind: 'contract',
        type: h.event,
        title: titleFn(c.number),
        content: h.details,
        dateISO: h.createdAt.toISOString(),
        href: `/sales/${c.id}`,
      })
    }
  }

  return items.sort((a, b) => b.dateISO.localeCompare(a.dateISO)).slice(0, cap)
}
