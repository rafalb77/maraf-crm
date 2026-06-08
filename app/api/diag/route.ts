import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/diag — endpoint diagnostyczny do mierzenia, gdzie jest "wolno".
 *
 *  mode=ping → niemal zero pracy serwera. Round-trip mierzony po stronie
 *              przeglądarki = praktycznie czysty czas ŁĄCZA (sieć + TLS).
 *  mode=db   → realistyczna praca modułu Finanse: count faktur + pobranie
 *              jednej faktury z tymi samymi include co strona szczegółów.
 *              serverMs = czas SERWERA/BAZY (bez sieci).
 *
 * Dzięki temu: round-trip(db) ≈ łącze + serwer; serverMs(db) ≈ sam serwer;
 * round-trip(ping) ≈ samo łącze. Różnice pokazują wąskie gardło.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = req.nextUrl.searchParams.get('mode') || 'db'
  const t0 = Date.now()

  if (mode === 'ping') {
    return NextResponse.json({
      mode: 'ping',
      serverMs: Date.now() - t0,
      serverTime: new Date().toISOString(),
    })
  }

  // mode === 'db' — reprezentatywna praca Finansów
  const a = Date.now()
  let invoiceCount = 0
  let countMs = 0
  let sampleMs = 0
  let hasSample = false
  try {
    invoiceCount = await prisma.purchaseInvoice.count()
    const b = Date.now()
    countMs = b - a
    const sample = await prisma.purchaseInvoice.findFirst({
      include: {
        vendor: true,
        payments: true,
        approvals: true,
        attachments: true,
        createdBy: { select: { email: true, name: true } },
      },
      orderBy: { issueDate: 'desc' },
    })
    sampleMs = Date.now() - b
    hasSample = !!sample
  } catch (e: any) {
    return NextResponse.json(
      { mode: 'db', error: e?.message || 'DB error', serverMs: Date.now() - t0 },
      { status: 500 },
    )
  }

  return NextResponse.json({
    mode: 'db',
    serverMs: Date.now() - t0,
    breakdown: { countMs, sampleInvoiceMs: sampleMs },
    invoiceCount,
    hasSample,
    user: { email: session.user.email, admin: isAdmin(session.user.email) },
    serverTime: new Date().toISOString(),
  })
}
