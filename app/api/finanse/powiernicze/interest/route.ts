import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { currentDelayRate } from '@/lib/interest'

export const runtime = 'nodejs'

// GET — REJESTR ODSETEK: naliczone odsetki za opóźnienie w płatnościach nabywców.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await prisma.paymentInterest.findMany({
    orderBy: { paidDate: 'desc' },
    include: {
      contract: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } } },
      contractPayment: { select: { title: true } },
    },
  })

  const rows = items.map((i) => ({
    id: i.id,
    contractId: i.contract.id,
    contractNumber: i.contract.number,
    buyerName: i.contract.client ? `${i.contract.client.firstName} ${i.contract.client.lastName}`.trim() : null,
    paymentTitle: i.contractPayment?.title ?? null,
    principal: i.principal,
    dueDate: i.dueDate.toISOString().slice(0, 10),
    paidDate: i.paidDate.toISOString().slice(0, 10),
    daysLate: i.daysLate,
    type: i.type,
    ratePct: i.ratePctSnapshot,
    amount: i.amount,
    status: i.status,
    breakdown: i.breakdown,
  }))

  const naliczone = rows.filter((r) => r.status === 'NALICZONE')
  return NextResponse.json({
    rows,
    currentRate: currentDelayRate(),
    summary: {
      count: rows.length,
      totalNaliczone: Math.round(naliczone.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      total: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    },
  })
}
