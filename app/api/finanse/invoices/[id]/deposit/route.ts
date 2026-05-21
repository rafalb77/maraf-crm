import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/finanse/invoices/[id]/deposit
// Zapis kaucji gwarancyjnej i potracen. Dziala na kazdym statusie.
//
// Body (wszystkie opcjonalne; null/'' czysci):
//  { depositPct, deposit, buildingCosts, electricity, depositReturnDate, markReturned }
//  - depositPct: % kaucji — jesli podany, kwota deposit liczona z brutto
//  - deposit: kwota kaucji (nadpisuje wyliczona z %)
//  - markReturned: true -> depositReturnedAt = now(); false -> null
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const inv = await prisma.purchaseInvoice.findUnique({
    where: { id: params.id },
    select: { id: true, amountGross: true },
  })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })

  const num = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'string' ? parseFloat(v.replace(/\s/g, '').replace(',', '.')) : Number(v)
    return isFinite(n) ? n : null
  }

  const data: any = {}

  // Kaucja: jesli podany %, licz kwote z brutto. Jesli podana kwota — uzyj jej.
  const pct = num(body.depositPct)
  const depositAmount = num(body.deposit)
  if (body.depositPct !== undefined) data.depositPct = pct
  if (body.deposit !== undefined) {
    data.deposit = depositAmount
  } else if (pct !== null) {
    // wyliczamy kwote z procentu
    data.deposit = Math.round(inv.amountGross * (pct / 100) * 100) / 100
  }

  if (body.buildingCosts !== undefined) data.buildingCosts = num(body.buildingCosts)
  if (body.electricity !== undefined) data.electricity = num(body.electricity)

  if (body.depositReturnDate !== undefined) {
    data.depositReturnDate = body.depositReturnDate ? new Date(body.depositReturnDate) : null
  }

  if (body.markReturned === true) data.depositReturnedAt = new Date()
  else if (body.markReturned === false) data.depositReturnedAt = null

  await prisma.purchaseInvoice.update({ where: { id: params.id }, data })
  return NextResponse.json({ ok: true })
}
