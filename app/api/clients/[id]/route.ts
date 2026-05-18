import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'

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

  // RODO audit — kto, kiedy oglądał pełne dane klienta (z PESEL/idNumber).
  const meta = extractRequestMeta(req)
  void audit({
    action: 'VIEW_CLIENT',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'Client',
    entityId: client.id,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return NextResponse.json(client)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  // Pobierz stare dane do diff w audit
  const before = await prisma.client.findUnique({
    where: { id: params.id },
    select: { firstName: true, lastName: true, email: true, phone: true, pesel: true, status: true },
  })
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

  const meta = extractRequestMeta(req)
  void audit({
    action: 'UPDATE',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'Client',
    entityId: client.id,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { before, statusChange: before?.status !== client.status ? { from: before?.status, to: client.status } : undefined },
  })

  return NextResponse.json(client)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Snapshot do audit przed usunięciem
  const before = await prisma.client.findUnique({
    where: { id: params.id },
    select: { firstName: true, lastName: true, email: true, status: true },
  })
  await prisma.client.delete({ where: { id: params.id } })

  const meta = extractRequestMeta(req)
  void audit({
    action: 'DELETE',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'Client',
    entityId: params.id,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { deletedSnapshot: before },
  })

  return NextResponse.json({ success: true })
}
