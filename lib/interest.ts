// =====================================================================
// Silnik odsetek za opóźnienie — moduł Rozliczenia powiernicze.
//
// Liczy odsetki od nieterminowej wpłaty raty nabywcy metodą OKRESOWĄ: stawka
// odsetek ustawowych za opóźnienie zmienia się w czasie (decyzje RPP zmieniają
// stopę referencyjną NBP, a odsetki = stopa ref. + 5,5 p.p. — art. 481 §2¹ KC).
// Dla opóźnienia obejmującego kilka okresów rozbijamy naliczenie na segmenty.
//
// Konwencja liczenia dni (jak w kalkulatorach odsetek ustawowych):
//   - odsetki biegną od dnia NASTĘPNEGO po terminie płatności (dueDate) do dnia
//     zapłaty (paidDate) włącznie,
//   - baza roczna: 365 dni (actual/365),
//   - kwota za segment = principal * ratePct/100 * dni/365.
// =====================================================================

export type RatePeriod = {
  /** Data wejścia w życie stawki (YYYY-MM-DD, obowiązuje OD tego dnia włącznie). */
  from: string
  /** Roczna stawka w % (np. 11.25). */
  ratePct: number
  /** Opcjonalny opis (np. powód zmiany / decyzja RPP). */
  note?: string
}

export type InterestSlice = {
  from: string
  to: string
  days: number
  ratePct: number
  amount: number
}

export type InterestResult = {
  /** Suma odsetek (zaokrąglona do 2 miejsc). */
  amount: number
  /** Łączna liczba dni opóźnienia. */
  daysLate: number
  /** Rozbicie na okresy zmiennej stawki. */
  slices: InterestSlice[]
  /** Dominująca stawka (segment o największej liczbie dni) — do szybkiego podglądu. */
  dominantRatePct: number | null
}

// ---------------------------------------------------------------------
// TABELA STAWEK — odsetki ustawowe ZA OPÓŹNIENIE (art. 481 KC).
// Mechanizm: stopa referencyjna NBP + 5,5 p.p.
//
// ⚠️ ŹRÓDŁO PRAWDY DO WERYFIKACJI: obwieszczenia Ministra Sprawiedliwości oraz
// decyzje RPP (nbp.pl). Każda zmiana stopy referencyjnej NBP zmienia tę stawkę
// od dnia wejścia w życie decyzji RPP. Wartości poniżej ustaw wg aktualnych
// obwieszczeń — w razie wątpliwości Marta/Rafał weryfikują z kalkulatorem MS.
// Lista MUSI być posortowana rosnąco po `from` i pokrywać cały okres, w którym
// mogą pojawić się opóźnienia (praktycznie: ostatnie kilka lat).
// ---------------------------------------------------------------------
// Zweryfikowane 2026-07-14 (research + kontrola krzyżowa: taxmachine.pl, wskazniki.gofin.pl,
// mfinanse.pl, art. 481 KC). Wartości potwierdzone co do dnia.
export const DELAY_RATE_PERIODS: RatePeriod[] = [
  { from: '2020-01-01', ratePct: 7.0, note: 'stopa ref. NBP 1,50%' },
  { from: '2020-03-18', ratePct: 6.5, note: 'stopa ref. NBP 1,00%' },
  { from: '2020-04-09', ratePct: 6.0, note: 'stopa ref. NBP 0,50%' },
  { from: '2020-05-29', ratePct: 5.6, note: 'stopa ref. NBP 0,10% (min. historyczne)' },
  { from: '2021-10-07', ratePct: 6.0, note: 'stopa ref. NBP 0,50%' },
  { from: '2021-11-04', ratePct: 6.75, note: 'stopa ref. NBP 1,25%' },
  { from: '2021-12-09', ratePct: 7.25, note: 'stopa ref. NBP 1,75%' },
  { from: '2022-01-05', ratePct: 7.75, note: 'stopa ref. NBP 2,25%' },
  { from: '2022-02-09', ratePct: 8.25, note: 'stopa ref. NBP 2,75%' },
  { from: '2022-03-09', ratePct: 9.0, note: 'stopa ref. NBP 3,50%' },
  { from: '2022-04-07', ratePct: 10.0, note: 'stopa ref. NBP 4,50%' },
  { from: '2022-05-06', ratePct: 10.75, note: 'stopa ref. NBP 5,25%' },
  { from: '2022-06-09', ratePct: 11.5, note: 'stopa ref. NBP 6,00%' },
  { from: '2022-07-08', ratePct: 12.0, note: 'stopa ref. NBP 6,50%' },
  { from: '2022-09-08', ratePct: 12.25, note: 'stopa ref. NBP 6,75% (szczyt cyklu)' },
  { from: '2023-09-07', ratePct: 11.5, note: 'stopa ref. NBP 6,00%' },
  { from: '2023-10-05', ratePct: 11.25, note: 'stopa ref. NBP 5,75% (utrzymana cały 2024 i do 2025-05-07)' },
  { from: '2025-05-08', ratePct: 10.75, note: 'stopa ref. NBP 5,25%' },
  { from: '2025-07-03', ratePct: 10.5, note: 'stopa ref. NBP 5,00%' },
  { from: '2025-09-04', ratePct: 10.25, note: 'stopa ref. NBP 4,75%' },
  { from: '2025-10-09', ratePct: 10.0, note: 'stopa ref. NBP 4,50%' },
  { from: '2025-11-06', ratePct: 9.75, note: 'stopa ref. NBP 4,25%' },
  { from: '2025-12-04', ratePct: 9.5, note: 'stopa ref. NBP 4,00%' },
  { from: '2026-03-05', ratePct: 9.25, note: 'stopa ref. NBP 3,75% (stan aktualny na 2026-07)' },
]

const DAY_BASIS = 365
const DAY_MS = 86_400_000

/** Parsuje 'YYYY-MM-DD' lub Date → Date w północy UTC (stabilny dzień kalendarzowy). */
function toUtcMidnight(d: Date | string): Date {
  if (typeof d === 'string') {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number)
    return new Date(Date.UTC(y, (m || 1) - 1, day || 1))
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}

/** Liczba dni [a, b] włącznie (a<=b → >=1; a>b → 0). */
function daysInclusive(a: Date, b: Date): number {
  const diff = Math.round((b.getTime() - a.getTime()) / DAY_MS)
  return diff < 0 ? 0 : diff + 1
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Liczy odsetki za opóźnienie metodą okresową.
 * @param principal  kwota, od której naliczamy (rata lub faktyczna wpłata)
 * @param dueDate    termin płatności (odsetki biegną od dnia następnego)
 * @param paidDate   data zapłaty (włącznie)
 * @param ratePeriods tabela stawek (domyślnie DELAY_RATE_PERIODS)
 */
export function computeDelayInterest(
  principal: number,
  dueDate: Date | string,
  paidDate: Date | string,
  ratePeriods: RatePeriod[] = DELAY_RATE_PERIODS
): InterestResult {
  const due = toUtcMidnight(dueDate)
  const paid = toUtcMidnight(paidDate)
  const windowStart = addDays(due, 1) // pierwszy dzień naliczania = dzień po terminie
  const windowEnd = paid

  const daysLate = daysInclusive(windowStart, windowEnd)
  if (!isFinite(principal) || principal <= 0 || daysLate <= 0) {
    return { amount: 0, daysLate: Math.max(0, daysLate), slices: [], dominantRatePct: null }
  }

  const periods = [...ratePeriods].sort((a, b) => a.from.localeCompare(b.from))
  const slices: InterestSlice[] = []

  for (let i = 0; i < periods.length; i++) {
    const pFrom = toUtcMidnight(periods[i].from)
    const pEnd = i + 1 < periods.length ? addDays(toUtcMidnight(periods[i + 1].from), -1) : windowEnd

    const segFrom = pFrom > windowStart ? pFrom : windowStart
    const segTo = pEnd < windowEnd ? pEnd : windowEnd
    const days = daysInclusive(segFrom, segTo)
    if (days <= 0) continue

    const amount = round2((principal * (periods[i].ratePct / 100) * days) / DAY_BASIS)
    slices.push({ from: ymd(segFrom), to: ymd(segTo), days, ratePct: periods[i].ratePct, amount })
  }

  const rawTotal = slices.reduce((s, sl) => s + sl.amount, 0)
  const dominant = slices.reduce<InterestSlice | null>((best, sl) => (!best || sl.days > best.days ? sl : best), null)

  return {
    amount: round2(rawTotal),
    daysLate,
    slices,
    dominantRatePct: dominant?.ratePct ?? null,
  }
}

/**
 * Zwraca tabelę stawek właściwą dla umowy: odsetki umowne (stała stawka) → jeden
 * okres od zawsze; w przeciwnym razie ustawowe za opóźnienie.
 */
export function ratePeriodsForContract(interestType: string, customRate: number | null | undefined): RatePeriod[] {
  if (interestType === 'UMOWNE' && customRate && customRate > 0) {
    return [{ from: '2000-01-01', ratePct: customRate, note: 'odsetki umowne' }]
  }
  // USTAWOWE_KAPITALOWE i inne warianty można rozbudować w przyszłości; domyślnie
  // stosujemy odsetki ustawowe za opóźnienie (najczęstszy przypadek dla nabywców).
  return DELAY_RATE_PERIODS
}

/** Aktualnie obowiązująca stawka (ostatni okres z from <= today). */
export function currentDelayRate(ratePeriods: RatePeriod[] = DELAY_RATE_PERIODS, today: Date = new Date()): number | null {
  const t = ymd(toUtcMidnight(today))
  let rate: number | null = null
  for (const p of [...ratePeriods].sort((a, b) => a.from.localeCompare(b.from))) {
    if (p.from <= t) rate = p.ratePct
  }
  return rate
}
