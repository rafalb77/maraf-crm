import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'

export const runtime = 'nodejs'

// GET — REJESTR WPŁAT: wszystkie zaksięgowane wpłaty nabywców (EscrowDeposit) danej
// firmy, z powiązaną ratą, lokalem, źródłem (BANK/SALES/MANUAL) i ewentualnymi odsetkami.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const company = getActiveCompany()

  const deposits = await prisma.escrowDeposit.findMany({
    where: { account: { company } },
    orderBy: { date: 'desc' },
    include: {
      account: { select: { id: true, name: true } },
      unit: { select: { number: true } },
      contractPayment: {
        select: {
          id: true,
          title: true,
          plannedAmount: true,
          plannedDate: true,
          contractId: true,
          interest: { select: { amount: true, daysLate: true, status: true } },
        },
      },
    },
  })

  const rows = deposits.map((d) => ({
    id: d.id,
    date: d.date.toISOString().slice(0, 10),
    amount: d.amount,
    buyerName: d.buyerName,
    contractNumber: d.contractNumber,
    unitNumber: d.unit?.number ?? null,
    accountName: d.account.name,
    source: d.source,
    contractId: d.contractPayment?.contractId ?? null,
    paymentTitle: d.contractPayment?.title ?? null,
    plannedAmount: d.contractPayment?.plannedAmount ?? null,
    plannedDate: d.contractPayment?.plannedDate?.toISOString().slice(0, 10) ?? null,
    delta:
      d.contractPayment?.plannedAmount != null
        ? Math.round((d.amount - d.contractPayment.plannedAmount) * 100) / 100
        : null,
    interest: d.contractPayment?.interest
      ? {
          amount: d.contractPayment.interest.amount,
          daysLate: d.contractPayment.interest.daysLate,
          status: d.contractPayment.interest.status,
        }
      : null,
  }))

  const total = rows.reduce((s, r) => s + r.amount, 0)
  const bySource = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + r.amount
    return acc
  }, {})

  return NextResponse.json({
    rows,
    summary: {
      count: rows.length,
      total: Math.round(total * 100) / 100,
      bySource,
    },
  })
}
