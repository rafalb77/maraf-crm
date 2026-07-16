import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/finanse/invoices/bulk-approve  { ids: string[] }
// Zbiorcze zatwierdzenie faktur (WPROWADZONA/DO_ZATWIERDZENIA/ODRZUCONA ->
// ZATWIERDZONA), zeby trafily do kolejki platnosci. Kazde przejscie logowane
// (APPROVE). Faktury w innym statusie sa pomijane i raportowane.
const APPROVABLE = new Set(['POBRANA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'ODRZUCONA'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: any) => typeof x === 'string') : []
  if (!ids.length) return NextResponse.json({ error: 'Brak zaznaczonych faktur' }, { status: 400 })

  const invoices = await prisma.purchaseInvoice.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  })
  const toApprove = invoices.filter((i) => APPROVABLE.has(i.status))
  const skipped = invoices.length - toApprove.length

  if (toApprove.length) {
    await prisma.$transaction([
      prisma.purchaseInvoice.updateMany({
        where: { id: { in: toApprove.map((i) => i.id) } },
        data: { status: 'ZATWIERDZONA' },
      }),
      prisma.purchaseInvoiceApproval.createMany({
        data: toApprove.map((i) => ({
          invoiceId: i.id,
          action: 'APPROVE',
          userId: session.user.id || null,
          userEmail: session.user.email || null,
          comment: 'Zatwierdzenie zbiorcze',
        })),
      }),
    ])
  }

  return NextResponse.json({ approved: toApprove.length, skipped })
}
