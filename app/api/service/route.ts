import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const priority = searchParams.get('priority') || ''
  const clientId = searchParams.get('clientId') || ''

  const requests = await prisma.serviceRequest.findMany({
    where: {
      AND: [
        status ? { status } : {},
        priority ? { priority } : {},
        clientId ? { clientId } : {},
      ],
    },
    include: {
      client: true,
      unit: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(requests)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const request = await prisma.serviceRequest.create({
    data: {
      clientId: body.clientId,
      unitId: body.unitId || null,
      title: body.title,
      description: body.description || null,
      status: body.status || 'ZGLOSZONO',
      priority: body.priority || 'SREDNIA',
    },
    include: { client: true, unit: true },
  })

  return NextResponse.json(request, { status: 201 })
}
