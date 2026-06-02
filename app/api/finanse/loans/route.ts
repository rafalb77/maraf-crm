import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'

// GET — lista kredytów dla aktywnej firmy (z agregacją wykorzystania).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const company = getActiveCompany()
  const loans = await prisma.loan.findMany({
    where: { company },
    orderBy: [{ status: 'asc' }, { signedAt: 'desc' }],
    include: {
      tranches: { select: { amount: true } },
      repayments: { select: { principal: true, interest: true, fees: true } },
    },
  })

  // Agreguj per kredyt: wykorzystane = suma transz, do_splaty = wykorzystane - suma_kapitalu_zwroconego
  const withSummary = loans.map((l) => {
    const drawn = l.tranches.reduce((s, t) => s + t.amount, 0)
    const principalRepaid = l.repayments.reduce((s, r) => s + r.principal, 0)
    const interestPaid = l.repayments.reduce((s, r) => s + r.interest, 0)
    const feesPaid = l.repayments.reduce((s, r) => s + r.fees, 0)
    const outstanding = drawn - principalRepaid
    const available = l.limit - outstanding
    return {
      id: l.id,
      name: l.name,
      bank: l.bank,
      contractNumber: l.contractNumber,
      type: l.type,
      limit: l.limit,
      interestRate: l.interestRate,
      signedAt: l.signedAt,
      expiresAt: l.expiresAt,
      status: l.status,
      notes: l.notes,
      drawn,
      principalRepaid,
      interestPaid,
      feesPaid,
      outstanding,
      available,
    }
  })

  return NextResponse.json(withSummary)
}

// POST — utworzenie kredytu.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const company = getActiveCompany()

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const name = String(body.name || '').trim()
  const bank = String(body.bank || '').trim()
  const type = String(body.type || 'INWESTYCYJNY')
  const limit = Number(body.limit)
  const signedAt = body.signedAt ? new Date(body.signedAt) : null

  if (!name || !bank) return NextResponse.json({ error: 'name i bank są wymagane' }, { status: 400 })
  if (!isFinite(limit) || limit <= 0) return NextResponse.json({ error: 'limit musi być dodatnią liczbą' }, { status: 400 })
  if (!signedAt || isNaN(signedAt.getTime())) return NextResponse.json({ error: 'signedAt wymagane' }, { status: 400 })
  if (!['INWESTYCYJNY', 'VAT', 'OBROTOWY', 'INNE'].includes(type)) {
    return NextResponse.json({ error: 'Nieprawidłowy type' }, { status: 400 })
  }

  const created = await prisma.loan.create({
    data: {
      company,
      name,
      bank,
      contractNumber: body.contractNumber ? String(body.contractNumber).trim() : null,
      type,
      limit,
      interestRate: isFinite(Number(body.interestRate)) ? Number(body.interestRate) : null,
      signedAt,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      status: body.status || 'AKTYWNY',
      notes: body.notes ? String(body.notes).trim() : null,
    },
    select: { id: true, name: true },
  })
  return NextResponse.json(created, { status: 201 })
}
