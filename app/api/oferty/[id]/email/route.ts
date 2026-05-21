import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, toFriendlyMailError } from '@/lib/mailer'
import { generateOfferPdf } from '@/lib/pdf-generator'

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { to, subject, message } = await req.json()
  if (!to) return NextResponse.json({ error: 'Brak adresu odbiorcy' }, { status: 400 })

  const offer = await prisma.offer.findUnique({
    where: { id },
    select: { id: true, number: true, clientId: true, status: true, totalGross: true },
  })
  if (!offer) return NextResponse.json({ error: 'Nie znaleziono oferty' }, { status: 404 })

  // Opcjonalna stopka z Settings (jesli user wpisal w UI). Tresc + tabela + sumy
  // sa w zalaczonym PDF — body maila jest celowo minimalne.
  const sig = await prisma.settings.findFirst({ where: { key: 'emailSignature' } })
  const emailSignature = sig?.value || ''

  const messageHtml = escapeHtml(message || '').replace(/\n/g, '<br>')

  const html = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:760px;">
  <p>${messageHtml}</p>
  ${emailSignature ? `
    <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;white-space:pre-wrap;">
      ${escapeHtml(emailSignature)}
    </div>` : ''}
</div>`

  const text = `${message || ''}${emailSignature ? '\n\n' + emailSignature : ''}`

  // Generuj PDF z oferta — dolaczany jako attachment
  let pdfBuffer: Buffer | null = null
  try {
    pdfBuffer = await generateOfferPdf(id)
  } catch (e: any) {
    // PDF nie jest blokujacy — jak Chromium nie odpala, wysylamy bez attachmentu
    console.warn('[oferty.email] PDF generation skipped:', e?.message)
  }

  // Bezpieczna nazwa pliku PDF (slash w numerze oferty → myslnik)
  const pdfFilename = `${(offer.number || 'oferta').replace(/[/\\]/g, '-')}.pdf`
  const attachments = pdfBuffer
    ? [{ filename: pdfFilename, content: pdfBuffer, contentType: 'application/pdf' }]
    : undefined

  let mailInfo: any
  try {
    mailInfo = await sendEmail({
      to,
      subject: subject || `Wiadomość od MARAF Development — ${offer.number}`,
      html,
      text,
      attachments,
      // Headers transactional — sygnał dla anti-spam i klasyfikacji folderów
      // ("to nie marketing, to transakcyjny mail")
      headers: {
        'X-Auto-Response-Suppress': 'All',
        'Auto-Submitted': 'auto-generated',
        'X-Mailer': 'MARAF CRM',
      },
    })
    console.log('[oferty.email] sent:', {
      // NIE logujemy adresów (to/accepted/rejected) — PII w logach Coolify
      acceptedCount: mailInfo?.accepted?.length ?? 0,
      rejectedCount: mailInfo?.rejected?.length ?? 0,
      messageId: mailInfo?.messageId,
      response: mailInfo?.response,
    })
  } catch (e: any) {
    console.error('[oferty.email] error:', e?.message, e?.code)
    const f = toFriendlyMailError(e)
    return NextResponse.json(
      { error: f.message, code: f.code, technical: f.technical, isTransient: f.isTransient },
      { status: 502 },
    )
  }

  // Niektore serwery SMTP zwracaja "OK" ale rzeczywisty adres jest w 'rejected'
  // — wtedy mail nie dotarl. Traktujemy to jako blad.
  if (mailInfo?.rejected && Array.isArray(mailInfo.rejected) && mailInfo.rejected.length > 0) {
    return NextResponse.json(
      {
        error: `Serwer SMTP odrzucił adres: ${mailInfo.rejected.join(', ')}. Sprawdź poprawność adresu odbiorcy lub konfigurację SMTP.`,
        rejected: mailInfo.rejected,
        response: mailInfo.response,
      },
      { status: 502 },
    )
  }
  if (mailInfo?.accepted && Array.isArray(mailInfo.accepted) && mailInfo.accepted.length === 0) {
    return NextResponse.json(
      {
        error: 'Serwer SMTP nie potwierdził dostarczenia (accepted: []). Wiadomość mogła nie dotrzeć.',
        response: mailInfo.response,
      },
      { status: 502 },
    )
  }

  // Aktywność na karcie klienta + status WYSLANA jeśli był SZKIC
  if (offer.clientId) {
    await prisma.activity.create({
      data: {
        clientId: offer.clientId,
        type: 'EMAIL',
        title: `Wysłano ofertę ${offer.number}`,
        content: `Wysłano na ${to}.\nKwota brutto: ${fmt(offer.totalGross)} zł`,
      },
    })
  }
  if (offer.status === 'SZKIC') {
    await prisma.offer.update({ where: { id }, data: { status: 'WYSLANA' } })
  }

  return NextResponse.json({
    success: true,
    messageId: mailInfo?.messageId || null,
    accepted: mailInfo?.accepted || null,
    response: mailInfo?.response || null,
  })
}
