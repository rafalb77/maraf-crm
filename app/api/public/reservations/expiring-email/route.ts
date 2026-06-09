import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail, toFriendlyMailError } from '@/lib/mailer'
import { getExpiringSoftReservations } from '@/lib/reservations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/public/reservations/expiring-email
 * Cron — codzienny digest dla handlowca z listą rezerwacji miękkich kończących
 * się w ciągu 48h. Chroniony `RESERVATIONS_CRON_SECRET` (query ?secret= albo
 * `Authorization: Bearer ...`). Adres odbiorcy z `Settings.reservationsAlertEmail`;
 * jeśli brak — używa `NEXT_PUBLIC_ADMIN_EMAIL`. Idempotentny (mail wysłany
 * wielokrotnie tego samego dnia = ten sam stan; nie ma flagi sentAt).
 */

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.RESERVATIONS_CRON_SECRET
  if (!secret) return false
  const fromQuery = new URL(req.url).searchParams.get('secret')
  const fromHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return fromQuery === secret || fromHeader === secret
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(d))
}

function hoursLeft(d: Date | null | undefined): number {
  if (!d) return 0
  return Math.max(0, Math.round((new Date(d).getTime() - Date.now()) / 3600_000))
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const expiring = await getExpiringSoftReservations(48)
  if (expiring.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: 'no expiring reservations' })
  }

  // Odbiorca: Settings.reservationsAlertEmail (zarządzany w UI) → fallback NEXT_PUBLIC_ADMIN_EMAIL.
  const setting = await prisma.settings.findUnique({ where: { key: 'reservationsAlertEmail' } })
  const to = setting?.value || process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (!to) {
    return NextResponse.json(
      { error: 'Brak adresu odbiorcy — ustaw Settings.reservationsAlertEmail w /settings lub NEXT_PUBLIC_ADMIN_EMAIL w env' },
      { status: 500 },
    )
  }

  const rows = expiring.map((u) => {
    const h = hoursLeft(u.reservationExpiresAt)
    const client = u.reservedBy ? `${u.reservedBy.firstName} ${u.reservedBy.lastName}` : '—'
    const contact = [u.reservedBy?.phone, u.reservedBy?.email].filter(Boolean).join(' · ') || '—'
    return { number: u.number, client, contact, expiresAt: u.reservationExpiresAt, h }
  })
  const critical = rows.filter((r) => r.h <= 24).length

  const html = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:760px;">
  <h2 style="font-size:18px;margin:0 0 8px;">Wygasające rezerwacje (najbliższe 48h)</h2>
  <p style="margin:0 0 16px;color:#6b7280;">
    ${expiring.length} rezerwacji miękkich kończy się w ciągu 48h${critical > 0 ? `, w tym <strong style="color:#b91c1c;">${critical} w ciągu 24h</strong>` : ''}.
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f3f4f6;text-align:left;">
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Lokal</th>
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Klient</th>
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Kontakt</th>
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Kończy się</th>
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">Pozostało</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;">${r.number}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">${r.client}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280;">${r.contact}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">${fmtDateTime(r.expiresAt)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:${r.h <= 24 ? '#b91c1c' : '#92400e'};font-weight:600;">${r.h}h</td>
        </tr>`).join('')}
    </tbody>
  </table>
  <p style="margin:16px 0 0;">
    <a href="${(process.env.NEXTAUTH_URL || '').replace(/\/$/, '')}/rezerwacje" style="color:#2563eb;">Przejdź do modułu Rezerwacje →</a>
  </p>
  <p style="margin:24px 0 0;color:#9ca3af;font-size:11px;">
    Automatyczna wiadomość z MARAF CRM. Adres odbiorcy zmienisz w /settings (klucz reservationsAlertEmail).
  </p>
</div>`

  try {
    const mailInfo = await sendEmail({
      to,
      subject: `[CRM] ${expiring.length} rezerwacji wygasa w ciągu 48h${critical > 0 ? ` (${critical} krytycznych)` : ''}`,
      html,
      text: `Wygasające rezerwacje: ${expiring.length}, krytycznych: ${critical}. Otwórz CRM → Rezerwacje.`,
      headers: { 'X-Auto-Response-Suppress': 'All', 'Auto-Submitted': 'auto-generated', 'X-Mailer': 'MARAF CRM' },
    })
    return NextResponse.json({
      ok: true,
      sent: true,
      expiringCount: expiring.length,
      criticalCount: critical,
      acceptedCount: mailInfo?.accepted?.length ?? 0,
    })
  } catch (e: any) {
    console.error('[reservations.expiring-email] error:', e?.message, e?.code)
    const f = toFriendlyMailError(e)
    return NextResponse.json({ error: f.message }, { status: 502 })
  }
}
