import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'
import { syncCompanyFromKsef } from '@/lib/ksef-client'

// POST /api/finanse/ksef/sync/[company]
// Uruchamia synchronizacje faktur z KSeF dla danej firmy.
// Rate limit KSeF (16/min) → sync moze byc dlugi i WZNAWIALNY: lastSyncAt
// przesuwamy tylko po pelnym ukonczeniu (completed); przy paczce (PARTIAL)
// kolejne uruchomienie kontynuuje.
export const maxDuration = 300 // sekundy — pozwala na dluzszy sync (throttling)

export async function POST(req: NextRequest, { params }: { params: { company: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Tylko admin' }, { status: 403 })

  const company = params.company === 'MARAF_DEVELOPMENT' ? 'MARAF_DEVELOPMENT' : 'MARAF'
  // ?full=1 — pelny re-sync od daty startu (ignoruje lastSyncAt). Sluzy do
  // uzupelnienia danych/statusu platnosci dla juz pobranych faktur.
  const fullResync = new URL(req.url).searchParams.get('full') === '1'

  const cfg = await prisma.ksefConfig.findUnique({ where: { company } })
  if (!cfg) return NextResponse.json({ error: 'Brak konfiguracji KSeF dla tej firmy' }, { status: 404 })
  if (!cfg.enabled) return NextResponse.json({ error: 'KSeF wyłączony dla tej firmy (włącz "Aktywny" w konfiguracji)' }, { status: 400 })
  if (!cfg.token) return NextResponse.json({ error: 'Brak tokenu KSeF dla tej firmy — wpisz go w konfiguracji' }, { status: 400 })

  const result = await syncCompanyFromKsef(company, { fullResync })

  await prisma.ksefConfig.update({
    where: { company },
    data: {
      // lastSyncAt TYLKO po pelnym ukonczeniu — przy PARTIAL kolejne uruchomienie
      // re-skanuje to samo okno (dedup po ksefNumber pomija juz pobrane).
      ...(result.ok && result.completed ? { lastSyncAt: new Date() } : {}),
      lastSyncStatus: !result.ok ? 'ERROR' : (result.completed ? 'OK' : 'PARTIAL'),
      lastSyncError: result.ok ? null : (result.error || 'Nieznany blad'),
      lastSyncCount: result.ok ? result.count : null,
    },
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, count: result.count }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: result.count, completed: result.completed })
}
