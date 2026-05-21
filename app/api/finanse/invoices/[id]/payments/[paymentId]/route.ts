import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// DELETE /api/finanse/invoices/[id]/payments/[paymentId]
// Usuniecie platnosci (pomyłka Marty). Aktualizuje status faktury wstecz.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; paymentId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payment = await prisma.purchaseInvoicePayment.findUnique({
    where: { id: params.paymentId },
    select: { id: true, invoiceId: true },
  })
  if (!payment || payment.invoiceId !== params.id) {
    return NextResponse.json({ error: 'Platnosc nie istnieje' }, { status: 404 })
  }

  // Usun + przelicz status
  await prisma.purchaseInvoicePayment.delete({ where: { id: params.paymentId } })

  const inv = await prisma.purchaseInvoice.findUnique({
    where: { id: params.id },
    include: { payments: { select: { amount: true } } },
  })
  if (!inv) return NextResponse.json({ ok: true })

  const payable = Math.round((inv.amountGross - (inv.deposit || 0) - (inv.buildingCosts || 0) - (inv.electricity || 0)) * 100) / 100
  const sumPaid = inv.payments.reduce((s, p) => s + p.amount, 0)
  let newStatus = inv.status
  if (sumPaid >= payable - 0.01) newStatus = 'OPLACONA'
  else if (sumPaid > 0.01) newStatus = 'CZESCIOWO_OPLACONA'
  else if (inv.status === 'OPLACONA' || inv.status === 'CZESCIOWO_OPLACONA') newStatus = 'ZATWIERDZONA'

  if (newStatus !== inv.status) {
    await prisma.purchaseInvoice.update({ where: { id: params.id }, data: { status: newStatus } })
  }

  return NextResponse.json({ ok: true, newInvoiceStatus: newStatus })
}
