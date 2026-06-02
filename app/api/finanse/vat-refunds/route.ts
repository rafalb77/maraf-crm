import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'

// GET — lista zwrotów VAT dla aktywnej firmy.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const company = getActiveCompany()
  const refunds = await prisma.vatRefund.findMany({
    where: { company },
    orderBy: { date: 'desc' },
    include: { appliedToLoan: { select: { id: true, name: true, type: true } } },
  })
  return NextResponse.json(refunds)
}

// POST — nowy zwrot VAT.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const company = getActiveCompany()

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const date = body.date ? new Date(body.date) : null
  const amount = Number(body.amount)
  if (!date || isNaN(date.getTime())) return NextResponse.json({ error: 'date wymagana' }, { status: 400 })
  if (!isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'amount musi być > 0' }, { status: 400 })

  const created = await prisma.vatRefund.create({
    data: {
      company,
      date,
      amount,
      periodLabel: body.periodLabel ? String(body.periodLabel).trim() : null,
      appliedToLoanId: body.appliedToLoanId || null,
      note: body.note ? String(body.note).trim() : null,
    },
    select: { id: true },
  })
  return NextResponse.json(created, { status: 201 })
}
