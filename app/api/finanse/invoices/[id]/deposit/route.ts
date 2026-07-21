import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEffectiveTerms, computeDepositReturnDate, termsBase } from '@/lib/vendor-terms'

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
    select: { id: true, amountGross: true, amountNet: true, vendorId: true, issueDate: true, depositReturnDate: true },
  })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })

  // Warunki umowne kontrahenta — baza % OSOBNO dla kaucji i KB (umowy bywaja
  // mieszane) + okres zwrotu kaucji.
  const terms = await getEffectiveTerms(inv.vendorId)
  const depBase = termsBase(inv.amountNet, inv.amountGross, terms.depositBasis)
  const kbBase = termsBase(inv.amountNet, inv.amountGross, terms.buildingCostsBasis)

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
    // wyliczamy kwote z procentu — od bazy kaucji z warunkow umowy (netto/brutto)
    data.deposit = Math.round(depBase * (pct / 100) * 100) / 100
  }

  // Koszty budowy: analogicznie do kaucji — % LUB kwota
  const kbPct = num(body.buildingCostsPct)
  const kbAmount = num(body.buildingCosts)
  if (body.buildingCostsPct !== undefined) data.buildingCostsPct = kbPct
  if (body.buildingCosts !== undefined) {
    data.buildingCosts = kbAmount
  } else if (kbPct !== null) {
    data.buildingCosts = Math.round(kbBase * (kbPct / 100) * 100) / 100
  }

  if (body.electricity !== undefined) data.electricity = num(body.electricity)

  if (body.depositReturnDate !== undefined && body.depositReturnDate !== null && body.depositReturnDate !== '') {
    data.depositReturnDate = new Date(body.depositReturnDate)
  } else {
    // Brak jawnej daty zwrotu: gdy kaucja jest ustawiana (niezerowa), a FV
    // nie ma jeszcze terminu — auto-termin z warunkow umownych kontrahenta
    // (data wystawienia + N miesiecy).
    const effectiveDeposit = data.deposit !== undefined ? data.deposit : null
    if (effectiveDeposit != null && effectiveDeposit > 0 && !inv.depositReturnDate) {
      if (terms.depositReturnMonths != null) {
        data.depositReturnDate = computeDepositReturnDate(inv.issueDate, terms.depositReturnMonths)
      }
    } else if (body.depositReturnDate === null || body.depositReturnDate === '') {
      data.depositReturnDate = null
    }
  }

  if (body.markReturned === true) data.depositReturnedAt = new Date()
  else if (body.markReturned === false) data.depositReturnedAt = null

  await prisma.purchaseInvoice.update({ where: { id: params.id }, data })
  return NextResponse.json({ ok: true })
}
