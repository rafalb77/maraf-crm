import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'
import { json, jsonError, resolveDispatchToken } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/public/odbiory/w/[token]/submit — „ZGŁOŚ N POZYCJI DO PONOWNEGO ODBIORU".
 * Jedno zbiorcze powiadomienie dla prowadzącego (mail + zadanie na pulpicie) zamiast
 * N maili. Wykonawca może zgłosić kilka razy (kolejne partie).
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const dispatch = await resolveDispatchToken(params.token)
  if (!dispatch) return jsonError('Link jest nieprawidłowy albo wygasł', 404)
  let body: any = {}
  try {
    body = await req.json()
  } catch {}
  const note = body?.note ? String(body.note).slice(0, 1000) : null

  const fixed = dispatch.items.filter((i) => i.defect.status === 'POPRAWIONA')
  const open = dispatch.items.filter((i) => i.defect.status === 'DO_POPRAWY')
  if (fixed.length === 0) return jsonError('Najpierw oznacz przynajmniej jedną pozycję jako poprawioną')

  const now = new Date()
  await prisma.dispatch.update({ where: { id: dispatch.id }, data: { status: 'ZGLOSZONY', submittedAt: now } })

  const inspection = dispatch.inspection
  const title = `Ponowny odbiór: ${dispatch.subcontractor.name} zgłosił ${fixed.length} ${plural(fixed.length, 'pozycję', 'pozycje', 'pozycji')}${inspection ? ` (${inspection.number})` : ''}`
  const description =
    `${inspection ? inspection.scopeName + '\n' : ''}` +
    `Zgłoszone jako poprawione: ${fixed.map((i) => '#' + i.defect.seq).join(', ')}` +
    (open.length ? `\nNadal otwarte: ${open.map((i) => '#' + i.defect.seq).join(', ')}` : '') +
    (note ? `\nUwaga wykonawcy: ${note}` : '')
  await prisma.task.create({
    data: {
      title,
      description,
      type: 'INNE',
      status: 'OTWARTE',
      dueAt: new Date(now.getTime() + 3 * 24 * 3600 * 1000),
      source: 'RULE',
      ruleKey: `ODBIORY_PONOWNY:${dispatch.id}:${now.toISOString().slice(0, 10)}:${fixed.length}`,
      assigneeId: inspection?.inspectorId || null,
      investmentId: dispatch.investmentId,
    },
  }).catch(() => null)

  // jeden mail do prowadzącego (jeśli ma adres)
  let mailed = false
  const inspector = inspection?.inspectorId
    ? await prisma.user.findUnique({ where: { id: inspection.inspectorId }, select: { email: true } })
    : null
  const to = inspector?.email || process.env.ADMIN_EMAIL || null
  if (to) {
    try {
      const base = (process.env.NEXTAUTH_URL || req.nextUrl.origin).replace(/\/$/, '')
      await sendEmail({
        to,
        subject: title,
        html:
          `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111"><p>${escapeHtml(title)}.</p>` +
          `<p>${escapeHtml(description).replace(/\n/g, '<br>')}</p>` +
          (inspection ? `<p><a href="${base}/odbiory/${inspection.id}">Otwórz odbiór w CRM</a> · <a href="${base}/odbiory/teren/${inspection.id}?tryb=weryfikacja">Tryb ponownego odbioru na tablecie</a></p>` : '') +
          `</div>`,
        headers: { 'X-Auto-Response-Suppress': 'All' },
      })
      mailed = true
    } catch {
      mailed = false
    }
  }
  return json({ ok: true, count: fixed.length, open: open.length, mailed })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one
  const m10 = n % 10
  const m100 = n % 100
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
