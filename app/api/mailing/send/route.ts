import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendEmail, type Attachment } from '@/lib/mailer'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/mailing/send
 *
 * Accepts multipart/form-data:
 *   clientIds: JSON array of client IDs
 *   subject: string
 *   message: string (plain text or basic HTML; \n is converted to <br>)
 *   attachments: File[] (optional)
 *
 * Sends ONE email per recipient (not BCC) so we can personalize the body
 * and log activity per client. Variables: {imie}, {nazwisko}, {firma}.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const clientIdsRaw = formData.get('clientIds')
  const subject = String(formData.get('subject') || '').trim()
  const message = String(formData.get('message') || '').trim()
  const isHtml = String(formData.get('isHtml') || '') === '1'

  if (!clientIdsRaw || !subject || !message) {
    return NextResponse.json({ error: 'Brak wymaganych pól' }, { status: 400 })
  }

  let clientIds: string[]
  try {
    clientIds = JSON.parse(String(clientIdsRaw))
    if (!Array.isArray(clientIds) || clientIds.length === 0) throw new Error()
  } catch {
    return NextResponse.json({ error: 'Brak odbiorców' }, { status: 400 })
  }

  // Collect attachments from formData
  const attachments: Attachment[] = []
  const files = formData.getAll('attachments')
  for (const f of files) {
    if (f instanceof File && f.size > 0) {
      const buf = Buffer.from(await f.arrayBuffer())
      attachments.push({
        filename: f.name,
        content: buf,
        contentType: f.type || 'application/octet-stream',
      })
    }
  }

  // Load company signature
  const sigSetting = await prisma.settings.findUnique({ where: { key: 'emailSignature' } })
  const companySetting = await prisma.settings.findUnique({ where: { key: 'companyName' } })
  const signature = sigSetting?.value || ''
  const companyName = companySetting?.value || ''

  // Load clients
  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds }, email: { not: null } },
  })

  let sent = 0
  const failed: { email: string; reason: string }[] = []

  for (const c of clients) {
    if (!c.email) continue
    const personalized = personalize(message, {
      imie: c.firstName,
      nazwisko: c.lastName,
      firma: companyName,
    })
    const personalizedSubject = personalize(subject, {
      imie: c.firstName,
      nazwisko: c.lastName,
      firma: companyName,
    })
    const html = isHtml
      ? personalized + (signature ? `<br><br>${textToHtml(signature)}` : '')
      : textToHtml(personalized) + (signature ? `<br><br>${textToHtml(signature)}` : '')
    const text = isHtml
      ? htmlToText(personalized) + (signature ? `\n\n${signature}` : '')
      : personalized + (signature ? `\n\n${signature}` : '')
    try {
      await sendEmail({
        to: c.email,
        subject: personalizedSubject,
        html,
        text,
        attachments: attachments.length ? attachments : undefined,
      })
      sent++
      // Log as client activity
      await prisma.activity.create({
        data: {
          clientId: c.id,
          type: 'EMAIL',
          title: personalizedSubject,
          content: isHtml ? htmlToText(personalized) : personalized,
        },
      })
    } catch (e: any) {
      failed.push({ email: c.email, reason: e?.message || 'błąd' })
    }
  }

  return NextResponse.json({
    success: true,
    sent,
    failed,
    total: clients.length,
  })
}

function personalize(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (m, key) => vars[key.toLowerCase()] ?? m)
}

function textToHtml(s: string): string {
  // Escape minimally then convert newlines
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\n/g, '<br>')
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
