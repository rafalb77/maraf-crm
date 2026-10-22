import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { sendEmail, toFriendlyMailError } from '@/lib/mailer'
import { generateProtocolPdf, storeProtocolPdf } from '@/lib/odbiory/protocol-pdf'
import { formatDatePl } from '@/lib/odbiory/codes'
import { resultLabel } from '@/lib/odbiory/constants'
import { json, jsonError, requireUser } from '@/lib/odbiory/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_ATTACHMENT = 18 * 1024 * 1024
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function esc(s: unknown) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * POST /api/odbiory/inspections/[id]/protocol/email — protokół (PDF) mailem do wykonawcy.
 * body: { to: string (adresy po przecinku), message?: string, withPhotos?: boolean, ccMe?: boolean }
 * Wykonawca nie ma dostępu do aplikacji — dostaje gotowy PDF. Podpisy NIE są wymagane:
 * brak podpisu = pusta linia do podpisu odręcznego w PDF. PDF zapisywany w uploads
 * (Inspection.protocolUrl) + AuditLog NOTIFY_EMAIL jako dowód wysyłki.
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
  const to = String(body.to || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (to.length === 0) return jsonError('Podaj adres e-mail wykonawcy')
  const bad = to.find((a) => !EMAIL_RE.test(a))
  if (bad) return jsonError(`Nieprawidłowy adres: ${bad}`)
  const withPhotos = !!body.withPhotos
  const ccMe = body.ccMe !== false && EMAIL_RE.test(user.email)
  const message = body.message ? String(body.message).slice(0, 4000) : ''

  let pdf: Buffer
  let filename: string
  let data
  try {
    ;({ pdf, filename, data } = await generateProtocolPdf(params.id, { withPhotos }))
  } catch (e: any) {
    console.error('[odbiory] protocol email pdf', e)
    return jsonError(`Nie udało się wygenerować PDF: ${e?.message || 'błąd'}`, 500)
  }
  if (pdf.length > MAX_ATTACHMENT) {
    return jsonError(`PDF ma ${(pdf.length / 1024 / 1024).toFixed(1)} MB — za duży na załącznik. Wyślij bez zdjęć.`)
  }
  const r = data.r
  const defects = data.defects
  const isRe = !!r.parent
  const sig = await prisma.settings.findFirst({ where: { key: 'emailSignature' } })
  const signature = sig?.value || ''
  const open = defects.filter((d) => d.status === 'DO_POPRAWY' || d.status === 'POPRAWIONA' || d.status === 'SPORNA').length
  const dueDates = defects.map((d) => d.dueAt).filter((d): d is Date => !!d)
  const dueAt = r.fixDueAt || (dueDates.length ? new Date(Math.max(...dueDates.map((d) => d.getTime()))) : null)
  const subject = `${isRe ? 'Protokół ponownego odbioru' : 'Protokół odbioru'} ${r.number} — ${r.scopeName}`

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:760px">
  <p>Dzień dobry,</p>
  <p>w załączeniu ${isRe ? `protokół ponownego odbioru robót (sprawdzenie usunięcia usterek z protokołu ${esc(r.parent?.number || '')})` : 'protokół odbioru robót'} <b>${esc(r.number)}</b> (${esc(r.scopeName)}) z dnia ${formatDatePl(r.finishedAt || r.startedAt)}${r.subcontractor ? ` dla firmy ${esc(r.subcontractor.name)}` : ''}.</p>
  ${message ? `<p style="white-space:pre-wrap">${esc(message)}</p>` : ''}
  <table style="border-collapse:collapse;font-size:13px">
    <tr><td style="padding:2px 10px 2px 0;color:#6b7280">Wynik</td><td>${esc(r.result ? resultLabel(r.kind, r.result) : 'w toku')}</td></tr>
    <tr><td style="padding:2px 10px 2px 0;color:#6b7280">Usterki</td><td>${defects.length}, otwarte ${open}, pilne ${defects.filter((d) => d.priority === 'PILNY').length}</td></tr>
    <tr><td style="padding:2px 10px 2px 0;color:#6b7280">Termin usunięcia</td><td>${dueAt ? formatDatePl(dueAt) : 'wg pozycji w załączniku'}</td></tr>
    <tr><td style="padding:2px 10px 2px 0;color:#6b7280">Prowadzący odbiór</td><td>${esc(r.inspectorName || '—')}</td></tr>
  </table>
  <p>Załącznik nr 1 (rzut z numerami usterek, legenda i lista wad) jest częścią protokołu. Prosimy o usunięcie usterek w terminie i zgłoszenie ich do ponownego odbioru.</p>
  ${signature ? `<div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;white-space:pre-wrap">${esc(signature)}</div>` : ''}
</div>`
  const text = `${isRe ? 'Protokół ponownego odbioru' : 'Protokół odbioru'} ${r.number} (${r.scopeName}) z dnia ${formatDatePl(r.finishedAt || r.startedAt)} w załączeniu.\n${message ? message + '\n' : ''}Usterki: ${defects.length}, otwarte ${open}. Termin usunięcia: ${dueAt ? formatDatePl(dueAt) : 'wg pozycji w załączniku'}.${signature ? '\n\n' + signature : ''}`

  let info: any
  try {
    info = await sendEmail({
      to: ccMe && !to.includes(user.email) ? [...to, user.email] : to,
      subject,
      html,
      text,
      attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    })
  } catch (e: any) {
    const f = toFriendlyMailError(e)
    return jsonError(f.message || 'Nie udało się wysłać maila', 502)
  }
  if (info?.rejected?.length || (info?.accepted && info.accepted.length === 0)) {
    return jsonError(`Serwer pocztowy odrzucił adres: ${(info.rejected || []).join(', ') || to.join(', ')}`, 502)
  }

  let protocolUrl: string | null = null
  try {
    protocolUrl = await storeProtocolPdf(r.id, pdf, filename)
  } catch (e) {
    console.warn('[odbiory] storeProtocolPdf', e)
  }
  const sentAt = new Date()
  void audit({
    userId: user.id,
    userEmail: user.email,
    action: 'NOTIFY_EMAIL',
    entity: 'Inspection',
    entityId: r.id,
    metadata: { protocol: r.number, to, ccMe, withPhotos, bytes: pdf.length, protocolUrl, sentAt: sentAt.toISOString() },
  })
  return json({ ok: true, to, sentAt: sentAt.toISOString(), protocolUrl, bytes: pdf.length })
}
