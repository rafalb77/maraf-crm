import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'

// GET — lista rachunków powierniczych z agregacją sald.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const company = getActiveCompany()
  const accounts = await prisma.escrowAccount.findMany({
    where: { company },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      deposits: { select: { amount: true } },
      releases: { select: { amount: true } },
    },
  })

  return NextResponse.json(accounts.map((a) => {
    const depositsTotal = a.deposits.reduce((s, d) => s + d.amount, 0)
    const releasesTotal = a.releases.reduce((s, r) => s + r.amount, 0)
    return {
      id: a.id,
      name: a.name,
      bank: a.bank,
      accountNumber: a.accountNumber,
      type: a.type,
      investmentName: a.investmentName,
      status: a.status,
      notes: a.notes,
      depositsTotal,
      releasesTotal,
      balance: depositsTotal - releasesTotal,  // ile siedzi na rachunku
    }
  }))
}

// POST — utworzenie rachunku powierniczego.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const company = getActiveCompany()

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const name = String(body.name || '').trim()
  const bank = String(body.bank || '').trim()
  const type = String(body.type || 'OMRP')

  if (!name || !bank) return NextResponse.json({ error: 'name i bank są wymagane' }, { status: 400 })
  if (!['OMRP', 'ZMRP'].includes(type)) return NextResponse.json({ error: 'type musi być OMRP lub ZMRP' }, { status: 400 })

  const created = await prisma.escrowAccount.create({
    data: {
      company,
      name,
      bank,
      accountNumber: body.accountNumber ? String(body.accountNumber).trim() : null,
      type,
      investmentName: body.investmentName ? String(body.investmentName).trim() : null,
      status: body.status || 'AKTYWNY',
      notes: body.notes ? String(body.notes).trim() : null,
    },
    select: { id: true, name: true },
  })
  return NextResponse.json(created, { status: 201 })
}
