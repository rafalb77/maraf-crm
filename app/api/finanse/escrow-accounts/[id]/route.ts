import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await prisma.escrowAccount.findUnique({
    where: { id: params.id },
    include: {
      deposits: { orderBy: { date: 'desc' }, include: { unit: { select: { number: true, area: true } } } },
      releases: { orderBy: { date: 'desc' } },
    },
  })
  if (!account) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  return NextResponse.json(account)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const data: any = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (typeof body.bank === 'string') data.bank = body.bank.trim()
  if ('accountNumber' in body) data.accountNumber = body.accountNumber ? String(body.accountNumber).trim() : null
  if (typeof body.type === 'string' && ['OMRP', 'ZMRP'].includes(body.type)) data.type = body.type
  if ('investmentName' in body) data.investmentName = body.investmentName ? String(body.investmentName).trim() : null
  if (typeof body.status === 'string') data.status = body.status
  if ('notes' in body) data.notes = body.notes ? String(body.notes).trim() : null

  const updated = await prisma.escrowAccount.update({ where: { id: params.id }, data, select: { id: true } })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.escrowAccount.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
