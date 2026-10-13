import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'

// Reczne obciazenia kontrahentow (kary umowne itp.) — modul Obciazenia.
// POST { vendorLabel, title, amountNet, chargedAt, invoiceNumber?, notes? }
// Kwota wpisywana w NETTO (podsumowania modulu sa netto).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const company = getActiveCompany()

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const vendorLabel = String(body.vendorLabel || '').trim()
  const title = String(body.title || '').trim()
  const amountNet = Number(String(body.amountNet ?? '').toString().replace(/\s/g, '').replace(',', '.'))
  const chargedAt = body.chargedAt ? new Date(body.chargedAt) : new Date()

  if (!vendorLabel) return NextResponse.json({ error: 'Brak kontrahenta' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'Podaj tytuł obciążenia (np. „Kara umowna — opóźnienie”)' }, { status: 400 })
  if (!isFinite(amountNet) || amountNet <= 0) return NextResponse.json({ error: 'Kwota netto musi być liczbą > 0' }, { status: 400 })
  if (isNaN(chargedAt.getTime())) return NextResponse.json({ error: 'Nieprawidłowa data' }, { status: 400 })

  // Klucz miekki do vendora (jesli etykieta ma swoj wpis kontrahenta)
  const vendor = await prisma.vendor.findFirst({
    where: { name: { equals: vendorLabel, mode: 'insensitive' } },
    select: { id: true },
  })

  const created = await prisma.vendorCharge.create({
    data: {
      company,
      vendorLabel,
      vendorId: vendor?.id || null,
      type: 'KARA',
      title,
      amountNet: Math.round(amountNet * 100) / 100,
      chargedAt,
      invoiceNumber: body.invoiceNumber ? String(body.invoiceNumber).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
      createdByEmail: session.user.email || null,
    },
  })
  return NextResponse.json(created, { status: 201 })
}
