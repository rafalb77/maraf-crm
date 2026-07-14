// Tygodniowy digest budowy (Etap 4, decyzja Rafała nr 8 — "raz w tygodniu do wszystkich").
// Składa podsumowanie ostatnich 7 dni + stan otwartych spraw w HTML maila.
// Reuse: loadBudowaCostData (alerty kosztowe) + getOpenBudowaTasks (przypomnienia).

import { prisma } from './prisma'
import { loadBudowaCostData, costSummary } from './budowa-alerts'
import { getOpenBudowaTasks } from './budowa-tasks'

const DAY = 86_400_000

function fmtMoney(n: number): string {
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' zł'
}
function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit' }).format(d)
}
function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}

export type WeeklyDigest = { subject: string; html: string; text: string; hasContent: boolean }

export async function buildWeeklyDigest(baseUrl: string): Promise<WeeklyDigest | null> {
  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, plannedEndDate: true },
  })
  if (!investment) return null

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * DAY)

  const [reports, newPhotos, comments, openRisks, delayedTasks, costData, openTasks] = await Promise.all([
    prisma.siteReport.findMany({
      where: { investmentId: investment.id, reportDate: { gte: weekAgo } },
      orderBy: { reportDate: 'desc' },
      select: { reportDate: true, workDone: true, hasIssue: true, needsDecision: true, authorEmail: true },
    }),
    prisma.sitePhoto.count({ where: { investmentId: investment.id, takenAt: { gte: weekAgo } } }),
    prisma.constructionComment.count({
      where: { investmentId: investment.id, needsClarification: true, resolvedAt: null },
    }),
    prisma.constructionRisk.findMany({
      where: { investmentId: investment.id, status: { in: ['OTWARTE', 'MONITOROWANE'] } },
      orderBy: { createdAt: 'desc' },
      select: { kind: true, title: true, severity: true, impactDays: true },
    }),
    prisma.constructionTask.findMany({
      where: {
        investmentId: investment.id,
        isMilestone: false,
        status: { in: ['PLANOWANE', 'W_TOKU', 'WSTRZYMANE', 'DO_ODBIORU'] },
        plannedEnd: { lt: now },
      },
      select: { number: true, name: true, plannedEnd: true },
    }),
    loadBudowaCostData(investment.id),
    getOpenBudowaTasks(),
  ])

  const cost = costData ? costSummary(costData, now) : null
  const problems = openTasks.filter((t) => t.ruleKey?.startsWith('BUDOWA_PROBLEM')).length
  const decisions = openTasks.filter(
    (t) => t.ruleKey?.startsWith('BUDOWA_RAPORT_DECYZJA') || t.ruleKey?.startsWith('BUDOWA_WYJASNIENIE'),
  ).length

  const daysToEnd = investment.plannedEndDate
    ? Math.ceil((investment.plannedEndDate.getTime() - now.getTime()) / DAY)
    : null

  // czy jest cokolwiek warte wysłania
  const hasContent =
    reports.length > 0 ||
    newPhotos > 0 ||
    problems > 0 ||
    decisions > 0 ||
    comments > 0 ||
    openRisks.length > 0 ||
    delayedTasks.length > 0 ||
    (cost ? cost.overdueInvoiceCount + cost.stagesOverBudget + cost.toCheckCount > 0 : false)

  const sevEmoji: Record<string, string> = { KRYTYCZNE: '🔴', WYSOKIE: '🟠', SREDNIE: '🟡', NISKIE: '⚪' }

  // --- HTML ---
  const rows: string[] = []
  const stat = (emoji: string, label: string, value: string) =>
    `<tr><td style="padding:6px 10px;font-size:15px">${emoji} ${label}</td><td style="padding:6px 10px;font-size:15px;font-weight:600;text-align:right">${value}</td></tr>`

  rows.push(stat('📋', 'Raporty z budowy (7 dni)', String(reports.length)))
  if (newPhotos > 0) rows.push(stat('📷', 'Nowe zdjęcia', String(newPhotos)))
  if (delayedTasks.length > 0) rows.push(stat('⏰', 'Zadania opóźnione', String(delayedTasks.length)))
  if (decisions > 0) rows.push(stat('🟡', 'Sprawy czekające na decyzję', String(decisions)))
  if (problems > 0) rows.push(stat('⚠️', 'Zgłoszone problemy', String(problems)))
  if (comments > 0) rows.push(stat('🚩', 'Do wyjaśnienia (od prezesa)', String(comments)))
  if (openRisks.length > 0) rows.push(stat('🛡️', 'Otwarte ryzyka/blokery', String(openRisks.length)))
  if (cost && cost.overdueInvoiceCount > 0)
    rows.push(stat('🔴', 'Nieopłacone FV po terminie', `${cost.overdueInvoiceCount} • ${fmtMoney(cost.overdueAmount)}`))
  if (cost && cost.stagesOverBudget > 0) rows.push(stat('💸', 'Etapy nad budżetem', String(cost.stagesOverBudget)))
  if (cost && cost.toCheckCount > 0) rows.push(stat('🔎', 'Do sprawdzenia (bez rozliczenia)', String(cost.toCheckCount)))

  const riskList =
    openRisks.length > 0
      ? `<div style="margin-top:18px"><div style="font-weight:600;font-size:14px;margin-bottom:6px">Ryzyka i blokery</div>` +
        openRisks
          .slice(0, 6)
          .map(
            (r) =>
              `<div style="font-size:14px;padding:3px 0">${sevEmoji[r.severity] || '⚪'} ${r.kind === 'BLOKER' ? '⛔ ' : ''}${esc(r.title)}${r.impactDays ? ` <span style="color:#888">(~${r.impactDays} dni)</span>` : ''}</div>`,
          )
          .join('') +
        `</div>`
      : ''

  const lastReport = reports[0]
  const lastReportBlock = lastReport
    ? `<div style="margin-top:18px"><div style="font-weight:600;font-size:14px;margin-bottom:4px">Ostatni raport (${fmtDate(lastReport.reportDate)}${lastReport.authorEmail ? ' • ' + esc(lastReport.authorEmail) : ''})</div><div style="font-size:14px;color:#444">${esc(lastReport.workDone).slice(0, 400)}</div></div>`
    : ''

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1F2D3F">
    <div style="background:linear-gradient(135deg,#1F2D3F,#2b3d54);color:#F2E8D6;padding:20px 24px;border-radius:12px 12px 0 0">
      <div style="font-size:20px;font-weight:700">🏗️ ${esc(investment.name)} — tydzień na budowie</div>
      <div style="font-size:14px;opacity:.85;margin-top:4px">
        ${fmtDate(weekAgo)}–${fmtDate(now)}
        ${daysToEnd !== null ? ` • ${daysToEnd >= 0 ? daysToEnd + ' dni do końca' : Math.abs(daysToEnd) + ' dni po terminie'}` : ''}
      </div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:18px 24px">
      <table style="width:100%;border-collapse:collapse">${rows.join('')}</table>
      ${riskList}
      ${lastReportBlock}
      <div style="margin-top:22px;text-align:center">
        <a href="${baseUrl}/budowa" style="display:inline-block;background:#C9A37A;color:#1F2D3F;text-decoration:none;font-weight:600;padding:10px 22px;border-radius:8px">Otwórz pulpit budowy</a>
      </div>
      <div style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center">Automatyczny tygodniowy raport z modułu Budowa — MARAF CRM.</div>
    </div>
  </div>`

  const textLines = [
    `${investment.name} — tydzień na budowie (${fmtDate(weekAgo)}–${fmtDate(now)})`,
    `Raporty: ${reports.length}, zdjęcia: ${newPhotos}, opóźnione zadania: ${delayedTasks.length}`,
    decisions ? `Decyzje czekają: ${decisions}` : '',
    problems ? `Problemy: ${problems}` : '',
    openRisks.length ? `Ryzyka/blokery: ${openRisks.length}` : '',
    cost && cost.overdueInvoiceCount ? `Nieopłacone FV po terminie: ${cost.overdueInvoiceCount} (${fmtMoney(cost.overdueAmount)})` : '',
    `${baseUrl}/budowa`,
  ].filter(Boolean)

  return {
    subject: `🏗️ ${investment.name} — tydzień na budowie (${fmtDate(now)})`,
    html,
    text: textLines.join('\n'),
    hasContent,
  }
}
