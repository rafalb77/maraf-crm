import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'

// Pełny snapshot pól klienta do audytu — żeby KAŻDA zmiana/usunięcie była w
// pełni odzyskiwalna z AuditLog.metadata.before. Wcześniej snapshot pomijał
// m.in. adres/miasto/kod/NIP/dowód/imiona rodziców, więc po incydencie z
// zerowaniem danych tych pól nie dało się przywrócić.
const CLIENT_AUDIT_SELECT = {
  firstName: true, lastName: true, email: true, phone: true, phone2: true,
  pesel: true, nip: true, idNumber: true, fatherName: true, motherName: true,
  address: true, city: true, zipCode: true, status: true, source: true, notes: true,
} as const

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
  // Pełny snapshot starych wartości — do diffu w audicie i pełnego odzysku.
  const before = await prisma.client.findUnique({
    where: { id: params.id },
    select: CLIENT_AUDIT_SELECT,
  })
  // Update CZĘŚCIOWY: ustawiamy tylko pola faktycznie obecne w body.
  // Pominięte (undefined) zostają nietknięte. KRYTYCZNE: bez tego PUT z samym
  // { status } (ClientStatusChanger) wyzerowałby wszystkie dane klienta
  // (email/phone/pesel/adres → null), bo `body.x || null` daje null dla undefined.
  const data: Record<string, unknown> = {}
  if (body.firstName !== undefined) data.firstName = body.firstName
  if (body.lastName !== undefined) data.lastName = body.lastName
  if (body.status !== undefined) data.status = body.status
  if (body.ownerId !== undefined) data.ownerId = body.ownerId || null // opiekun (zmiana z karty klienta)
  for (const k of [
    'email', 'phone', 'phone2', 'pesel', 'nip', 'idNumber',
    'fatherName', 'motherName', 'address', 'city', 'zipCode', 'source', 'notes',
  ]) {
    if (body[k] !== undefined) data[k] = body[k] || null
  }

  const client = await prisma.client.update({
    where: { id: params.id },
    data,
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

  // Pełny snapshot przed usunięciem — pełny odzysk z audytu w razie pomyłki.
  const before = await prisma.client.findUnique({
    where: { id: params.id },
    select: CLIENT_AUDIT_SELECT,
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
