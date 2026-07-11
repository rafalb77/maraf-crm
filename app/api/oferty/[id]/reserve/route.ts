import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { addDays, expireSoftReservations } from '@/lib/reservations'

/**
 * POST /api/oferty/[id]/reserve
 * Tworzy miękką rezerwację (MIEKKA, +7 dni) na WSZYSTKICH lokalach z oferty dla
 * klienta oferty. Pomija lokale sprzedane / z twardą rezerwacją z umowy.
 * Idempotentne dla już zarezerwowanych przez tego klienta. Gate 'oferty'.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await expireSoftReservations()

  const { id } = await params
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { items: true, client: true },
  })
  if (!offer) return NextResponse.json({ error: 'Nie znaleziono oferty' }, { status: 404 })
  if (!offer.clientId) {
    return NextResponse.json({ error: 'Oferta nie ma przypisanego klienta — nie można zarezerwować' }, { status: 400 })
  }
  const unitIds = offer.items.map((it) => it.unitId).filter(Boolean) as string[]
  if (unitIds.length === 0) {
    return NextResponse.json({ error: 'Oferta nie zawiera lokali z bazy' }, { status: 400 })
  }

  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds } },
    select: { id: true, number: true, status: true, reservationType: true },
  })

  const expiresAt = addDays(new Date(), 7)
  const reserved: string[] = []
  const skipped: { number: string; reason: string }[] = []

  await prisma.$transaction(async (tx) => {
    for (const u of units) {
      if (u.status === 'SPRZEDANY') { skipped.push({ number: u.number, reason: 'sprzedany' }); continue }
      if (u.status === 'ZAREZERWOWANY' && u.reservationType === 'REZERWACJA') {
        skipped.push({ number: u.number, reason: 'twarda rezerwacja z umowy' }); continue
      }
      await tx.unit.update({
        where: { id: u.id },
        data: { status: 'ZAREZERWOWANY', reservationType: 'MIEKKA', reservationExpiresAt: expiresAt, reservedById: offer.clientId, reservationAlertsMuted: false },
      })
      await tx.clientUnit.upsert({
        where: { clientId_unitId: { clientId: offer.clientId!, unitId: u.id } },
        create: { clientId: offer.clientId!, unitId: u.id },
        update: {},
      })
      reserved.push(u.number)
    }
    // Klient → REZERWACJA (jeśli cokolwiek zarezerwowano i był wcześniejszym etapem)
    if (reserved.length > 0) {
      await tx.client.update({ where: { id: offer.clientId! }, data: { status: 'REZERWACJA' } })
    }
  })

  if (reserved.length > 0) {
    await prisma.activity.create({
      data: {
        clientId: offer.clientId,
        type: 'NOTATKA',
        title: `Rezerwacja miękka z oferty ${offer.number}`,
        content: `Zarezerwowano lokale: ${reserved.join(', ')} (wygasa ${expiresAt.toLocaleDateString('pl-PL')}).`,
      },
    })
  }

  return NextResponse.json({ success: true, reservedCount: reserved.length, reserved, skipped })
}
