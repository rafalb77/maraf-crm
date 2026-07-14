import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyMatch, unapplyMatch } from '@/lib/bank-reconcile'

// PATCH — akcje na pozycji wyciągu:
//   action=apply    { paymentId?, escrowAccountId? } — księguje wpłatę na ratę (deposit + odsetki)
//   action=unapply  — cofa księgowanie (kasuje deposit/odsetki, rata → PLANOWANA)
//   action=ignore   — oznacza pozycję jako nieistotną (IGNORED)
//   action=unignore — przywraca do UNMATCHED
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 })
  }
  const action = String(body.action || '')

  const tx = await prisma.bankTransaction.findUnique({ where: { id: params.id }, select: { id: true, contractPaymentId: true } })
  if (!tx) return NextResponse.json({ error: 'Nie znaleziono transakcji' }, { status: 404 })

  if (action === 'apply') {
    const paymentId = body.paymentId ? String(body.paymentId) : tx.contractPaymentId
    if (!paymentId) return NextResponse.json({ error: 'Brak raty do zaksięgowania (paymentId)' }, { status: 400 })
    const res = await applyMatch(params.id, paymentId, {
      escrowAccountId: body.escrowAccountId ? String(body.escrowAccountId) : null,
    })
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    return NextResponse.json({ ok: true, interest: res.interest })
  }

  if (action === 'unapply') {
    const res = await unapplyMatch(params.id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'ignore') {
    await prisma.bankTransaction.update({ where: { id: params.id }, data: { matchStatus: 'IGNORED' } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'unignore') {
    await prisma.bankTransaction.update({ where: { id: params.id }, data: { matchStatus: 'UNMATCHED' } })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Nieznana akcja' }, { status: 400 })
}
