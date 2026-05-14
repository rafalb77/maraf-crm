import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unit = await prisma.unit.findUnique({
    where: { id: params.id },
    include: {
      clientUnits: { include: { client: true } },
      serviceRequests: { include: { client: true }, orderBy: { createdAt: 'desc' } },
    },
  })

  if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(unit)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
  const unit = await prisma.unit.update({
    where: { id: params.id },
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
      status: body.status,
      floorPlanUrl: body.floorPlanUrl !== undefined ? body.floorPlanUrl : undefined,
    },
  })

  return NextResponse.json(unit)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.unit.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
