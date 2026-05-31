import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST — utworzenie nowej faktury zakupowej.
// Body: { vendorId, number, issueDate, dueDate?, vatRate, amountGross, amountNet?, amountVat?,
//         subVendor?, description?, deposit?, buildingCosts?, electricity? }
// vatRate jako udzial (0.23) lub procent (23) — normalizujemy.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const vendorId = String(body.vendorId || '')
  const number = String(body.number || '').trim()
  if (!vendorId || !number) {
    return NextResponse.json({ error: 'vendorId i number sa wymagane' }, { status: 400 })
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } })
  if (!vendor) return NextResponse.json({ error: 'Vendor nie istnieje' }, { status: 404 })

  const issueDate = body.issueDate ? new Date(body.issueDate) : null
  if (!issueDate || isNaN(issueDate.getTime())) {
    return NextResponse.json({ error: 'issueDate wymagana' }, { status: 400 })
  }
  const dueDate = body.dueDate ? new Date(body.dueDate) : null

  // VAT rate normalizacja
  let vatRate = Number(body.vatRate)
  if (!isFinite(vatRate)) vatRate = 0
  if (vatRate > 1) vatRate = vatRate / 100

  const amountGross = Number(body.amountGross)
  if (!isFinite(amountGross)) {
    return NextResponse.json({ error: 'amountGross musi byc liczba' }, { status: 400 })
  }
  // Faktury korygujace moga miec ujemne kwoty — akceptujemy
  const amountNet = isFinite(Number(body.amountNet))
    ? Number(body.amountNet)
    : Math.round((amountGross / (1 + vatRate)) * 100) / 100
  const amountVat = isFinite(Number(body.amountVat))
    ? Number(body.amountVat)
    : Math.round((amountGross - amountNet) * 100) / 100

  // Sprawdz duplikat (vendor, number)
  const dup = await prisma.purchaseInvoice.findUnique({
    where: { vendorId_number: { vendorId, number } },
    select: { id: true },
  })
  if (dup) {
    return NextResponse.json({ error: 'Faktura o tym numerze juz istnieje dla tego kontrahenta', existingId: dup.id }, { status: 409 })
  }

  const company = body.company === 'MARAF_DEVELOPMENT' ? 'MARAF_DEVELOPMENT' : 'MARAF'

  const created = await prisma.purchaseInvoice.create({
    data: {
      company,
      vendorId,
      number,
      subVendor: body.subVendor ? String(body.subVendor).trim() : null,
      issueDate,
      dueDate,
      vatRate,
      amountGross,
      amountNet,
      amountVat,
      description: body.description ? String(body.description).trim() : null,
      deposit: isFinite(Number(body.deposit)) ? Number(body.deposit) : null,
      buildingCosts: isFinite(Number(body.buildingCosts)) ? Number(body.buildingCosts) : null,
      electricity: isFinite(Number(body.electricity)) ? Number(body.electricity) : null,
      status: 'ZATWIERDZONA',
      createdById: session.user.id || null,
    },
    select: { id: true, number: true },
  })

  return NextResponse.json(created, { status: 201 })
}
