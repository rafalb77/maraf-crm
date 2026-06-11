import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''

  const clients = await prisma.client.findMany({
    where: {
      AND: [
        search ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        } : {},
        status ? { status } : {},
      ],
    },
    include: {
      clientUnits: { include: { unit: true } },
      _count: { select: { activities: true, serviceRequests: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(clients)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const client = await prisma.client.create({
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
      status: body.status || 'ZAPYTANIE',
      source: body.source || null,
      notes: body.notes || null,
    },
  })

  const meta = extractRequestMeta(req)
  void audit({
    action: 'CREATE',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'Client',
    entityId: client.id,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { firstName: client.firstName, lastName: client.lastName },
  })

  return NextResponse.json(client, { status: 201 })
}
