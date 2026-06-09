import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { releaseSoftReservation } from '@/lib/reservations'

/**
 * DELETE /api/reservations/[unitId]/release
 * Zwalnia rezerwację miękką (MIEKKA) ręcznie, przed wygaśnięciem. Lokal → WOLNY,
 * ClientUnit usunięte. Twarde (REZERWACJA) zwalniane przez zmianę statusu umowy.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { unitId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await releaseSoftReservation(params.unitId)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Błąd zwalniania' }, { status: 400 })
  }
}
