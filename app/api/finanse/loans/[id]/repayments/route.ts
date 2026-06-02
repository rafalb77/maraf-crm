import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST — nowa spłata kredytu (kapitał + odsetki + prowizje).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const date = body.date ? new Date(body.date) : null
  if (!date || isNaN(date.getTime())) return NextResponse.json({ error: 'date wymagana' }, { status: 400 })

  const principal = isFinite(Number(body.principal)) ? Number(body.principal) : 0
  const interest = isFinite(Number(body.interest)) ? Number(body.interest) : 0
  const fees = isFinite(Number(body.fees)) ? Number(body.fees) : 0

  if (principal < 0 || interest < 0 || fees < 0) {
    return NextResponse.json({ error: 'kwoty muszą być >= 0' }, { status: 400 })
  }
  if (principal + interest + fees <= 0) {
    return NextResponse.json({ error: 'suma kwot musi być > 0' }, { status: 400 })
  }

  const created = await prisma.loanRepayment.create({
    data: { loanId: params.id, date, principal, interest, fees, note: body.note ? String(body.note).trim() : null },
    select: { id: true },
  })
  return NextResponse.json(created, { status: 201 })
}
