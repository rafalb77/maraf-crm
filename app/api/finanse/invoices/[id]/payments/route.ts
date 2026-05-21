import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/finanse/invoices/[id]/payments
// Dodanie platnosci do faktury. Aktualizuje status faktury na CZESCIOWO_OPLACONA lub OPLACONA
// wg sumy platnosci vs amountGross.
//
// Body: { amount: number, paidAt: string (ISO date), bankAccount?: string, reference?: string, notes?: string }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const amount = Number(body.amount)
  if (!isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount musi byc liczba > 0' }, { status: 400 })
  }
  const paidAt = body.paidAt ? new Date(body.paidAt) : null
  if (!paidAt || isNaN(paidAt.getTime())) {
    return NextResponse.json({ error: 'paidAt wymagana' }, { status: 400 })
  }

  const inv = await prisma.purchaseInvoice.findUnique({
    where: { id: params.id },
    include: { payments: { select: { amount: true } } },
  })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })

  // Mozna placic tylko zatwierdzona / czesciowo / wprowadzona (np. przy migracji)
  const payableStatuses = ['WPROWADZONA', 'DO_ZATWIERDZENIA', 'ZATWIERDZONA', 'ZAPLANOWANA', 'CZESCIOWO_OPLACONA']
  if (!payableStatuses.includes(inv.status)) {
    return NextResponse.json({
      error: `Nie mozna dodac platnosci do faktury w statusie ${inv.status}`,
    }, { status: 400 })
  }

  // Kwota nalezna = brutto - potracenia (kaucja/KB/prad). Status OPLACONA gdy
  // splacono nalezna kwote (nie cale brutto — bo kaucja jest zatrzymana, nie placona).
  const payable = Math.round((inv.amountGross - (inv.deposit || 0) - (inv.buildingCosts || 0) - (inv.electricity || 0)) * 100) / 100
  const currentSum = inv.payments.reduce((s, p) => s + p.amount, 0)
  const newSum = currentSum + amount
  // Pozwalamy na lekkie nadplaty (max +1zl) — czasem zaokraglenia. Powyzej blad.
  if (newSum > payable + 1) {
    return NextResponse.json({
      error: `Suma platnosci (${newSum.toFixed(2)}) przekroczy kwote nalezna po potraceniach (${payable.toFixed(2)})`,
    }, { status: 400 })
  }

  // Wyznacz nowy status
  let newStatus = inv.status
  if (newSum >= payable - 0.01) newStatus = 'OPLACONA'
  else if (newSum > 0.01) newStatus = 'CZESCIOWO_OPLACONA'

  const [created] = await prisma.$transaction([
    prisma.purchaseInvoicePayment.create({
      data: {
        invoiceId: params.id,
        amount,
        paidAt,
        bankAccount: body.bankAccount ? String(body.bankAccount).trim() : null,
        reference: body.reference ? String(body.reference).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        createdById: session.user.id || null,
      },
      select: { id: true, amount: true, paidAt: true },
    }),
    prisma.purchaseInvoice.update({
      where: { id: params.id },
      data: { status: newStatus },
    }),
  ])

  return NextResponse.json({ ...created, newInvoiceStatus: newStatus }, { status: 201 })
}
