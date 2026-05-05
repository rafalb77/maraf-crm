import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const protocol = await prisma.protocol.findUnique({ where: { id } })
  if (!protocol) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  // Pozycje skasują się przez onDelete: Cascade
  await prisma.protocol.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const data: any = {}
  if (typeof body.number === 'string' || body.number === null) data.number = body.number || null
  if (typeof body.status === 'string') data.status = body.status
  if (typeof body.periodYear === 'number') data.periodYear = body.periodYear
  if (typeof body.periodMonth === 'number') data.periodMonth = body.periodMonth

  const updated = await prisma.protocol.update({ where: { id }, data })
  return NextResponse.json(updated)
}
