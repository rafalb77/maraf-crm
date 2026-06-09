import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { extendSoftReservation } from '@/lib/reservations'

/**
 * POST /api/reservations/[unitId]/extend
 * Body: { days: number }
 * Przedłuża rezerwację miękką o `days` dni od TERAZ. Tylko MIEKKA. Gate 'sales'
 * przez middleware (rezerwacje to workflow sprzedażowy).
 */
export async function POST(req: NextRequest, { params }: { params: { unitId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { days } = await req.json().catch(() => ({}))
  const n = Number(days)
  if (!Number.isFinite(n) || n <= 0 || n > 90) {
    return NextResponse.json({ error: 'days musi być liczbą 1..90' }, { status: 400 })
  }

  try {
    const newExpiresAt = await extendSoftReservation(params.unitId, n)
    return NextResponse.json({ success: true, reservationExpiresAt: newExpiresAt })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Błąd przedłużenia' }, { status: 400 })
  }
}
