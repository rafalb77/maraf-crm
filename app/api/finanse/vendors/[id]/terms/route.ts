import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Warunki umowne kontrahenta (kaucja + KB) — per budowa.
// GET    → lista wierszy (domyslny '' pierwszy)
// POST   → upsert wiersza { investment?, depositPct?, depositReturnMonths?, buildingCostsPct?, notes? }
// DELETE → usuniecie wiersza ?investment=<nazwa> ('' = domyslny)

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? parseFloat(v.replace(/\s/g, '').replace(',', '.')) : Number(v)
  return isFinite(n) ? n : null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const terms = await prisma.vendorTerms.findMany({
    where: { vendorId: params.id },
    orderBy: { investment: 'asc' }, // '' (domyslne) pierwsze
  })
  return NextResponse.json(terms)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const vendor = await prisma.vendor.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!vendor) return NextResponse.json({ error: 'Kontrahent nie istnieje' }, { status: 404 })

  const investment = String(body.investment ?? '').trim()
  const depositPct = num(body.depositPct)
  const depositReturnMonthsRaw = num(body.depositReturnMonths)
  const depositReturnMonths = depositReturnMonthsRaw != null ? Math.round(depositReturnMonthsRaw) : null
  const buildingCostsPct = num(body.buildingCostsPct)
  // Baza % OSOBNO dla kaucji i KB (umowy mieszane). Fallback na legacy
  // body.calcBasis (starsze klienty wysylaly jedna wspolna baze).
  const asBasis = (v: any): 'NETTO' | 'BRUTTO' => (v === 'NETTO' ? 'NETTO' : 'BRUTTO')
  const depositBasis = asBasis(body.depositBasis ?? body.calcBasis)
  const buildingCostsBasis = asBasis(body.buildingCostsBasis ?? body.calcBasis)
  const notes = body.notes ? String(body.notes).trim() : null

  if (depositPct != null && (depositPct < 0 || depositPct > 100)) {
    return NextResponse.json({ error: 'depositPct musi byc w zakresie 0-100' }, { status: 400 })
  }
  if (buildingCostsPct != null && (buildingCostsPct < 0 || buildingCostsPct > 100)) {
    return NextResponse.json({ error: 'buildingCostsPct musi byc w zakresie 0-100' }, { status: 400 })
  }
  if (depositReturnMonths != null && (depositReturnMonths < 0 || depositReturnMonths > 240)) {
    return NextResponse.json({ error: 'depositReturnMonths musi byc w zakresie 0-240' }, { status: 400 })
  }

  const saved = await prisma.vendorTerms.upsert({
    where: { vendorId_investment: { vendorId: params.id, investment } },
    create: { vendorId: params.id, investment, depositPct, depositReturnMonths, buildingCostsPct, depositBasis, buildingCostsBasis, notes },
    update: { depositPct, depositReturnMonths, buildingCostsPct, depositBasis, buildingCostsBasis, notes },
  })
  return NextResponse.json(saved)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const investment = new URL(req.url).searchParams.get('investment') ?? ''
  try {
    await prisma.vendorTerms.delete({
      where: { vendorId_investment: { vendorId: params.id, investment } },
    })
  } catch {
    return NextResponse.json({ error: 'Wiersz warunków nie istnieje' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
