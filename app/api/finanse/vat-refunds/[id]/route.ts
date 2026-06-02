import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const data: any = {}
  if (body.date) data.date = new Date(body.date)
  if (isFinite(Number(body.amount))) data.amount = Number(body.amount)
  if ('periodLabel' in body) data.periodLabel = body.periodLabel ? String(body.periodLabel).trim() : null
  if ('appliedToLoanId' in body) data.appliedToLoanId = body.appliedToLoanId || null
  if ('note' in body) data.note = body.note ? String(body.note).trim() : null

  const updated = await prisma.vatRefund.update({ where: { id: params.id }, data, select: { id: true } })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await prisma.vatRefund.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
