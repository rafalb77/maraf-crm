import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'
import { PURCHASE_INVOICE_CATEGORIES, type PurchaseInvoiceCategory } from '@/lib/types'

// PATCH /api/finanse/invoices/[id]
// Edycja faktury. Edycja faktury w statusie ZATWIERDZONA/OPLACONA wymaga
// resetu (osobny endpoint /transition z action=RESET). Tutaj tylko edycja
// w WPROWADZONA / DO_ZATWIERDZENIA / ODRZUCONA.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const inv = await prisma.purchaseInvoice.findUnique({ where: { id: params.id } })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  // Kazdy uzytkownik z dostepem do modulu Finanse moze edytowac fakture — Marta
  // jest operatorem FV i poprawia m.in. bledy importu z Excela (takze na
  // fakturach juz zatwierdzonych/oplaconych). Zmiana DANYCH FINANSOWYCH faktury
  // "zablokowanej" (zatwierdzona/oplacona) jest logowana (EDITED) dla sladu
  // audytowego; klasyfikacje (kategoria/notatka/tagi Budowy) nie sa logowane.
  const CLASSIFICATION_FIELDS = new Set([
    'category',
    'notes',
    'investmentId',
    'constructionStageId',
    'constructionTaskId',
    'protocolId',
  ])

  const data: any = {}
  if (body.number !== undefined) data.number = String(body.number).trim()
  if (body.vendorId !== undefined && body.vendorId) data.vendorId = String(body.vendorId)
  if (body.category !== undefined) {
    if (body.category === null || body.category === '') {
      data.category = null
    } else if (PURCHASE_INVOICE_CATEGORIES.includes(body.category as PurchaseInvoiceCategory)) {
      data.category = body.category
    } else {
      return NextResponse.json({ error: `Nieprawidłowa kategoria: ${body.category}` }, { status: 400 })
    }
  }
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

  // Tagi modułu Budowa (Etap 3). Walidujemy istnienie + spójność (etap/zadanie należą
  // do wskazanej inwestycji). Wyczyszczenie inwestycji zeruje etap/zadanie/protokół.
  if (body.investmentId !== undefined) {
    if (!body.investmentId) {
      data.investmentId = null
      data.constructionStageId = null
      data.constructionTaskId = null
    } else {
      const exists = await prisma.investment.findUnique({ where: { id: body.investmentId }, select: { id: true } })
      if (!exists) return NextResponse.json({ error: 'Nieznana inwestycja' }, { status: 400 })
      data.investmentId = body.investmentId
    }
  }
  const effInvestmentId = data.investmentId !== undefined ? data.investmentId : inv.investmentId
  if (body.constructionStageId !== undefined) {
    if (!body.constructionStageId) {
      data.constructionStageId = null
    } else {
      const stage = await prisma.constructionStage.findFirst({
        where: { id: body.constructionStageId, investmentId: effInvestmentId || undefined },
        select: { id: true },
      })
      if (!stage) return NextResponse.json({ error: 'Etap nie należy do wskazanej inwestycji' }, { status: 400 })
      data.constructionStageId = stage.id
    }
  }
  if (body.constructionTaskId !== undefined) {
    if (!body.constructionTaskId) {
      data.constructionTaskId = null
    } else {
      const task = await prisma.constructionTask.findFirst({
        where: { id: body.constructionTaskId, investmentId: effInvestmentId || undefined },
        select: { id: true },
      })
      if (!task) return NextResponse.json({ error: 'Zadanie nie należy do wskazanej inwestycji' }, { status: 400 })
      data.constructionTaskId = task.id
    }
  }
  if (body.protocolId !== undefined) {
    data.protocolId = body.protocolId ? String(body.protocolId) : null
  }

  // Audit log: zmiana wartosci na fakturze zatwierdzonej tworzy approval typu EDITED
  // — informacja dla approvera ze faktura zostala zmieniona po jego decyzji.
  let updated
  try {
    updated = await prisma.purchaseInvoice.update({
      where: { id: params.id },
      data,
      select: { id: true },
    })
  } catch (e: any) {
    // P2002 — kolizja unikalnego klucza (vendorId + number): u tego kontrahenta
    // istnieje juz faktura o tym numerze. Czesty przy poprawianiu importu z xlsx.
    if (e?.code === 'P2002') {
      return NextResponse.json({
        error: 'Ten numer faktury już istnieje u wybranego kontrahenta. Zmień numer lub kontrahenta.',
      }, { status: 409 })
    }
    throw e
  }

  // Slad audytowy: zmiana danych finansowych faktury w statusie zablokowanym
  // (zatwierdzona / zaplanowana / oplacona / czesciowo oplacona) — kto i kiedy.
  const LOCKED_STATUSES = new Set(['ZATWIERDZONA', 'ZAPLANOWANA', 'OPLACONA', 'CZESCIOWO_OPLACONA'])
  const financialChanged = Object.keys(data).some((k) => !CLASSIFICATION_FIELDS.has(k))
  if (financialChanged && LOCKED_STATUSES.has(inv.status)) {
    await prisma.purchaseInvoiceApproval.create({
      data: {
        invoiceId: params.id,
        action: 'EDITED',
        userId: session.user.id || null,
        userEmail: session.user.email || null,
        comment: `Edycja danych faktury w statusie ${inv.status}`,
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
