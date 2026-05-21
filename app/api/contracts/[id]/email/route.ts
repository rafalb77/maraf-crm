import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, toFriendlyMailError } from '@/lib/mailer'
import { generateContractDocx } from '@/lib/contract-generator'

export const runtime = 'nodejs'

function escapeHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * POST /api/contracts/[id]/email — wysyła umowę mailem do klienta.
 * Body: { to, subject, message }. DOCX dołączany jako załącznik gdy umowa jest
 * REZERWACYJNA (jedyny typ z szablonem) — dla innych typów mail leci bez
 * załącznika (non-blocking). Gate 'sales' przez middleware.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, subject, message } = await req.json()
  if (!to) return NextResponse.json({ error: 'Brak adresu odbiorcy' }, { status: 400 })

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      contractClients: { include: { client: true }, orderBy: { position: 'asc' } },
      contractUnits: { include: { unit: true } },
    },
  })
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })

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

  // DOCX tylko dla rezerwacyjnej (jedyny szablon). Non-blocking — jak generacja
  // padnie, mail leci bez załącznika.
  let docxBuffer: Buffer | null = null
  if (contract.type === 'REZERWACYJNA') {
    try {
      docxBuffer = await generateContractDocx(contract)
    } catch (e: any) {
      console.warn('[contracts.email] DOCX generation skipped:', e?.message)
    }
  }
  const docxFilename = `umowa_${(contract.number || 'umowa').replace(/[/\\]/g, '_')}.docx`
  const attachments = docxBuffer
    ? [{ filename: docxFilename, content: docxBuffer, contentType: DOCX_MIME }]
    : undefined

  let mailInfo: any
  try {
    mailInfo = await sendEmail({
      to,
      subject: subject || `Umowa ${contract.number} — MARAF Development`,
      html,
      text,
      attachments,
      headers: {
        'X-Auto-Response-Suppress': 'All',
        'Auto-Submitted': 'auto-generated',
        'X-Mailer': 'MARAF CRM',
      },
    })
    console.log('[contracts.email] sent:', {
      acceptedCount: mailInfo?.accepted?.length ?? 0,
      rejectedCount: mailInfo?.rejected?.length ?? 0,
      messageId: mailInfo?.messageId,
      response: mailInfo?.response,
      withAttachment: !!docxBuffer,
    })
  } catch (e: any) {
    console.error('[contracts.email] error:', e?.message, e?.code)
    const f = toFriendlyMailError(e)
    return NextResponse.json(
      { error: f.message, code: f.code, technical: f.technical, isTransient: f.isTransient },
      { status: 502 },
    )
  }

  if (mailInfo?.rejected && Array.isArray(mailInfo.rejected) && mailInfo.rejected.length > 0) {
    return NextResponse.json(
      { error: `Serwer SMTP odrzucił adres: ${mailInfo.rejected.join(', ')}. Sprawdź adres lub konfigurację SMTP.`, rejected: mailInfo.rejected },
      { status: 502 },
    )
  }
  if (mailInfo?.accepted && Array.isArray(mailInfo.accepted) && mailInfo.accepted.length === 0) {
    return NextResponse.json(
      { error: 'Serwer SMTP nie potwierdził dostarczenia (accepted: []). Wiadomość mogła nie dotrzeć.' },
      { status: 502 },
    )
  }

  // Audyt na karcie klienta + wpis w historii umowy
  if (contract.clientId) {
    await prisma.activity.create({
      data: {
        clientId: contract.clientId,
        type: 'EMAIL',
        title: `Wysłano umowę ${contract.number}`,
        content: `Umowa wysłana mailem${docxBuffer ? ' z załącznikiem DOCX' : ' (bez załącznika)'}.`,
      },
    })
  }
  await prisma.contractHistory.create({
    data: { contractId: contract.id, event: 'WYSLANO_MAILEM', details: `Umowa wysłana mailem do klienta` },
  })

  return NextResponse.json({ success: true, withAttachment: !!docxBuffer })
}
