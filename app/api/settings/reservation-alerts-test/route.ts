import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendEmail, toFriendlyMailError } from '@/lib/mailer'
import { sendSms, normalizePhonePl } from '@/lib/sms'
import {
  getReservationAlertsConfig,
  renderTemplate,
  type TemplateVars,
} from '@/lib/reservation-alerts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/settings/reservation-alerts-test
 * Testowa wysyłka powiadomienia o rezerwacji (z ZAPISANYCH szablonów, na
 * przykładowych danych) — body: { channel: 'EMAIL' | 'SMS', to: string }.
 * Admin-only (prefiks /api/settings gate'owany w middleware).
 */

const SAMPLE_VARS: TemplateVars = {
  imie: 'Jan',
  nazwisko: 'Testowy',
  lokal: 'B1.3.M45',
  data: '14.07.2026',
  godzina: '12:53',
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const channel = body.channel === 'SMS' ? 'SMS' : 'EMAIL'
  const to = typeof body.to === 'string' ? body.to.trim() : ''
  if (!to) return NextResponse.json({ error: 'Podaj adres/numer odbiorcy testu' }, { status: 400 })

  const cfg = await getReservationAlertsConfig()

  try {
    if (channel === 'EMAIL') {
      const subject = `[TEST] ${renderTemplate(cfg.emailSubject, SAMPLE_VARS)}`
      const text = renderTemplate(cfg.emailBody, SAMPLE_VARS)
      await sendEmail({
        to,
        subject,
        html: `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap;">${text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</pre>`,
        text,
        headers: { 'Auto-Submitted': 'auto-generated', 'X-Mailer': 'MARAF CRM' },
      })
      return NextResponse.json({ ok: true, sent: 'EMAIL', to })
    }

    const phone = normalizePhonePl(to)
    if (!phone) {
      return NextResponse.json(
        { error: 'Numer nie wygląda na poprawny numer komórkowy (oczekiwany format +48 XXX XXX XXX)' },
        { status: 400 },
      )
    }
    const message = `[TEST] ${renderTemplate(cfg.smsBody, SAMPLE_VARS)}`
    const res = await sendSms({ to: phone, message })
    return NextResponse.json({ ok: true, sent: 'SMS', to: phone, points: res.points })
  } catch (e: any) {
    const msg = channel === 'EMAIL' ? toFriendlyMailError(e).message : e?.message
    return NextResponse.json({ error: msg || 'Wysyłka testowa nie powiodła się' }, { status: 502 })
  }
}
