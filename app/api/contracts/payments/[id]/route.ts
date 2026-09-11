import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveEscrowAccount, createDepositForPayment } from '@/lib/contract-escrow'
import { audit, extractRequestMeta } from '@/lib/audit-log'

/** Migawka raty do AuditLog (przed zmianą / przed skasowaniem). */
function paymentSnapshot(p: {
  contractId: string
  title: string | null
  type: string
  plannedAmount: number
  plannedDate: Date | null
  status: string
  paidAmount: number | null
  paidDate: Date | null
  toEscrow: boolean
}) {
  return {
    contractId: p.contractId,
    title: p.title,
    type: p.type,
    plannedAmount: p.plannedAmount,
    plannedDate: p.plannedDate ? p.plannedDate.toISOString().slice(0, 10) : null,
    status: p.status,
    paidAmount: p.paidAmount,
    paidDate: p.paidDate ? p.paidDate.toISOString().slice(0, 10) : null,
    toEscrow: p.toEscrow,
  }
}

// PATCH — odhaczenie/cofnięcie wpłaty lub edycja planowanej raty.
// body.action:
//   'pay'   → status OPLACONA + paidDate/paidAmount; jeśli toEscrow → auto EscrowDeposit
//   'unpay' → status PLANOWANA, kasuje powiązany deposit
//   (brak)  → edycja pól planowanych (title/type/plannedDate/plannedAmount/toEscrow/note)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payment = await prisma.contractPayment.findUnique({
    where: { id: params.id },
    include: { escrowDeposit: { select: { id: true } } },
  })
  if (!payment) return NextResponse.json({ error: 'Nie znaleziono raty' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const action = body.action as string | undefined
  const meta = extractRequestMeta(req)
  const logUpdate = (details: Record<string, unknown>) =>
    void audit({
      action: 'UPDATE',
      userId: (session.user as any)?.id,
      userEmail: session.user?.email,
      entity: 'ContractPayment',
      entityId: payment.id,
      path: req.nextUrl.pathname,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { before: paymentSnapshot(payment), ...details },
    })

  // === ODHACZENIE WPŁATY ===
  if (action === 'pay') {
    const paidDate = body.paidDate ? new Date(body.paidDate) : new Date()
    if (isNaN(paidDate.getTime())) return NextResponse.json({ error: 'paidDate nieprawidłowa' }, { status: 400 })
    const paidAmount = isFinite(Number(body.paidAmount)) ? Number(body.paidAmount) : payment.plannedAmount
    if (paidAmount <= 0) return NextResponse.json({ error: 'paidAmount musi być > 0' }, { status: 400 })

    let warning: string | null = null

    // Jeśli rata ma trafić na escrow — utwórz deposit (o ile jeszcze nie ma)
    if (payment.toEscrow && !payment.escrowDeposit) {
      const resolved = await resolveEscrowAccount(body.escrowAccountId || null)
      if ('accountId' in resolved) {
        await createDepositForPayment({
          contractPaymentId: payment.id,
          accountId: resolved.accountId,
          date: paidDate,
          amount: paidAmount,
        })
      } else if (resolved.error === 'NEED_CHOICE') {
        return NextResponse.json({ error: 'Wybierz rachunek powierniczy', code: 'NEED_CHOICE' }, { status: 409 })
      } else if (resolved.error === 'NO_ACCOUNT') {
        warning = 'Wpłatę oznaczono jako opłaconą, ale brak rachunku powierniczego MD — deposit nie został utworzony. Dodaj rachunek w Finanse → Finansowanie.'
      } else {
        return NextResponse.json({ error: 'Nieprawidłowy rachunek powierniczy' }, { status: 400 })
      }
    }

    await prisma.contractPayment.update({
      where: { id: params.id },
      data: { status: 'OPLACONA', paidDate, paidAmount },
    })
    logUpdate({ action: 'pay', paidAmount, paidDate: paidDate.toISOString().slice(0, 10) })
    return NextResponse.json({ ok: true, warning })
  }

  // === COFNIĘCIE ODHACZENIA ===
  if (action === 'unpay') {
    // skasuj powiązany deposit (jeśli był)
    if (payment.escrowDeposit) {
      await prisma.escrowDeposit.delete({ where: { id: payment.escrowDeposit.id } })
    }
    await prisma.contractPayment.update({
      where: { id: params.id },
      data: { status: 'PLANOWANA', paidDate: null, paidAmount: null },
    })
    logUpdate({ action: 'unpay' })
    return NextResponse.json({ ok: true })
  }

  // === EDYCJA PLANOWANEJ RATY ===
  const data: any = {}
  if ('title' in body) data.title = body.title ? String(body.title).trim() : null
  if (typeof body.type === 'string' && ['ZALICZKA', 'RATA', 'KONCOWA', 'REZERWACYJNA'].includes(body.type)) data.type = body.type
  if ('plannedDate' in body) data.plannedDate = body.plannedDate ? new Date(body.plannedDate) : null
  if (isFinite(Number(body.plannedAmount)) && Number(body.plannedAmount) > 0) data.plannedAmount = Number(body.plannedAmount)
  if (typeof body.toEscrow === 'boolean') data.toEscrow = body.toEscrow
  if ('note' in body) data.note = body.note ? String(body.note).trim() : null

  const updated = await prisma.contractPayment.update({ where: { id: params.id }, data, select: { id: true } })
  logUpdate({
    action: 'edit',
    after: { ...data, plannedDate: data.plannedDate instanceof Date ? data.plannedDate.toISOString().slice(0, 10) : data.plannedDate },
  })
  return NextResponse.json(updated)
}

// DELETE — usuń ratę (Cascade kasuje powiązany EscrowDeposit). Migawka raty trafia do AuditLog.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payment = await prisma.contractPayment.findUnique({ where: { id: params.id } })
  if (!payment) return NextResponse.json({ error: 'Nie znaleziono raty' }, { status: 404 })

  await prisma.contractPayment.delete({ where: { id: params.id } })

  const meta = extractRequestMeta(req)
  void audit({
    action: 'DELETE',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'ContractPayment',
    entityId: params.id,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { deletedSnapshot: paymentSnapshot(payment) },
  })
  return NextResponse.json({ ok: true })
}
