import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { swapSoftReservation } from '@/lib/reservations'

/**
 * POST /api/reservations/[unitId]/swap
 * Body: { newUnitId: string }
 * Zamienia zarezerwowany (miękko) lokal [unitId] na inny WOLNY [newUnitId],
 * zachowując klienta i datę wygaśnięcia. Cross-type dozwolony. Gate 'sales'.
 */
export async function POST(req: NextRequest, { params }: { params: { unitId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { newUnitId } = await req.json().catch(() => ({}))
  if (!newUnitId || typeof newUnitId !== 'string') {
    return NextResponse.json({ error: 'Brak newUnitId' }, { status: 400 })
  }

  try {
    const result = await swapSoftReservation(params.unitId, newUnitId)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Błąd zamiany' }, { status: 400 })
  }
}
