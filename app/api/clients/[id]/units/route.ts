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

  const { unitId } = await req.json()

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

  const expiresAt = addDays(new Date(), 7)

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

  const unit = await prisma.unit.findUnique({ where: { id: unitId } })
  if (unit?.reservationType === 'REZERWACJA') {
    return NextResponse.json(
      { error: 'Lokal ma twardą rezerwację — anuluj najpierw umowę' },
      { status: 409 },
    )
  }

  await prisma.$transaction([
    prisma.clientUnit.deleteMany({
      where: { clientId: params.id, unitId },
    }),
    prisma.unit.update({
      where: { id: unitId },
      data: {
        status: 'WOLNY',
        reservationType: null,
        reservationExpiresAt: null,
        reservedById: null,
      },
    }),
  ])

  return NextResponse.json({ success: true })
}
