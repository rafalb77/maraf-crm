import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      clientUnits: { include: { unit: true } },
      activities: { orderBy: { date: 'desc' } },
      serviceRequests: {
        include: { unit: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(client)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const client = await prisma.client.update({
    where: { id: params.id },
    data: {
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email || null,
      phone: body.phone || null,
      phone2: body.phone2 || null,
      pesel: body.pesel || null,
      nip: body.nip || null,
      idNumber: body.idNumber || null,
      fatherName: body.fatherName || null,
      motherName: body.motherName || null,
      address: body.address || null,
      city: body.city || null,
      zipCode: body.zipCode || null,
      status: body.status,
      source: body.source || null,
      notes: body.notes || null,
    },
  })

  return NextResponse.json(client)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.client.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
