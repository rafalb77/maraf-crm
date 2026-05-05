import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const request = await prisma.serviceRequest.findUnique({
    where: { id: params.id },
    include: { client: true, unit: true },
  })

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(request)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const request = await prisma.serviceRequest.update({
    where: { id: params.id },
    data: {
      clientId: body.clientId,
      unitId: body.unitId || null,
      title: body.title,
      description: body.description || null,
      status: body.status,
      priority: body.priority,
      resolvedAt: body.status === 'ZAKONCZONE' && !body.resolvedAt ? new Date() : (body.resolvedAt ? new Date(body.resolvedAt) : null),
    },
    include: { client: true, unit: true },
  })

  return NextResponse.json(request)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.serviceRequest.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
