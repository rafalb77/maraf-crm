import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST — dodanie wplaty klienta do faktury przychodowej.
// Kwota nalezna = brutto - kaucja - KB. Status OPLACONA gdy Σwplat >= nalezna.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const amount = Number(body.amount)
  if (!isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'amount > 0 wymagany' }, { status: 400 })
  const paidAt = body.paidAt ? new Date(body.paidAt) : null
  if (!paidAt || isNaN(paidAt.getTime())) return NextResponse.json({ error: 'paidAt wymagana' }, { status: 400 })

  const inv = await prisma.salesInvoice.findUnique({
    where: { id: params.id },
    include: { payments: { select: { amount: true } } },
  })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })
  if (inv.status === 'ANULOWANA') return NextResponse.json({ error: 'Faktura anulowana' }, { status: 400 })

  const payable = Math.round((inv.amountGross - (inv.deposit || 0) - (inv.buildingCosts || 0)) * 100) / 100
  const currentSum = inv.payments.reduce((s, p) => s + p.amount, 0)
  const newSum = currentSum + amount
  if (newSum > payable + 1) {
    return NextResponse.json({ error: `Suma wplat (${newSum.toFixed(2)}) przekroczy kwote nalezna (${payable.toFixed(2)})` }, { status: 400 })
  }

  let newStatus = inv.status
  if (newSum >= payable - 0.01) newStatus = 'OPLACONA'
  else if (newSum > 0.01) newStatus = 'CZESCIOWO_OPLACONA'

  const [created] = await prisma.$transaction([
    prisma.salesInvoicePayment.create({
      data: {
        invoiceId: params.id,
        amount,
        paidAt,
        reference: body.reference ? String(body.reference).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        createdById: session.user.id || null,
      },
      select: { id: true, amount: true, paidAt: true },
    }),
    prisma.salesInvoice.update({ where: { id: params.id }, data: { status: newStatus } }),
  ])
  return NextResponse.json({ ...created, newInvoiceStatus: newStatus }, { status: 201 })
}
