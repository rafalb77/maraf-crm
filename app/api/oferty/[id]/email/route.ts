import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, toFriendlyMailError } from '@/lib/mailer'

const TYPE_LABELS: Record<string, string> = {
  MIESZKALNY: 'Mieszkanie',
  USLUGOWY: 'Usługowy',
  PARKING: 'Miejsce postojowe',
  GARAZ: 'Garaż',
  KOMORKA: 'Komórka',
}

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
    include: { client: true, items: { orderBy: { position: 'asc' } } },
  })
  if (!offer) return NextResponse.json({ error: 'Nie znaleziono oferty' }, { status: 404 })

  // Pobierz dane firmy z Settings
  const settings = await prisma.settings.findMany({
    where: { key: { in: ['companyName', 'investmentName', 'emailSignature'] } },
  })
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  const itemsHtml = offer.items
    .map(
      (it, idx) => `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">${idx + 1}.</td>
          <td style="padding:6px;border:1px solid #ddd;">${escapeHtml(TYPE_LABELS[it.unitType] || it.unitType)}</td>
          <td style="padding:6px;border:1px solid #ddd;font-family:monospace;"><strong>${escapeHtml(it.label)}</strong></td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${it.area.toFixed(2)} m²</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${fmt(it.pricePerSqmGross)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${fmt(it.priceGross)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;color:#92400e;">
            ${it.discountValue > 0 ? (it.discountType === 'PCT' ? `${it.discountValue}%` : `${fmt(it.discountValue)} zł`) : '—'}
          </td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;background:#dcfce7;font-weight:bold;">
            ${fmt(it.finalGross)} zł
          </td>
        </tr>`,
    )
    .join('')

  const messageHtml = escapeHtml(message || '').replace(/\n/g, '<br>')

  const html = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:760px;">
  <p>${messageHtml}</p>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:18px 0;">
    <h2 style="margin:0 0 8px 0;font-size:16px;">Oferta ${escapeHtml(offer.number || '')}</h2>
    ${offer.title ? `<p style="margin:0 0 6px 0;color:#6b7280;">${escapeHtml(offer.title)}</p>` : ''}
    ${settingsMap.investmentName ? `<p style="margin:0;color:#6b7280;">Inwestycja: <strong>${escapeHtml(settingsMap.investmentName)}</strong></p>` : ''}
    ${offer.validUntil ? `<p style="margin:6px 0 0 0;color:#6b7280;">Ważna do: <strong>${new Date(offer.validUntil).toLocaleDateString('pl-PL')}</strong></p>` : ''}
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead style="background:#f3f4f6;">
      <tr>
        <th style="padding:6px;border:1px solid #ddd;text-align:left;">Lp.</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:left;">Typ</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:left;">Nr</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:right;">Pow.</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:right;">Cena/m² brutto</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:right;">Cena brutto</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:right;">Rabat</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:right;">Po rabacie brutto</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <table style="margin-top:18px;width:100%;border-collapse:collapse;font-size:13px;">
    <tr>
      <td style="padding:6px;color:#6b7280;">Suma netto przed rabatem:</td>
      <td style="padding:6px;text-align:right;">${fmt(offer.subtotalNet)} zł</td>
    </tr>
    <tr>
      <td style="padding:6px;color:#6b7280;">Suma brutto przed rabatem:</td>
      <td style="padding:6px;text-align:right;">${fmt(offer.subtotalGross)} zł</td>
    </tr>
    ${offer.totalDiscountNet > 0 ? `
    <tr>
      <td style="padding:6px;color:#92400e;">Łączny rabat:</td>
      <td style="padding:6px;text-align:right;color:#92400e;">−${fmt(offer.totalDiscountGross)} zł brutto</td>
    </tr>` : ''}
    <tr style="border-top:2px solid #1f2937;">
      <td style="padding:8px 6px;font-size:15px;font-weight:bold;">Do zapłaty (brutto):</td>
      <td style="padding:8px 6px;text-align:right;font-size:18px;font-weight:bold;color:#15803d;">${fmt(offer.totalGross)} zł</td>
    </tr>
  </table>

  ${offer.notes ? `
    <div style="margin-top:18px;padding:12px;background:#fefce8;border:1px solid #fde68a;border-radius:6px;">
      <p style="margin:0 0 4px 0;font-weight:bold;font-size:12px;">Warunki / notatki:</p>
      <p style="margin:0;white-space:pre-wrap;">${escapeHtml(offer.notes)}</p>
    </div>` : ''}

  ${settingsMap.emailSignature ? `
    <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;white-space:pre-wrap;">
      ${escapeHtml(settingsMap.emailSignature)}
    </div>` : ''}
</div>`

  const text = `${message || ''}

Oferta ${offer.number}${offer.title ? ' — ' + offer.title : ''}

${offer.items.map((it, idx) => `${idx + 1}. ${it.label} (${TYPE_LABELS[it.unitType] || it.unitType}, ${it.area.toFixed(2)} m²) — ${fmt(it.finalGross)} zł brutto`).join('\n')}

──────────────
Suma netto przed rabatem: ${fmt(offer.subtotalNet)} zł
Suma brutto przed rabatem: ${fmt(offer.subtotalGross)} zł
${offer.totalDiscountNet > 0 ? `Łączny rabat (brutto): −${fmt(offer.totalDiscountGross)} zł\n` : ''}DO ZAPŁATY (brutto): ${fmt(offer.totalGross)} zł
`

  try {
    await sendEmail({ to, subject: subject || `Oferta ${offer.number}`, html, text })
  } catch (e: any) {
    const f = toFriendlyMailError(e)
    return NextResponse.json(
      { error: f.message, code: f.code, technical: f.technical, isTransient: f.isTransient },
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

  return NextResponse.json({ success: true })
}
