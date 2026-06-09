import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { promises as fs } from 'fs'
import path from 'path'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'
import { CASE_CLOSED_STATUSES, type CaseStatus } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      unit: true,
      owner: { select: { id: true, name: true, email: true } },
      entries: { orderBy: { occurredAt: 'desc' }, include: { documents: true } },
      documents: { orderBy: { uploadedAt: 'desc' } },
    },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.case.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: any = {}

  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if ('description' in body) data.description = body.description || null
  if ('priority' in body) data.priority = body.priority
  if ('type' in body) data.type = body.type
  if ('counterparty' in body) data.counterparty = body.counterparty || null
  if ('clientId' in body) data.clientId = body.clientId || null
  if ('unitId' in body) data.unitId = body.unitId || null
  if ('ownerId' in body) data.ownerId = body.ownerId || null
  if ('receivedAt' in body) data.receivedAt = body.receivedAt ? new Date(body.receivedAt) : null
  if ('deadline' in body) data.deadline = body.deadline ? new Date(body.deadline) : null

  if ('status' in body) {
    data.status = body.status
    const nowClosed = CASE_CLOSED_STATUSES.includes(body.status as CaseStatus)
    if (nowClosed && !existing.closedAt) data.closedAt = new Date()
    if (!nowClosed) data.closedAt = null
  }

  const updated = await prisma.case.update({
    where: { id: params.id },
    data,
    include: { client: true, unit: true },
  })

  const meta = extractRequestMeta(req)
  void audit({
    action: 'UPDATE',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'Case',
    entityId: params.id,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata:
      'status' in body && body.status !== existing.status
        ? { statusFrom: existing.status, statusTo: body.status }
        : { fields: Object.keys(data) },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.case.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Kasuje też wpisy i rekordy dokumentów (cascade). Pliki z dysku sprzątamy best-effort.
  await prisma.case.delete({ where: { id: params.id } })
  try {
    const dir = path.join(process.cwd(), 'public', 'uploads', 'cases', params.id)
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    /* katalog mógł nie istnieć */
  }

  const meta = extractRequestMeta(req)
  void audit({
    action: 'DELETE',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'Case',
    entityId: params.id,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { number: existing.number },
  })

  return NextResponse.json({ success: true })
}
