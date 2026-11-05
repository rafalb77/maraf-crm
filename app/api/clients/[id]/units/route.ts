import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { addDays, expireSoftReservations } from '@/lib/reservations'

// POST: creates a soft reservation (MIEKKA) — expires after 7 days
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await expireSoftReservations()

  const { unitId, days } = await req.json()
  // Czas rezerwacji miękkiej — domyślnie 7 dni, opcjonalnie 1–90.
  const d = Number(days)
  const reservationDays = Number.isFinite(d) && d >= 1 && d <= 90 ? Math.round(d) : 7

  const unit = await prisma.unit.findUnique({ where: { id: unitId } })
  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

  if (unit.status === 'SPRZEDANY') {
    return NextResponse.json({ error: 'Lokal jest sprzedany' }, { status: 409 })
  }
  if (unit.status === 'ZAREZERWOWANY' && unit.reservationType === 'REZERWACJA') {
    return NextResponse.json({ error: 'Lokal ma twardą rezerwację z umowy' }, { status: 409 })
  }

  const existing = await prisma.clientUnit.findUnique({
    where: { clientId_unitId: { clientId: params.id, unitId } },
  })
  if (existing) return NextResponse.json({ error: 'Już przypisano' }, { status: 409 })

  const expiresAt = addDays(new Date(), reservationDays)

  const [cu] = await prisma.$transaction([
    prisma.clientUnit.create({
      data: { clientId: params.id, unitId },
      include: { unit: true },
    }),
    prisma.unit.update({
      where: { id: unitId },
      data: {
        status: 'ZAREZERWOWANY',
        reservationType: 'MIEKKA',
        reservationExpiresAt: expiresAt,
        reservedById: params.id,
        reservationAlertsMuted: false,
      },
    }),
  ])

  return NextResponse.json(cu, { status: 201 })
}

// DELETE: releases a soft reservation. Hard reservations must be released via contract cancellation.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const unitId = searchParams.get('unitId')
  if (!unitId) return NextResponse.json({ error: 'Missing unitId' }, { status: 400 })

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { id: true, status: true, reservationType: true, reservedById: true },
  })
  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

  // Składnik aktywnej umowy tego klienta zdejmuje się na umowie, nie w portfelu.
  const onContract = await prisma.contractUnit.findFirst({
    where: {
      unitId,
      contract: {
        status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] },
        OR: [{ clientId: params.id }, { contractClients: { some: { clientId: params.id } } }],
      },
    },
    select: { contract: { select: { number: true } } },
  })
  if (onContract) {
    return NextResponse.json(
      { error: `Lokal jest składnikiem aktywnej umowy ${onContract.contract.number} — usuń go ze składników umowy albo ją rozwiąż/anuluj.` },
      { status: 409 },
    )
  }
  if (unit.reservationType === 'REZERWACJA' && (!unit.reservedById || unit.reservedById === params.id)) {
    return NextResponse.json(
      { error: 'Lokal ma twardą rezerwację — anuluj najpierw umowę' },
      { status: 409 },
    )
  }

  // Lokal wraca do WOLNY tylko, gdy to rezerwacja TEGO klienta (miękka / bez
  // wskazanego posiadacza). Zalegający wpis w portfelu — lokal w międzyczasie
  // sprzedany lub zarezerwowany przez innego klienta — tylko znika z portfela;
  // wcześniej jego skasowanie (×) zwalniało cudzy lokal do puli.
  const ownReservation =
    unit.status !== 'SPRZEDANY' &&
    unit.reservationType !== 'REZERWACJA' &&
    (!unit.reservedById || unit.reservedById === params.id)
  await prisma.$transaction([
    prisma.clientUnit.deleteMany({ where: { clientId: params.id, unitId } }),
    ...(ownReservation
      ? [
          prisma.unit.update({
            where: { id: unitId },
            data: { status: 'WOLNY', reservationType: null, reservationExpiresAt: null, reservedById: null },
          }),
        ]
      : []),
  ])

  return NextResponse.json({ success: true, released: ownReservation })
}
