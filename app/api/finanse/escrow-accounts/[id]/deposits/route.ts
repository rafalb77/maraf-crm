import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST — wpłata nabywcy na rachunek powierniczy.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const date = body.date ? new Date(body.date) : null
  const amount = Number(body.amount)
  if (!date || isNaN(date.getTime())) return NextResponse.json({ error: 'date wymagana' }, { status: 400 })
  if (!isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'amount musi być > 0' }, { status: 400 })

  const created = await prisma.escrowDeposit.create({
    data: {
      accountId: params.id,
      date,
      amount,
      buyerName: body.buyerName ? String(body.buyerName).trim() : null,
      contractNumber: body.contractNumber ? String(body.contractNumber).trim() : null,
      unitId: body.unitId || null,
      note: body.note ? String(body.note).trim() : null,
    },
    select: { id: true },
  })
  return NextResponse.json(created, { status: 201 })
}
