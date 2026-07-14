import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET — szczegóły wyciągu z pozycjami (+ podgląd dopasowanej raty).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const st = await prisma.bankStatement.findUnique({
    where: { id: params.id },
    include: {
      escrowAccount: { select: { id: true, name: true } },
      transactions: {
        orderBy: [{ bookingDate: 'asc' }],
        include: {
          contractPayment: {
            select: { id: true, title: true, plannedAmount: true, plannedDate: true, status: true },
          },
          contract: { select: { id: true, number: true } },
          escrowDeposit: { select: { id: true } },
        },
      },
    },
  })
  if (!st) return NextResponse.json({ error: 'Nie znaleziono wyciągu' }, { status: 404 })

  return NextResponse.json({
    id: st.id,
    format: st.format,
    fileName: st.fileName,
    accountNumber: st.accountNumber,
    periodFrom: st.periodFrom?.toISOString() ?? null,
    periodTo: st.periodTo?.toISOString() ?? null,
    openingBalance: st.openingBalance,
    closingBalance: st.closingBalance,
    currency: st.currency,
    escrowAccount: st.escrowAccount,
    transactions: st.transactions.map((t) => ({
      id: t.id,
      bookingDate: t.bookingDate.toISOString().slice(0, 10),
      side: t.side,
      amount: t.amount,
      counterpartyName: t.counterpartyName,
      counterpartyIban: t.counterpartyIban,
      title: t.title,
      bankRef: t.bankRef,
      matchStatus: t.matchStatus,
      matchScore: t.matchScore,
      matchReason: t.matchReason,
      booked: !!t.escrowDeposit,
      payment: t.contractPayment
        ? {
            id: t.contractPayment.id,
            title: t.contractPayment.title,
            plannedAmount: t.contractPayment.plannedAmount,
            plannedDate: t.contractPayment.plannedDate?.toISOString().slice(0, 10) ?? null,
            status: t.contractPayment.status,
          }
        : null,
      contract: t.contract,
    })),
  })
}

// PATCH — przypisanie rachunku powierniczego do wyciągu (gdy nie dopasował się po IBAN).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 })
  }
  const escrowAccountId = body.escrowAccountId ? String(body.escrowAccountId) : null
  if (escrowAccountId) {
    const acc = await prisma.escrowAccount.findUnique({ where: { id: escrowAccountId }, select: { id: true } })
    if (!acc) return NextResponse.json({ error: 'Nie ma takiego rachunku' }, { status: 400 })
  }
  await prisma.bankStatement.update({ where: { id: params.id }, data: { escrowAccountId } })
  return NextResponse.json({ ok: true })
}

// DELETE — usuwa wyciąg wraz z pozycjami (transakcje Cascade). Zaksięgowane depozyty
// zostają (bankTransactionId → SetNull), ale zrywają link. Zaksięgowane raty NIE cofają
// się automatycznie — usuń najpierw księgowania w widoku dopasowania, jeśli trzeba.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const booked = await prisma.escrowDeposit.count({
    where: { bankTransaction: { statementId: params.id } },
  })
  if (booked > 0) {
    return NextResponse.json(
      { error: `Wyciąg ma ${booked} zaksięgowanych wpłat. Cofnij księgowania przed usunięciem wyciągu.` },
      { status: 409 }
    )
  }
  await prisma.bankStatement.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
