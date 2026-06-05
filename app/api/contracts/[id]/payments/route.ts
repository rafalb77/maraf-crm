import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET — lista rat harmonogramu dla umowy.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payments = await prisma.contractPayment.findMany({
    where: { contractId: params.id },
    orderBy: [{ position: 'asc' }, { plannedDate: 'asc' }],
    include: { escrowDeposit: { select: { id: true, accountId: true } } },
  })
  return NextResponse.json(payments)
}

// POST — nowa rata planowana.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    select: { id: true, type: true },
  })
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const plannedAmount = Number(body.plannedAmount)
  if (!isFinite(plannedAmount) || plannedAmount <= 0) {
    return NextResponse.json({ error: 'plannedAmount musi być > 0' }, { status: 400 })
  }
  const type = String(body.type || 'RATA')
  if (!['ZALICZKA', 'RATA', 'KONCOWA', 'REZERWACYJNA'].includes(type)) {
    return NextResponse.json({ error: 'Nieprawidłowy type' }, { status: 400 })
  }

  // toEscrow: domyślnie true dla umowy deweloperskiej, false dla pozostałych.
  // Można nadpisać jawnie z body.
  const toEscrow = typeof body.toEscrow === 'boolean'
    ? body.toEscrow
    : contract.type === 'DEWELOPERSKA'

  // pozycja = max+1
  const last = await prisma.contractPayment.findFirst({
    where: { contractId: params.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  })

  const created = await prisma.contractPayment.create({
    data: {
      contractId: params.id,
      title: body.title ? String(body.title).trim() : null,
      type,
      plannedDate: body.plannedDate ? new Date(body.plannedDate) : null,
      plannedAmount,
      toEscrow,
      note: body.note ? String(body.note).trim() : null,
      position: (last?.position ?? -1) + 1,
    },
    select: { id: true },
  })
  return NextResponse.json(created, { status: 201 })
}
