import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveUnitPricesForClient } from '@/lib/contract-pricing'

/**
 * GET /api/contracts/resolve-prices?clientId=..&unitIds=a,b,c
 * Zwraca domyślne ceny brutto lokali dla umowy klienta (z oferty, fallback
 * cena bazowa) — formularz „Nowa umowa" używa ich jako wartości startowych,
 * które handlowiec może obniżyć (rabat).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId') || null
  const unitIds = (searchParams.get('unitIds') || '').split(',').map((s) => s.trim()).filter(Boolean)

  const resolved = await resolveUnitPricesForClient(clientId, unitIds)
  const prices: Record<string, number> = {}
  for (const [unitId, p] of resolved) prices[unitId] = p.priceGross

  return NextResponse.json({ prices })
}
