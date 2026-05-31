import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'
import { syncCompanyFromKsef } from '@/lib/ksef-client'

// POST /api/finanse/ksef/auto-sync
// Auto-synchronizacja przy wejściu do panelu Finanse — uruchamiana z client
// (useEffect). Throttle: nie syncuje jesli lastSyncAt < 1h temu.
// Cichy fail: bledy zapisuje w lastSyncStatus, NIE blokuje UI.
//
// Zwraca: { skipped: bool, reason?: string, count?: number, error?: string }
const THROTTLE_MS = 60 * 60 * 1000 // 1 godzina

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ skipped: true, reason: 'unauthorized' })

  const company = getActiveCompany()

  const cfg = await prisma.ksefConfig.findUnique({ where: { company } })
  if (!cfg) return NextResponse.json({ skipped: true, reason: 'no-config' })
  if (!cfg.enabled) return NextResponse.json({ skipped: true, reason: 'disabled' })
  if (!cfg.token) return NextResponse.json({ skipped: true, reason: 'no-token' })

  // Throttling — nie syncuj jesli ostatni sync byl mniej niz 1h temu
  if (cfg.lastSyncAt && Date.now() - cfg.lastSyncAt.getTime() < THROTTLE_MS) {
    return NextResponse.json({
      skipped: true,
      reason: 'throttled',
      lastSyncAt: cfg.lastSyncAt,
    })
  }

  // Wykonaj sync
  const result = await syncCompanyFromKsef(company)

  await prisma.ksefConfig.update({
    where: { company },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: result.ok ? 'OK' : 'ERROR',
      lastSyncError: result.ok ? null : (result.error || 'Nieznany blad'),
      lastSyncCount: result.ok ? result.count : null,
    },
  })

  return NextResponse.json({
    skipped: false,
    ok: result.ok,
    count: result.count,
    error: result.ok ? undefined : result.error,
  })
}
