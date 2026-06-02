import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET — szczegóły kredytu + transze + spłaty.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const loan = await prisma.loan.findUnique({
    where: { id: params.id },
    include: {
      tranches: { orderBy: { date: 'desc' } },
      repayments: { orderBy: { date: 'desc' } },
      vatRefundsApplied: { orderBy: { date: 'desc' } },
    },
  })
  if (!loan) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  return NextResponse.json(loan)
}

// PATCH — edycja kredytu.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const data: any = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (typeof body.bank === 'string') data.bank = body.bank.trim()
  if (typeof body.contractNumber === 'string') data.contractNumber = body.contractNumber.trim() || null
  if (typeof body.type === 'string' && ['INWESTYCYJNY', 'VAT', 'OBROTOWY', 'INNE'].includes(body.type)) data.type = body.type
  if (isFinite(Number(body.limit))) data.limit = Number(body.limit)
  if ('interestRate' in body) data.interestRate = isFinite(Number(body.interestRate)) ? Number(body.interestRate) : null
  if (body.signedAt) data.signedAt = new Date(body.signedAt)
  if ('expiresAt' in body) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
  if (typeof body.status === 'string') data.status = body.status
  if ('notes' in body) data.notes = body.notes ? String(body.notes).trim() : null

  const updated = await prisma.loan.update({ where: { id: params.id }, data, select: { id: true } })
  return NextResponse.json(updated)
}

// DELETE — usuń kredyt (cascade transze + spłaty).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.loan.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
