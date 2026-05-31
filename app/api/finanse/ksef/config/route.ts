import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'
import { KSEF_DEFAULTS } from '@/lib/ksef-defaults'
import type { Company } from '@/lib/types'

// GET /api/finanse/ksef/config
// Zwraca konfiguracje per firma (Maraf + MD). Lazy-create defaults gdy brak.
// Token zwracany ZAMASKOWANY (tylko ostatnie 4 znaki widoczne).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Tylko admin' }, { status: 403 })

  const companies: Company[] = ['MARAF', 'MARAF_DEVELOPMENT']
  const result: any[] = []

  for (const company of companies) {
    let cfg = await prisma.ksefConfig.findUnique({ where: { company } })
    if (!cfg) {
      const def = KSEF_DEFAULTS[company]
      cfg = await prisma.ksefConfig.create({
        data: {
          company,
          nip: def.nip,
          syncFromDate: def.syncFromDate,
          environment: 'PROD',
          enabled: false,
        },
      })
    }
    result.push({
      company: cfg.company,
      nip: cfg.nip,
      tokenMasked: cfg.token ? `${'•'.repeat(8)}${cfg.token.slice(-4)}` : null,
      hasToken: !!cfg.token,
      environment: cfg.environment,
      enabled: cfg.enabled,
      syncFromDate: cfg.syncFromDate,
      lastSyncAt: cfg.lastSyncAt,
      lastSyncStatus: cfg.lastSyncStatus,
      lastSyncError: cfg.lastSyncError,
      lastSyncCount: cfg.lastSyncCount,
    })
  }

  return NextResponse.json(result)
}
