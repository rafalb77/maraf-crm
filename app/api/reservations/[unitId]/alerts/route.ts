import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/reservations/[unitId]/alerts
 * Body: { muted: boolean }
 * Włącza/wyłącza automatyczne powiadomienia (e-mail/SMS/zadanie „Zadzwoń")
 * dla KONKRETNEJ rezerwacji miękkiej — przełącznik-dzwonek na /rezerwacje.
 * Flaga jest czyszczona przy zwolnieniu/wygaśnięciu i przenoszona przy zamianie
 * (lib/reservations.ts). Gate 'sales' przez middleware.
 */
export async function PATCH(req: NextRequest, { params }: { params: { unitId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (typeof body.muted !== 'boolean') {
    return NextResponse.json({ error: 'muted musi być boolean' }, { status: 400 })
  }

  const unit = await prisma.unit.findUnique({
    where: { id: params.unitId },
    select: { reservationType: true },
  })
  if (!unit) return NextResponse.json({ error: 'Lokal nie istnieje' }, { status: 404 })
  if (unit.reservationType !== 'MIEKKA') {
    return NextResponse.json({ error: 'Powiadomienia dotyczą tylko rezerwacji miękkich' }, { status: 400 })
  }

  try {
    await prisma.unit.update({
      where: { id: params.unitId },
      data: { reservationAlertsMuted: body.muted },
    })
    return NextResponse.json({ success: true, muted: body.muted })
  } catch (e: any) {
    console.error('[reservations.alerts] toggle error:', e?.message)
    return NextResponse.json({ error: 'Błąd zapisu — spróbuj ponownie' }, { status: 500 })
  }
}
