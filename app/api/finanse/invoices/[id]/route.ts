import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'

// PATCH /api/finanse/invoices/[id]
// Edycja faktury. Edycja faktury w statusie ZATWIERDZONA/OPLACONA wymaga
// resetu (osobny endpoint /transition z action=RESET). Tutaj tylko edycja
// w WPROWADZONA / DO_ZATWIERDZENIA / ODRZUCONA.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const inv = await prisma.purchaseInvoice.findUnique({ where: { id: params.id } })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })

  const editableStatuses = ['WPROWADZONA', 'DO_ZATWIERDZENIA', 'ODRZUCONA']
  const adminUser = isAdmin(session.user.email)
  if (!adminUser && !editableStatuses.includes(inv.status)) {
    return NextResponse.json({
      error: `Faktura w statusie ${inv.status} nie moze byc edytowana. Cofnij do edycji przez akcje "Resetuj".`,
    }, { status: 400 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const data: any = {}
  if (body.number !== undefined) data.number = String(body.number).trim()
  if (body.subVendor !== undefined) data.subVendor = body.subVendor ? String(body.subVendor).trim() : null
  if (body.issueDate !== undefined) data.issueDate = new Date(body.issueDate)
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.vatRate !== undefined) {
    let v = Number(body.vatRate)
    if (v > 1) v = v / 100
    data.vatRate = v
  }
  if (body.amountGross !== undefined) data.amountGross = Number(body.amountGross)
  if (body.amountNet !== undefined) data.amountNet = Number(body.amountNet)
  if (body.amountVat !== undefined) data.amountVat = Number(body.amountVat)
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
  if (body.deposit !== undefined) data.deposit = isFinite(Number(body.deposit)) ? Number(body.deposit) : null
  if (body.buildingCosts !== undefined) data.buildingCosts = isFinite(Number(body.buildingCosts)) ? Number(body.buildingCosts) : null
  if (body.electricity !== undefined) data.electricity = isFinite(Number(body.electricity)) ? Number(body.electricity) : null
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null

  // Audit log: zmiana wartosci na fakturze zatwierdzonej tworzy approval typu EDITED
  // — informacja dla approvera ze faktura zostala zmieniona po jego decyzji.
  const updated = await prisma.purchaseInvoice.update({
    where: { id: params.id },
    data,
    select: { id: true },
  })

  if (inv.status === 'ZATWIERDZONA') {
    await prisma.purchaseInvoiceApproval.create({
      data: {
        invoiceId: params.id,
        action: 'EDITED',
        userId: session.user.id || null,
        userEmail: session.user.email || null,
        comment: 'Edycja faktury po zatwierdzeniu (admin override)',
      },
    })
  }

  return NextResponse.json(updated)
}

// DELETE — tylko admin (middleware nie blokuje, tu rucznie)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Tylko admin moze usuwac faktury' }, { status: 403 })
  }
  const inv = await prisma.purchaseInvoice.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })
  await prisma.purchaseInvoice.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
