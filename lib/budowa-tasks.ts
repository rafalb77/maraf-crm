// Reguły Task modułu Budowa (Etap 1) — event-driven, NIE cron.
//
// W odróżnieniu od RES_EXPIRE/PAYMENT_DUE (generowane przebiegiem silnika w
// lib/tasks.ts) zadania budowy powstają W MOMENCIE zdarzenia: zapis check-inu
// z flagą / flaga „do wyjaśnienia" od prezesa. Idempotencja przez unikalny
// Task.ruleKey (createMany + skipDuplicates — jak w silniku).
//
// Prefiksy ruleKey (jeden prefiks = jeden typ źródła, id zawsze na pozycji [1]):
//  - BUDOWA_PROBLEM:<reportId>        — kierownik zgłosił problem
//  - BUDOWA_RAPORT_DECYZJA:<reportId> — kierownik prosi o decyzję Rafała
//  - BUDOWA_WYKONAWCA:<reportId>      — coś wymaga reakcji wykonawcy (Rafał egzekwuje)
//  - BUDOWA_WYJASNIENIE:<commentId>   — prezes oznaczył „do wyjaśnienia"
//
// Domykanie: to są zadania „ludzkie" — Rafał odhacza ręcznie. Wyjątek:
// BUDOWA_WYJASNIENIE domyka się przy rozwiązaniu komentarza (closeClarificationTask
// wołane z PATCH /api/budowa/comments/[id]) — bez rozszerzania cron-reconcile.
//
// Task.type = 'INNE' świadomie (nowa wartość typu wymagałaby zmian w widgetach);
// rozpoznawalność daje prefiks tytułu „Budowa:". dueAt = dziś → koszyk DZIŚ
// w widgecie (wysoki priorytet, patrz computeBucket w lib/tasks.ts).

import { prisma } from './prisma'

function trim(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ')
  return t.length <= max ? t : t.slice(0, max - 1) + '…'
}

export type ReportForTasks = {
  id: string
  workDone: string
  hasIssue: boolean
  issueNote: string | null
  needsDecision: boolean
  decisionNote: string | null
  needsContractorAction: boolean
  contractorActionNote: string | null
  contractorActionSubcontractorId: string | null
  authorEmail: string | null
}

/** Tworzy Taski z flag check-inu. Idempotentne (ruleKey unique + skipDuplicates). */
export async function createReportFlagTasks(report: ReportForTasks): Promise<number> {
  const rows: {
    title: string
    description: string
    type: string
    source: string
    ruleKey: string
    dueAt: Date
  }[] = []
  const now = new Date()
  const author = report.authorEmail ? `Zgłosił: ${report.authorEmail}. ` : ''

  if (report.hasIssue) {
    rows.push({
      title: `Budowa: problem — ${trim(report.issueNote || report.workDone, 80)}`,
      description: `${author}${report.issueNote || ''}\nSzczegóły w dzienniku budowy (/budowa/dziennik).`,
      type: 'INNE',
      source: 'RULE',
      ruleKey: `BUDOWA_PROBLEM:${report.id}`,
      dueAt: now,
    })
  }
  if (report.needsDecision) {
    rows.push({
      title: `Budowa: potrzebna decyzja — ${trim(report.decisionNote || report.workDone, 80)}`,
      description: `${author}${report.decisionNote || ''}\nSzczegóły w dzienniku budowy (/budowa/dziennik).`,
      type: 'INNE',
      source: 'RULE',
      ruleKey: `BUDOWA_RAPORT_DECYZJA:${report.id}`,
      dueAt: now,
    })
  }
  if (report.needsContractorAction) {
    let contractor = ''
    if (report.contractorActionSubcontractorId) {
      const sub = await prisma.subcontractor.findUnique({
        where: { id: report.contractorActionSubcontractorId },
        select: { name: true },
      })
      if (sub) contractor = ` (${sub.name})`
    }
    rows.push({
      title: `Budowa: reakcja wykonawcy${contractor} — ${trim(report.contractorActionNote || report.workDone, 70)}`,
      description: `${author}${report.contractorActionNote || ''}\nSzczegóły w dzienniku budowy (/budowa/dziennik).`,
      type: 'INNE',
      source: 'RULE',
      ruleKey: `BUDOWA_WYKONAWCA:${report.id}`,
      dueAt: now,
    })
  }

  if (rows.length === 0) return 0
  const res = await prisma.task.createMany({ data: rows, skipDuplicates: true })
  return res.count
}

/** Task z flagi „do wyjaśnienia" (prezes). */
export async function createClarificationTask(comment: {
  id: string
  body: string
  authorEmail: string | null
}): Promise<void> {
  const author = comment.authorEmail ? `Zgłosił: ${comment.authorEmail}. ` : ''
  await prisma.task.createMany({
    data: [
      {
        title: `Budowa: do wyjaśnienia — ${trim(comment.body || 'sprawa oznaczona z Widoku Prezesa', 80)}`,
        description: `${author}${comment.body || ''}\nSzczegóły w dzienniku budowy (/budowa/dziennik).`,
        type: 'INNE',
        source: 'RULE',
        ruleKey: `BUDOWA_WYJASNIENIE:${comment.id}`,
        dueAt: new Date(),
      },
    ],
    skipDuplicates: true,
  })
}

/** Auto-domknięcie Taska po rozwiązaniu komentarza „do wyjaśnienia". */
export async function closeClarificationTask(commentId: string): Promise<void> {
  await prisma.task.updateMany({
    where: { ruleKey: `BUDOWA_WYJASNIENIE:${commentId}`, status: 'OTWARTE' },
    data: { status: 'ZROBIONE', autoCompleted: true, completedAt: new Date() },
  })
}

/** Otwarte zadania budowy (do kafli alertów na dashboardzie i w Widoku Prezesa). */
export async function getOpenBudowaTasks() {
  return prisma.task.findMany({
    where: { status: 'OTWARTE', ruleKey: { startsWith: 'BUDOWA_' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, ruleKey: true, createdAt: true },
  })
}
