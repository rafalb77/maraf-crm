import { NextRequest, NextResponse } from 'next/server'
import { generateTasks } from '@/lib/tasks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cron — przebieg silnika zadań (generowanie z reguł + auto-domykanie).
 * Wywoływany przez Coolify scheduled task (np. co godzinę). Chroniony sekretem
 * TASKS_CRON_SECRET (query ?secret= albo nagłówek Authorization: Bearer).
 *
 * Endpoint jest opcjonalnym wzmocnieniem — widget i tak odpala silnik
 * oportunistycznie przy odczycie /api/tasks (throttling 10 min). Cron daje
 * świeże zadania także w dni, gdy nikt nie wchodzi na pulpit (digest mailowy
 * w fazie 2 będzie korzystał z tego samego przebiegu).
 */

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.TASKS_CRON_SECRET
  if (!secret) return false
  const fromQuery = new URL(req.url).searchParams.get('secret')
  const fromHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return fromQuery === secret || fromHeader === secret
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await generateTasks()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('[tasks.generate] błąd przebiegu silnika:', e?.message || e)
    return NextResponse.json({ error: 'Błąd generowania zadań' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return handle(req)
}

// GET dozwolony dla wygody testowania (też wymaga sekretu).
export async function GET(req: NextRequest) {
  return handle(req)
}
