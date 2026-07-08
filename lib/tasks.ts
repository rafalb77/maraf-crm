import { prisma } from './prisma'
import { expireSoftReservations, attachReservedByClient } from './reservations'
import type { TaskBucket } from './types'

/**
 * Silnik zadań — automatyczne generowanie i domykanie zadań na pulpicie.
 *
 * Reguły (source=RULE, idempotentne przez unikalny Task.ruleKey):
 *  - RES_EXPIRE:<unitId>:<yyyy-mm-dd>  — rezerwacja lokalu wygasa w ciągu N dni
 *    (Settings: tasks.reservationWarnDays, default 3)
 *  - PAYMENT_DUE:<paymentId>:<yyyy-mm-dd> — rata harmonogramu (PLANOWANA) z terminem
 *    w ciągu N dni lub po terminie (Settings: tasks.paymentWarnDays, default 7)
 *
 * ruleKey zawiera datę źródła — przesunięcie terminu (przedłużenie rezerwacji,
 * zmiana plannedDate raty) tworzy NOWY klucz; stare zadanie domyka reconcile.
 * Ręcznie odhaczone/anulowane zadanie nie odrodzi się (wiersz z ruleKey zostaje).
 *
 * Auto-domykanie (reconcileRuleTasks): otwarte zadania RULE, których źródło
 * przestało być aktualne, są zamykane bez udziału użytkownika:
 *  - rata opłacona → ZROBIONE (autoCompleted)
 *  - rezerwacja przedłużona / lokal sprzedany → ZROBIONE (autoCompleted)
 *  - rata przełożona / umowa rozwiązana / rezerwacja zwolniona → ANULOWANE
 *
 * Wywołanie: cron (POST /api/public/tasks/generate) + oportunistycznie przy
 * odczycie listy zadań (maybeGenerateTasks, throttling 10 min przez Settings).
 */

const RESERVATION_WARN_DAYS_DEFAULT = 3
const PAYMENT_WARN_DAYS_DEFAULT = 7
// Nie generuj zadań dla rat zaległych dawniej niż 90 dni — stare PLANOWANA
// z importów (opłacone poza systemem) zalałyby pulpit szumem.
const PAYMENT_OVERDUE_MAX_DAYS = 90
const GENERATE_THROTTLE_MS = 10 * 60 * 1000

/** Klucz kalendarzowy yyyy-mm-dd w strefie Europe/Warsaw (sv-SE daje ISO). */
export function warsawDateKey(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** dd.MM (Europe/Warsaw) do tytułów zadań. */
function fmtShortDate(d: Date): string {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
  }).format(d)
}

function fmtAmount(n: number): string {
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(n) + ' zł'
}

/** Różnica dni kalendarzowych między kluczami yyyy-mm-dd (b - a). */
function dayDiff(aKey: string, bKey: string): number {
  return Math.round((Date.parse(bKey) - Date.parse(aKey)) / 86_400_000)
}

async function getIntSetting(key: string, def: number): Promise<number> {
  const row = await prisma.settings.findUnique({ where: { key } })
  const n = row ? parseInt(row.value, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : def
}

// ---------------------------------------------------------------------------
// Scoring + koszyki — używane przez GET /api/tasks do sortowania widgetu
// ---------------------------------------------------------------------------

export type TaskForScoring = {
  type: string
  dueAt: Date | null
  pinned: boolean
  payment?: { plannedAmount: number } | null
  unit?: { priceGross: number } | null
  contract?: { valueGross: number | null } | null
}

const TYPE_WEIGHTS: Record<string, number> = {
  PLATNOSC: 30,
  REZERWACJA: 28,
  SPRAWA: 26,
  TELEFON: 15,
  SPOTKANIE: 12,
  EMAIL: 10,
  INNE: 5,
}

/** Koszyk pilności wg dnia kalendarzowego (Europe/Warsaw). */
export function computeBucket(dueAt: Date | null, now = new Date()): TaskBucket {
  if (!dueAt) return 'POZNIEJ'
  const diff = dayDiff(warsawDateKey(now), warsawDateKey(dueAt))
  if (diff < 0) return 'PRZETERMINOWANE'
  if (diff === 0) return 'DZIS'
  if (diff <= 7) return 'NADCHODZACE'
  return 'POZNIEJ'
}

/**
 * Wynik priorytetu: pilność (jak blisko/po terminie) + waga typu + wartość
 * transakcji + przypięcie. Liczony przy odczycie (zależy od „teraz"), nie
 * przechowywany w bazie.
 */
export function computeTaskScore(t: TaskForScoring, now = new Date()): number {
  let score = TYPE_WEIGHTS[t.type] ?? 5

  if (t.dueAt) {
    const diff = dayDiff(warsawDateKey(now), warsawDateKey(t.dueAt))
    if (diff < 0) score += 100 + Math.min(20, -diff * 2) // im dłużej po terminie, tym wyżej (cap +20)
    else if (diff === 0) score += 80
    else if (diff === 1) score += 60
    else if (diff <= 3) score += 40
    else if (diff <= 7) score += 20
  }

  const amount = t.payment?.plannedAmount || t.unit?.priceGross || t.contract?.valueGross || 0
  if (amount >= 500_000) score += 15
  else if (amount >= 200_000) score += 10
  else if (amount > 0) score += 5

  if (t.pinned) score += 1000
  return score
}

// ---------------------------------------------------------------------------
// Generowanie
// ---------------------------------------------------------------------------

export type GenerateResult = { created: number; autoClosed: number; cancelled: number }

/**
 * Pełny przebieg silnika: porządkuje stan rezerwacji, domyka nieaktualne
 * zadania RULE, tworzy brakujące zadania z reguł. Idempotentny — można wołać
 * dowolnie często.
 */
export async function generateTasks(): Promise<GenerateResult> {
  // Kanoniczny stan rezerwacji przed generowaniem (MIEKKA po terminie → zwolnione)
  await expireSoftReservations()

  const { autoClosed, cancelled } = await reconcileRuleTasks()

  const now = new Date()
  const [reservationRows, paymentRows] = await Promise.all([
    buildReservationTaskRows(now),
    buildPaymentTaskRows(now),
  ])

  const rows = [...reservationRows, ...paymentRows]
  let created = 0
  if (rows.length > 0) {
    // skipDuplicates + unique(ruleKey) = idempotencja (także wobec zadań już
    // zamkniętych — ręczne odhaczenie nie powoduje ponownego wygenerowania)
    const res = await prisma.task.createMany({ data: rows, skipDuplicates: true })
    created = res.count
  }

  return { created, autoClosed, cancelled }
}

/** Rezerwacje (miękkie i twarde) wygasające w ciągu warnDays. */
async function buildReservationTaskRows(now: Date) {
  const warnDays = await getIntSetting('tasks.reservationWarnDays', RESERVATION_WARN_DAYS_DEFAULT)
  const horizon = new Date(now.getTime() + warnDays * 86_400_000)

  const units = await prisma.unit.findMany({
    where: {
      reservationType: { not: null },
      reservationExpiresAt: { lte: horizon },
    },
    select: {
      id: true,
      number: true,
      reservationType: true,
      reservationExpiresAt: true,
      reservedById: true,
    },
  })
  const withClients = await attachReservedByClient(units)

  return withClients
    .filter((u) => u.reservationExpiresAt)
    .map((u) => {
      const expires = u.reservationExpiresAt as Date
      const kind = u.reservationType === 'MIEKKA' ? 'Rezerwacja miękka' : 'Rezerwacja'
      const verb = expires.getTime() < now.getTime() ? 'wygasła' : 'wygasa'
      const client = u.reservedBy
      const contact = client
        ? `${client.firstName} ${client.lastName}${client.phone ? `, tel. ${client.phone}` : ''}`
        : 'brak przypisanego klienta'
      return {
        title: `${kind} ${u.number} ${verb} ${fmtShortDate(expires)} — skontaktuj się z klientem`,
        description: `Klient: ${contact}`,
        type: 'REZERWACJA',
        source: 'RULE',
        ruleKey: `RES_EXPIRE:${u.id}:${warsawDateKey(expires)}`,
        dueAt: expires,
        unitId: u.id,
        clientId: u.reservedById,
      }
    })
}

/** Raty harmonogramu (PLANOWANA) z terminem w ciągu warnDays lub po terminie. */
async function buildPaymentTaskRows(now: Date) {
  const warnDays = await getIntSetting('tasks.paymentWarnDays', PAYMENT_WARN_DAYS_DEFAULT)
  const horizon = new Date(now.getTime() + warnDays * 86_400_000)
  const overdueFloor = new Date(now.getTime() - PAYMENT_OVERDUE_MAX_DAYS * 86_400_000)

  const payments = await prisma.contractPayment.findMany({
    where: {
      status: 'PLANOWANA',
      plannedDate: { not: null, lte: horizon, gte: overdueFloor },
      contract: { status: 'PODPISANA' },
    },
    select: {
      id: true,
      title: true,
      plannedDate: true,
      plannedAmount: true,
      contractId: true,
      contract: { select: { number: true, clientId: true } },
    },
  })

  return payments.map((p) => {
    const due = p.plannedDate as Date
    const label = p.title || 'Rata'
    const amount = p.plannedAmount > 0 ? ` (${fmtAmount(p.plannedAmount)})` : ''
    return {
      title: `${label}${amount} — umowa ${p.contract.number}, termin ${fmtShortDate(due)}`,
      description: 'Przypomnij klientowi o wpłacie zgodnie z harmonogramem.',
      type: 'PLATNOSC',
      source: 'RULE',
      ruleKey: `PAYMENT_DUE:${p.id}:${warsawDateKey(due)}`,
      dueAt: due,
      contractId: p.contractId,
      paymentId: p.id,
      clientId: p.contract.clientId,
    }
  })
}

// ---------------------------------------------------------------------------
// Auto-domykanie (reconcile)
// ---------------------------------------------------------------------------

/**
 * Domyka otwarte zadania RULE, których źródło przestało być aktualne.
 * ZROBIONE (autoCompleted) — cel osiągnięty (rata opłacona, rezerwacja
 * przedłużona, lokal sprzedany). ANULOWANE — zadanie stało się bezprzedmiotowe
 * (rata przełożona/umowa nieaktywna, rezerwacja zwolniona).
 */
export async function reconcileRuleTasks(): Promise<{ autoClosed: number; cancelled: number }> {
  const open = await prisma.task.findMany({
    where: { status: 'OTWARTE', source: 'RULE' },
    select: {
      id: true,
      ruleKey: true,
      clientId: true,
      payment: { select: { status: true, plannedDate: true, contract: { select: { status: true } } } },
      unit: {
        select: {
          status: true,
          reservationType: true,
          reservationExpiresAt: true,
          reservedById: true,
        },
      },
    },
  })

  const doneIds: string[] = []
  const cancelIds: string[] = []

  for (const t of open) {
    const [rule, , keyDate] = (t.ruleKey || '').split(':')

    if (rule === 'PAYMENT_DUE') {
      const p = t.payment
      if (!p) {
        cancelIds.push(t.id)
      } else if (p.status === 'OPLACONA') {
        doneIds.push(t.id)
      } else if (p.contract.status !== 'PODPISANA') {
        cancelIds.push(t.id)
      } else if (!p.plannedDate || warsawDateKey(p.plannedDate) !== keyDate) {
        cancelIds.push(t.id) // termin przesunięty — nowe zadanie powstanie we właściwym horyzoncie
      }
    } else if (rule === 'RES_EXPIRE') {
      const u = t.unit
      if (!u) {
        cancelIds.push(t.id)
      } else if (!u.reservationType || !u.reservationExpiresAt) {
        // Rezerwacja zniknęła: sprzedany = sukces, zwolniony = bezprzedmiotowe
        if (u.status === 'SPRZEDANY') doneIds.push(t.id)
        else cancelIds.push(t.id)
      } else if (u.reservedById !== t.clientId) {
        cancelIds.push(t.id) // rezerwuje już ktoś inny
      } else if (warsawDateKey(u.reservationExpiresAt) !== keyDate) {
        doneIds.push(t.id) // przedłużona — temat obsłużony
      }
    }
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.task.updateMany({
      where: { id: { in: doneIds } },
      data: { status: 'ZROBIONE', autoCompleted: true, completedAt: now },
    }),
    prisma.task.updateMany({
      where: { id: { in: cancelIds } },
      data: { status: 'ANULOWANE', autoCompleted: true, completedAt: now },
    }),
  ])

  return { autoClosed: doneIds.length, cancelled: cancelIds.length }
}

// ---------------------------------------------------------------------------
// Throttling — oportunistyczne generowanie przy odczycie listy
// ---------------------------------------------------------------------------

/**
 * Uruchamia generateTasks() najwyżej raz na 10 min (znacznik w Settings).
 * Nigdy nie rzuca — awaria silnika nie może wywrócić pulpitu.
 */
export async function maybeGenerateTasks(): Promise<void> {
  try {
    const row = await prisma.settings.findUnique({ where: { key: 'tasks.lastGeneratedAt' } })
    const last = row ? Date.parse(row.value) : 0
    if (Number.isFinite(last) && Date.now() - last < GENERATE_THROTTLE_MS) return

    // Znacznik PRZED przebiegiem — równoległe requesty nie zdublują pracy
    // (a idempotencja ruleKey i tak chroni przed duplikatami zadań).
    await prisma.settings.upsert({
      where: { key: 'tasks.lastGeneratedAt' },
      create: { key: 'tasks.lastGeneratedAt', value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    })
    await generateTasks()
  } catch (e) {
    console.error('[tasks.maybeGenerate] błąd generowania zadań:', e)
  }
}
