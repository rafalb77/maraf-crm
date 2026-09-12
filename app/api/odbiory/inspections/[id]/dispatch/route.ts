import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { sendEmail, toFriendlyMailError } from '@/lib/mailer'
import { formatDatePl } from '@/lib/odbiory/codes'
import { HttpError, createDispatch, json, jsonError, requireUser } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

function baseUrl(req: NextRequest): string {
  const env = process.env.NEXTAUTH_URL?.replace(/\/$/, '')
  return env || req.nextUrl.origin
}

/** GET /api/odbiory/inspections/[id]/dispatch — pakiety wykonawców tego odbioru. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  const rows = await prisma.dispatch.findMany({
    where: { inspectionId: params.id },
    orderBy: { createdAt: 'desc' },
    include: {
      subcontractor: { select: { id: true, name: true, email: true } },
      items: { select: { defect: { select: { id: true, seq: true, status: true, priority: true } } } },
    },
  })
  return json(
    rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      sentTo: r.sentTo,
      submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
      tokenExpiresAt: r.tokenExpiresAt.toISOString(),
      subcontractor: r.subcontractor,
      count: r.items.length,
      open: r.items.filter((i) => i.defect.status === 'DO_POPRAWY').length,
      fixed: r.items.filter((i) => i.defect.status === 'POPRAWIONA').length,
      accepted: r.items.filter((i) => i.defect.status === 'ODEBRANA').length,
    })),
  )
}

/**
 * POST /api/odbiory/inspections/[id]/dispatch — „Wyślij poprawki" do wykonawcy.
 * Body: { subcontractorId, send?: boolean, to?: string, message?: string }.
 * Tworzy pakiet (wszystkie otwarte usterki wykonawcy z tego odbioru), prywatny link
 * i — jeśli send — mail z podsumowaniem. Link wraca zawsze (można wysłać ręcznie, np. SMS-em).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const subcontractorId = String(body.subcontractorId || '')
  if (!subcontractorId) return jsonError('Wybierz wykonawcę')

  let created
  try {
    created = await createDispatch({ inspectionId: params.id, subcontractorId, user })
  } catch (e: any) {
    if (e instanceof HttpError) return jsonError(e.message, e.status)
    throw e
  }
  const { dispatch, token, defects, subcontractor, inspection } = created
  const url = `${baseUrl(req)}/w/${token}`
  const urgent = defects.filter((d) => d.priority === 'PILNY').length
  const dueDates = defects.map((d) => d.dueAt).filter((d): d is Date => !!d)
  const dueAt = dueDates.length ? new Date(Math.min(...dueDates.map((d) => d.getTime()))) : inspection.fixDueAt

  let sent = false
  let sentTo: string | null = null
  let mailError: string | null = null
  const to = body.to ? String(body.to).trim() : subcontractor.email
  if (body.send !== false && to) {
    const message = body.message ? String(body.message).slice(0, 2000) : ''
    const rows = defects
      .map(
        (d) =>
          `<tr><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${d.seq}</td>` +
          `<td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(d.unitNumber || '')}${d.room ? ' / ' + escapeHtml(d.room) : ''}</td>` +
          `<td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(d.title)}${d.priority === 'PILNY' ? ' <b style="color:#dc2626">PILNE</b>' : ''}</td>` +
          `<td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${d.dueAt ? formatDatePl(d.dueAt) : ''}</td></tr>`,
      )
      .join('')
    const html =
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">` +
      `<p>Dzień dobry,</p>` +
      `<p>w odbiorze <b>${escapeHtml(inspection.number)}</b> (${escapeHtml(inspection.scopeName)}) zapisaliśmy dla firmy <b>${escapeHtml(subcontractor.name)}</b> ` +
      `<b>${defects.length}</b> ${plural(defects.length, 'usterkę', 'usterki', 'usterek')} do poprawy` +
      (urgent ? `, w tym <b style="color:#dc2626">${urgent} ${plural(urgent, 'pilną', 'pilne', 'pilnych')}</b>` : '') +
      (dueAt ? `. Termin usunięcia: <b>${formatDatePl(dueAt)}</b>` : '') +
      `.</p>` +
      (message ? `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : '') +
      `<p><a href="${url}" style="display:inline-block;background:#1F2D3F;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Otwórz listę usterek z rzutem i zdjęciami</a></p>` +
      `<p style="color:#555">Link otwiera się na telefonie, bez logowania i bez instalowania aplikacji. Przy każdej usterce widać rzut, zdjęcie i opis. ` +
      `Po naprawie proszę dodać zdjęcie „po" i nacisnąć „Gotowe do ponownego odbioru". Link jest prywatny — prosimy nie przekazywać go dalej.</p>` +
      `<table style="border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;padding:4px 8px">Nr</th><th style="text-align:left;padding:4px 8px">Lokal</th><th style="text-align:left;padding:4px 8px">Usterka</th><th style="text-align:left;padding:4px 8px">Termin</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p style="color:#555;font-size:12px">Wiadomość wysłana z MARAF CRM przez ${escapeHtml(user.name)}.</p></div>`
    try {
      const info: any = await sendEmail({
        to,
        subject: `Usterki do poprawy — ${inspection.number} · ${inspection.scopeName} (${defects.length})`,
        html,
        headers: { 'X-Auto-Response-Suppress': 'All' },
      })
      const rejected = Array.isArray(info?.rejected) && info.rejected.length > 0
      const accepted = Array.isArray(info?.accepted) ? info.accepted.length : 1
      if (rejected || accepted === 0) mailError = 'Serwer pocztowy odrzucił adres odbiorcy'
      else {
        sent = true
        sentTo = to
      }
    } catch (e: any) {
      try {
        mailError = toFriendlyMailError(e).message
      } catch {
        mailError = e?.message || 'Błąd wysyłki'
      }
    }
  }

  await prisma.dispatch.update({
    where: { id: dispatch.id },
    data: { status: sent ? 'WYSLANY' : 'UTWORZONY', sentAt: sent ? new Date() : null, sentTo },
  })
  void audit({
    userId: user.id,
    userEmail: user.email,
    action: sent ? 'NOTIFY_EMAIL' : 'CREATE',
    entity: 'Dispatch',
    entityId: dispatch.id,
    metadata: { subcontractorId, count: defects.length, sent, sentTo },
  })
  return json({ id: dispatch.id, url, count: defects.length, urgent, dueAt: dueAt ? dueAt.toISOString() : null, sent, sentTo, mailError }, 201)
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
