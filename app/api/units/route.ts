import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { expireSoftReservations } from '@/lib/reservations'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await expireSoftReservations()

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const type = searchParams.get('type') || ''
  const status = searchParams.get('status') || ''

  const units = await prisma.unit.findMany({
    where: {
      AND: [
        search ? { number: { contains: search } } : {},
        type ? { type } : {},
        status ? { status } : {},
      ],
    },
    include: {
      clientUnits: { include: { client: true } },
      _count: { select: { serviceRequests: true } },
    },
    orderBy: { number: 'asc' },
  })

  return NextResponse.json(units)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const area = parseFloat(body.area) || 0
  const ppmNet = parseFloat(body.pricePerSqmNet) || 0
  const ppmGross = parseFloat(body.pricePerSqmGross) || 0
  const usePerSqm = ppmNet > 0 || ppmGross > 0
  const priceNet = usePerSqm
    ? Math.round(area * ppmNet * 100) / 100
    : Math.round((parseFloat(body.priceNet) || 0) * 100) / 100
  const priceGross = usePerSqm
    ? Math.round(area * ppmGross * 100) / 100
    : Math.round((parseFloat(body.priceGross) || 0) * 100) / 100
  const unit = await prisma.unit.create({
    data: {
      number: body.number,
      type: body.type,
      area,
      pricePerSqmNet: ppmNet,
      pricePerSqmGross: ppmGross,
      priceNet,
      priceGross,
      vatRate: parseInt(body.vatRate) || 8,
      floor: body.floor !== undefined && body.floor !== '' ? parseInt(body.floor) : null,
      rooms: body.rooms !== undefined && body.rooms !== '' ? parseInt(body.rooms) : null,
      building: body.building || null,
      description: body.description || null,
      status: body.status || 'WOLNY',
    },
  })

  return NextResponse.json(unit, { status: 201 })
}
