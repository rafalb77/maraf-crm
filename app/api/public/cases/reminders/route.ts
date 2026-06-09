import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'
import { fmtDate, fmtDaysFromNow } from '@/lib/finanse-format'
import { CASE_CLOSED_STATUSES, CASE_TYPE_LABELS, type CaseType } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cron dzienny — przypomnienia o zbliżających się / przekroczonych terminach spraw.
 * Wywoływany przez Coolify scheduled task (np. codziennie 08:00). Chroniony sekretem
 * CASES_CRON_SECRET (query ?secret= albo nagłówek Authorization: Bearer).
 *
 * Logika: bierze sprawy otwarte z terminem ≤ dziś+N dni (domyślnie 3; też przeterminowane),
 * którym dziś jeszcze nie wysłano przypomnienia (reminderSentAt null lub starsze niż dziś).
 * Grupuje per prowadzący (owner.email) i wysyła jeden zbiorczy mail. Sprawy bez
 * prowadzącego trafiają do fallbacku (CASES_REMINDER_TO → ADMIN_EMAIL). Po wysłaniu
 * ustawia reminderSentAt = teraz → co najwyżej 1 przypomnienie/dzień/sprawę.
 */

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CASES_CRON_SECRET
  if (!secret) return false
  const fromQuery = new URL(req.url).searchParams.get('secret')
  const fromHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return fromQuery === secret || fromHeader === secret
}

type CaseRow = {
  id: string
  number: string
  type: string
  title: string
  deadline: Date | null
  owner: { email: string; name: string | null } | null
}

function buildHtml(rows: CaseRow[]): string {
  const items = rows
    .map((c) => {
      const overdue = c.deadline ? new Date(c.deadline).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0) : false
      const color = overdue ? '#dc2626' : '#d97706'
      return `<li style="margin-bottom:10px">
        <a href="#" style="font-family:monospace;color:#6b7280">${c.number}</a>
        <span style="background:#eef;border-radius:4px;padding:1px 6px;font-size:12px;margin:0 4px">${CASE_TYPE_LABELS[c.type as CaseType] || c.type}</span>
        <strong>${c.title}</strong><br/>
        <span style="color:${color};font-weight:600">${overdue ? '⚠ PO TERMINIE — ' : 'Termin: '}${fmtDate(c.deadline)} (${fmtDaysFromNow(c.deadline)})</span>
      </li>`
    })
    .join('')
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
    <p>Sprawy wymagające uwagi (zbliżający się lub przekroczony termin):</p>
    <ul style="padding-left:18px">${items}</ul>
    <p style="color:#6b7280;font-size:12px">Wiadomość automatyczna z CRM. Wejdź do modułu <em>Sprawy</em>, aby zareagować.</p>
  </div>`
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const daysParam = parseInt(new URL(req.url).searchParams.get('days') || '3', 10)
  const days = isNaN(daysParam) ? 3 : daysParam

  const now = new Date()
  const horizon = new Date(now)
  horizon.setDate(horizon.getDate() + days)
  horizon.setHours(23, 59, 59, 999)
  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)

  const candidates = (await prisma.case.findMany({
    where: {
      deadline: { lte: horizon },
      status: { notIn: CASE_CLOSED_STATUSES },
      OR: [{ reminderSentAt: null }, { reminderSentAt: { lt: startToday } }],
    },
    select: {
      id: true,
      number: true,
      type: true,
      title: true,
      deadline: true,
      owner: { select: { email: true, name: true } },
    },
    orderBy: { deadline: 'asc' },
  })) as CaseRow[]

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0, groups: 0, message: 'Brak spraw do przypomnienia' })
  }

  const fallbackTo = process.env.CASES_REMINDER_TO || process.env.ADMIN_EMAIL || ''

  // Grupowanie per adres odbiorcy
  const groups = new Map<string, CaseRow[]>()
  for (const c of candidates) {
    const to = c.owner?.email || fallbackTo
    if (!to) continue // brak odbiorcy — pomijamy (nie ustawiamy reminderSentAt, spróbujemy następnym razem)
    if (!groups.has(to)) groups.set(to, [])
    groups.get(to)!.push(c)
  }

  let reminded = 0
  let sentGroups = 0
  const sentIds: string[] = []

  for (const [to, rows] of groups) {
    try {
      await sendEmail({
        to,
        subject: `Sprawy: ${rows.length} ${rows.length === 1 ? 'termin' : 'terminów'} wymaga uwagi`,
        html: buildHtml(rows),
      })
      sentGroups++
      reminded += rows.length
      sentIds.push(...rows.map((r) => r.id))
    } catch (e: any) {
      console.error('[cases-reminders] wysyłka nieudana dla', to, e?.message || e)
      // nie ustawiamy reminderSentAt → ponowimy następnym razem
    }
  }

  if (sentIds.length > 0) {
    await prisma.case.updateMany({ where: { id: { in: sentIds } }, data: { reminderSentAt: now } })
  }

  return NextResponse.json({ ok: true, reminded, groups: sentGroups })
}

export async function POST(req: NextRequest) {
  return handle(req)
}

// GET dozwolony dla wygody testowania (też wymaga sekretu).
export async function GET(req: NextRequest) {
  return handle(req)
}
