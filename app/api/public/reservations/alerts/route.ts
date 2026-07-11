import { NextRequest, NextResponse } from 'next/server'
import { runReservationAlerts } from '@/lib/reservation-alerts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/public/reservations/alerts
 * Cron — automatyczne powiadomienia do KLIENTÓW (e-mail/SMS) na X godzin przed
 * wygaśnięciem rezerwacji miękkiej + zadanie „Zadzwoń" na pulpicie.
 * Chroniony `RESERVATIONS_CRON_SECRET` (ten sam co digest expiring-email;
 * query ?secret= albo `Authorization: Bearer ...`).
 *
 * Coolify Scheduled Task: co 15 min (`*\/15 * * * *`) —
 *   curl -X POST "https://crm.maraf.pl/api/public/reservations/alerts?secret=$RESERVATIONS_CRON_SECRET"
 *
 * Idempotentny: wysyłki deduplikowane przez NotificationLog.dedupeKey, zadania
 * przez Task.ruleKey — można wołać dowolnie często. Konfiguracja (próg godzin,
 * kanały, szablony) w /settings → „Powiadomienia o rezerwacjach".
 */

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.RESERVATIONS_CRON_SECRET
  if (!secret) return false
  const fromQuery = new URL(req.url).searchParams.get('secret')
  const fromHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return fromQuery === secret || fromHeader === secret
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runReservationAlerts()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('[reservations.alerts] error:', e?.message, e?.code)
    return NextResponse.json({ error: e?.message || 'Błąd przebiegu powiadomień' }, { status: 500 })
  }
}

// GET dla wygody ręcznych testów (ten sam sekret).
export const GET = POST
