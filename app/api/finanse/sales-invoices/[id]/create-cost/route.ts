import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COMPANY_LABELS, type Company } from '@/lib/types'

// POST /api/finanse/sales-invoices/[id]/create-cost
// Cross-company: tworzy fakture KOSZTOWA u odbiorcy (firma grupy) na podstawie
// tej faktury przychodowej. Np. Maraf wystawil FV dla MD -> koszt w MD.
// Status WPROWADZONA (przejdzie normalny workflow akceptacji u odbiorcy).
// Vendor u odbiorcy = nazwa firmy wystawcy (utworzony jesli brak).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sales = await prisma.salesInvoice.findUnique({ where: { id: params.id } })
  if (!sales) return NextResponse.json({ error: 'Faktura przychodowa nie istnieje' }, { status: 404 })

  if (!sales.recipientCompany) {
    return NextResponse.json({ error: 'Odbiorca nie jest firmą grupy — brak kosztu do utworzenia' }, { status: 400 })
  }
  if (sales.recipientCompany === sales.company) {
    return NextResponse.json({ error: 'Odbiorca i wystawca to ta sama firma' }, { status: 400 })
  }
  if (sales.linkedPurchaseInvoiceId) {
    // Sprawdz czy koszt nadal istnieje
    const exists = await prisma.purchaseInvoice.findUnique({ where: { id: sales.linkedPurchaseInvoiceId }, select: { id: true } })
    if (exists) return NextResponse.json({ error: 'Koszt u odbiorcy już został utworzony', costId: exists.id }, { status: 409 })
  }

  // Vendor u odbiorcy = nazwa firmy wystawcy (np. "Maraf")
  const vendorName = COMPANY_LABELS[sales.company as Company] || sales.company
  let vendor = await prisma.vendor.findUnique({ where: { name: vendorName }, select: { id: true } })
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: { name: vendorName, category: 'INNE', notes: 'Firma grupy (rozliczenia wewnątrzgrupowe)' },
      select: { id: true },
    })
  }

  // Unikalnosc (vendor, number) u odbiorcy — gdyby kolidowalo, dodaj suffix
  let number = sales.number
  const dup = await prisma.purchaseInvoice.findUnique({
    where: { vendorId_number: { vendorId: vendor.id, number } },
    select: { id: true },
  })
  if (dup) number = `${sales.number} (z FV ${sales.company})`

  const cost = await prisma.purchaseInvoice.create({
    data: {
      company: sales.recipientCompany,
      vendorId: vendor.id,
      number,
      issueDate: sales.issueDate,
      dueDate: sales.dueDate,
      vatRate: sales.vatRate,
      amountGross: sales.amountGross,
      amountNet: sales.amountNet,
      amountVat: sales.amountVat,
      description: sales.description || `Refaktura wewnątrzgrupowa od ${vendorName}`,
      status: 'WPROWADZONA',
      sourceSalesInvoiceId: sales.id,
      createdById: session.user.id || null,
    },
    select: { id: true },
  })

  await prisma.salesInvoice.update({
    where: { id: sales.id },
    data: { linkedPurchaseInvoiceId: cost.id },
  })

  return NextResponse.json({ ok: true, costId: cost.id, company: sales.recipientCompany }, { status: 201 })
}
