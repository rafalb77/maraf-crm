// Reguły CRON-owe modułu Budowa (Etap 2) — stan harmonogramu → Taski na pulpicie.
// Wpinane w silnik lib/tasks.ts (generateTasks + reconcile). Idempotentne po ruleKey.
//
// Reguły (uzupełniają event-driven BUDOWA_PROBLEM/RAPORT_DECYZJA/WYKONAWCA/WYJASNIENIE
// z lib/budowa-tasks.ts, tworzone przy zapisie check-inu/komentarza):
//  - BUDOWA_OPOZNIENIE:<taskId>:<poniedziałek-tygodnia> — zadanie po planowym końcu
//    (raz na tydzień, nie codzienny spam; nowy tydzień = nowy klucz, stary domyka reconcile)
//  - BUDOWA_ODBIOR:<taskId> — zadanie czeka w DO_ODBIORU > 3 dni (po updatedAt —
//    przybliżenie: każda edycja zadania odświeża licznik, akceptowalne)
//  - BUDOWA_UMOWA_KONIEC:<subContractId>:<endDate> — umowa podwykonawcy kończy się
//    w <14 dni (lub minęła), a jej zadania w harmonogramie nie są dokończone

import { prisma } from './prisma'
import { warsawDateKey } from './tasks'

const ODBIOR_WAIT_DAYS = 3
const UMOWA_WARN_DAYS = 14
const DAY = 86_400_000

const OPEN_TASK_STATUSES = ['PLANOWANE', 'W_TOKU', 'WSTRZYMANE', 'DO_ODBIORU']

function fmtShortDate(d: Date): string {
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit' }).format(d)
}

/** Poniedziałek tygodnia zawierającego datę (Europe/Warsaw), jako yyyy-mm-dd. */
export function mondayKey(d: Date): string {
  const key = warsawDateKey(d) // yyyy-mm-dd w Warszawie
  const [y, m, dd] = key.split('-').map(Number)
  const noon = new Date(Date.UTC(y, m - 1, dd, 12))
  const dow = (noon.getUTCDay() + 6) % 7 // pon=0
  return warsawDateKey(new Date(noon.getTime() - dow * DAY))
}

export type BudowaRuleRow = {
  title: string
  description: string
  type: string
  source: string
  ruleKey: string
  dueAt: Date
  constructionTaskId?: string
}

/** Wiersze zadań-przypomnień z aktualnego stanu harmonogramu. */
export async function buildBudowaTaskRows(now: Date): Promise<BudowaRuleRow[]> {
  const rows: BudowaRuleRow[] = []
  const week = mondayKey(now)
  const todayKey = warsawDateKey(now)

  // --- opóźnienia (zadania i kamienie po planowym końcu) ---
  const late = await prisma.constructionTask.findMany({
    where: { status: { in: OPEN_TASK_STATUSES } },
    select: {
      id: true,
      number: true,
      name: true,
      isMilestone: true,
      plannedEnd: true,
      subcontractor: { select: { name: true } },
    },
  })
  for (const t of late) {
    const endKey = warsawDateKey(t.plannedEnd)
    if (endKey >= todayKey) continue
    const days = Math.round((Date.parse(todayKey) - Date.parse(endKey)) / DAY)
    const label = t.number ? `${t.number} ${t.name}` : t.name
    const who = t.subcontractor ? ` (${t.subcontractor.name})` : ''
    rows.push({
      title: t.isMilestone
        ? `Budowa: kamień milowy po terminie — ${label} (${days} dni)`
        : `Budowa: opóźnione — ${label}${who} (${days} dni)`,
      description: `Planowy koniec: ${fmtShortDate(t.plannedEnd)}. Zaktualizuj termin w harmonogramie albo wyjaśnij przyczynę (/budowa/harmonogram).`,
      type: 'INNE',
      source: 'RULE',
      ruleKey: `BUDOWA_OPOZNIENIE:${t.id}:${week}`,
      dueAt: t.plannedEnd,
      constructionTaskId: t.id,
    })
  }

  // --- odbiory czekające > 3 dni ---
  const waiting = await prisma.constructionTask.findMany({
    where: {
      status: 'DO_ODBIORU',
      updatedAt: { lte: new Date(now.getTime() - ODBIOR_WAIT_DAYS * DAY) },
    },
    select: { id: true, number: true, name: true, subcontractor: { select: { name: true } } },
  })
  for (const t of waiting) {
    const label = t.number ? `${t.number} ${t.name}` : t.name
    const who = t.subcontractor ? ` (${t.subcontractor.name})` : ''
    rows.push({
      title: `Budowa: odbiór czeka — ${label}${who}`,
      description: `Kierownik zgłosił gotowość do odbioru ponad ${ODBIOR_WAIT_DAYS} dni temu. Odbierz w widoku Lista (/budowa/harmonogram?widok=lista).`,
      type: 'INNE',
      source: 'RULE',
      ruleKey: `BUDOWA_ODBIOR:${t.id}`,
      dueAt: now,
      constructionTaskId: t.id,
    })
  }

  // --- kończące się umowy podwykonawców z niedokończonymi zadaniami ---
  const horizon = new Date(now.getTime() + UMOWA_WARN_DAYS * DAY)
  const contracts = await prisma.subContract.findMany({
    where: {
      status: 'AKTYWNA',
      endDate: { not: null, lte: horizon },
      constructionTasks: { some: { status: { in: OPEN_TASK_STATUSES } } },
    },
    select: {
      id: true,
      title: true,
      endDate: true,
      subcontractor: { select: { name: true } },
      _count: { select: { constructionTasks: { where: { status: { in: OPEN_TASK_STATUSES } } } } },
    },
  })
  for (const c of contracts) {
    const end = c.endDate as Date
    const verb = end.getTime() < now.getTime() ? 'minęła' : `kończy się ${fmtShortDate(end)}`
    rows.push({
      title: `Budowa: umowa ${c.subcontractor.name} ${verb}, otwartych zadań: ${c._count.constructionTasks}`,
      description: `Umowa „${c.title}" — dokończ zakres, przedłuż umowę (aneks) albo zamknij ją w /przeroby/podwykonawcy.`,
      type: 'INNE',
      source: 'RULE',
      ruleKey: `BUDOWA_UMOWA_KONIEC:${c.id}:${warsawDateKey(end)}`,
      dueAt: end,
    })
  }

  return rows
}

/**
 * Reconcile reguł budowy: domyka nieaktualne Taski.
 * Wołane z reconcileRuleTasks w lib/tasks.ts. Zwraca decyzję albo null (nie moja reguła).
 */
export async function reconcileBudowaTask(
  rule: string,
  ruleKey: string,
  constructionTask: { status: string; plannedEnd: Date } | null,
  now: Date,
): Promise<'done' | 'cancel' | null> {
  if (rule === 'BUDOWA_OPOZNIENIE') {
    const weekInKey = ruleKey.split(':')[2]
    if (!constructionTask) return 'cancel'
    if (constructionTask.status === 'ZAKONCZONE') return 'done'
    if (constructionTask.status === 'ANULOWANE') return 'cancel'
    if (warsawDateKey(constructionTask.plannedEnd) >= warsawDateKey(now)) return 'cancel' // termin przesunięty
    if (weekInKey !== mondayKey(now)) return 'cancel' // nowy tydzień — powstanie świeże
    return null
  }
  if (rule === 'BUDOWA_ODBIOR') {
    if (!constructionTask) return 'cancel'
    if (constructionTask.status === 'ZAKONCZONE') return 'done' // odebrane
    if (constructionTask.status !== 'DO_ODBIORU') return 'cancel' // wrócił do pracy / anulowany
    return null
  }
  if (rule === 'BUDOWA_UMOWA_KONIEC') {
    const [, subContractId, endKey] = ruleKey.split(':')
    const c = await prisma.subContract.findUnique({
      where: { id: subContractId },
      select: {
        status: true,
        endDate: true,
        _count: { select: { constructionTasks: { where: { status: { in: OPEN_TASK_STATUSES } } } } },
      },
    })
    if (!c) return 'cancel'
    if (c.status !== 'AKTYWNA') return 'done' // umowa zamknięta/aneksowana — temat obsłużony
    if (!c.endDate || warsawDateKey(c.endDate) !== endKey) return 'cancel' // termin zmieniony (aneks)
    if (c._count.constructionTasks === 0) return 'done' // zakres dokończony
    return null
  }
  return null
}
