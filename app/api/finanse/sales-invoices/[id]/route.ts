import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'
import { SALES_INVOICE_CATEGORIES, type SalesInvoiceCategory } from '@/lib/types'

// PATCH — edycja faktury przychodowej (w tym konwersja zaliczki: isAdvance=false,
// kaucja/KB, notatka, status ANULOWANA, kategoria TYNKI/INWESTYCJA + przeliczenie m2).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const inv = await prisma.salesInvoice.findUnique({
    where: { id: params.id },
    select: { id: true, amountNet: true, plasterRate: true, plasterArea: true, laborRate: true },
  })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const data: any = {}
  if (body.recipientName !== undefined) data.recipientName = String(body.recipientName).trim()
  if (body.recipientCompany !== undefined) data.recipientCompany = body.recipientCompany || null
  if (body.company !== undefined) data.company = String(body.company)
  if (body.number !== undefined) data.number = String(body.number).trim()
  if (body.issueDate !== undefined) data.issueDate = new Date(body.issueDate)
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.vatRate !== undefined) { let v = Number(body.vatRate); if (v > 1) v = v / 100; data.vatRate = v }
  if (body.amountNet !== undefined) data.amountNet = Number(body.amountNet)
  if (body.amountVat !== undefined) data.amountVat = Number(body.amountVat)
  if (body.amountGross !== undefined) data.amountGross = Number(body.amountGross)
  if (body.deposit !== undefined) data.deposit = isFinite(Number(body.deposit)) ? Number(body.deposit) : null
  if (body.buildingCosts !== undefined) data.buildingCosts = isFinite(Number(body.buildingCosts)) ? Number(body.buildingCosts) : null
  if (body.isAdvance !== undefined) data.isAdvance = body.isAdvance === true
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null
  if (body.status !== undefined) data.status = String(body.status)

  // Kategoria przychodu: TYNKI | INWESTYCJA | null (czyszczenie).
  if (body.category !== undefined) {
    if (body.category === null || body.category === '') data.category = null
    else if ((SALES_INVOICE_CATEGORIES as readonly string[]).includes(body.category)) data.category = body.category as SalesInvoiceCategory
    else return NextResponse.json({ error: `Nieprawidłowa kategoria: ${body.category}` }, { status: 400 })
  }

  // Przeliczenie tynkow. Zrodlo prawdy liczone TU (nie w kliencie):
  //   m2 = netto / stawka umowna  (chyba ze m2 podane jawnie — korekta reczna)
  //   robocizna = m2 * stawka robocizny
  // null/'' czysci pole. Kwoty do 2 miejsc.
  if (body.plasterRate !== undefined || body.plasterArea !== undefined || body.laborRate !== undefined) {
    const numOrNull = (v: any): number | null => {
      if (v === null || v === undefined || v === '') return null
      const n = typeof v === 'string' ? parseFloat(v.replace(/\s/g, '').replace(',', '.')) : Number(v)
      return isFinite(n) && n >= 0 ? n : null
    }
    const r2 = (n: number) => Math.round(n * 100) / 100
    const net = data.amountNet !== undefined ? data.amountNet : inv.amountNet
    const rate = body.plasterRate !== undefined ? numOrNull(body.plasterRate) : inv.plasterRate
    const laborRate = body.laborRate !== undefined ? numOrNull(body.laborRate) : inv.laborRate
    // m2: jawna wartosc z body wygrywa; inaczej auto z netto/stawki.
    const area = body.plasterArea !== undefined && numOrNull(body.plasterArea) !== null
      ? numOrNull(body.plasterArea)
      : rate && rate > 0 ? r2(net / rate) : null
    data.plasterRate = rate
    data.plasterArea = area
    data.laborRate = laborRate
    data.laborCost = area != null && laborRate != null ? r2(area * laborRate) : null
  }

  const updated = await prisma.salesInvoice.update({
    where: { id: params.id },
    data,
    select: { id: true, category: true, plasterRate: true, plasterArea: true, laborRate: true, laborCost: true },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Tylko admin moze usuwac faktury' }, { status: 403 })
  const inv = await prisma.salesInvoice.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })
  await prisma.salesInvoice.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
