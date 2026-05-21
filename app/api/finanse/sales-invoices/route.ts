import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST — utworzenie faktury przychodowej (sprzedazowej).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const company = String(body.company || 'MARAF')
  const number = String(body.number || '').trim()
  const recipientName = String(body.recipientName || '').trim()
  if (!number || !recipientName) {
    return NextResponse.json({ error: 'number i recipientName sa wymagane' }, { status: 400 })
  }

  const issueDate = body.issueDate ? new Date(body.issueDate) : null
  if (!issueDate || isNaN(issueDate.getTime())) {
    return NextResponse.json({ error: 'issueDate wymagana' }, { status: 400 })
  }
  const dueDate = body.dueDate ? new Date(body.dueDate) : null

  let vatRate = Number(body.vatRate)
  if (!isFinite(vatRate)) vatRate = 0
  if (vatRate > 1) vatRate = vatRate / 100

  const amountGross = Number(body.amountGross)
  if (!isFinite(amountGross)) return NextResponse.json({ error: 'amountGross musi byc liczba' }, { status: 400 })
  const amountNet = isFinite(Number(body.amountNet)) ? Number(body.amountNet) : Math.round((amountGross / (1 + vatRate)) * 100) / 100
  const amountVat = isFinite(Number(body.amountVat)) ? Number(body.amountVat) : Math.round((amountGross - amountNet) * 100) / 100

  const dup = await prisma.salesInvoice.findUnique({
    where: { company_number: { company, number } },
    select: { id: true },
  })
  if (dup) return NextResponse.json({ error: 'Faktura o tym numerze juz istnieje dla tej firmy', existingId: dup.id }, { status: 409 })

  const created = await prisma.salesInvoice.create({
    data: {
      company,
      number,
      recipientName,
      recipientCompany: body.recipientCompany || null,
      issueDate,
      dueDate,
      vatRate,
      amountNet,
      amountVat,
      amountGross,
      deposit: isFinite(Number(body.deposit)) ? Number(body.deposit) : null,
      buildingCosts: isFinite(Number(body.buildingCosts)) ? Number(body.buildingCosts) : null,
      isAdvance: body.isAdvance === true,
      description: body.description ? String(body.description).trim() : null,
      status: 'WYSTAWIONA',
      createdById: session.user.id || null,
    },
    select: { id: true, number: true },
  })
  return NextResponse.json(created, { status: 201 })
}
