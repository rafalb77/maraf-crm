import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { expireSoftReservations } from '@/lib/reservations'
import { recordPriceHistory } from '@/lib/price-history'
import { unitTotalsPerSqm, round2 } from '@/lib/unit-pricing'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await expireSoftReservations()

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const type = searchParams.get('type') || ''
  const status = searchParams.get('status') || ''

  const units = await prisma.unit.findMany({
    where: {
      AND: [
        search ? { number: { contains: search, mode: 'insensitive' } } : {},
        type ? { type } : {},
        status ? { status } : {},
      ],
    },
    include: {
      clientUnits: { include: { client: true } },
      _count: { select: { serviceRequests: true } },
    },
    orderBy: { number: 'asc' },
  })

  return NextResponse.json(units)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const area = parseFloat(body.area) || 0
  const ppmNet = parseFloat(body.pricePerSqmNet) || 0
  const ppmGross = parseFloat(body.pricePerSqmGross) || 0
  const usePerSqm = ppmNet > 0 || ppmGross > 0
  const vatRate = parseInt(body.vatRate) || 8
  // Ceny całkowite: brutto = netto × (1+VAT) — lib/unit-pricing.ts (wspólne z PUT).
  const totals = usePerSqm ? unitTotalsPerSqm(area, ppmNet, ppmGross, vatRate) : null
  const priceNet = totals ? totals.priceNet : round2(parseFloat(body.priceNet) || 0)
  const priceGross = totals ? totals.priceGross : round2(parseFloat(body.priceGross) || 0)
  // Promo prices — patrz [id]/route.ts dla pełnego kontekstu (mirror logic).
  const promoPpmNet = parseFloat(body.promoPricePerSqmNet)
  const promoPpmGross = parseFloat(body.promoPricePerSqmGross)
  const promoPriceNetRaw = parseFloat(body.promoPriceNet)
  const promoPriceGrossRaw = parseFloat(body.promoPriceGross)
  const promoTotals =
    usePerSqm && (!isNaN(promoPpmNet) || !isNaN(promoPpmGross))
      ? unitTotalsPerSqm(area, isNaN(promoPpmNet) ? 0 : promoPpmNet, isNaN(promoPpmGross) ? 0 : promoPpmGross, vatRate)
      : null
  const promoPriceNet = usePerSqm
    ? (promoTotals ? promoTotals.priceNet : null)
    : (isNaN(promoPriceNetRaw) ? null : round2(promoPriceNetRaw))
  const promoPriceGross = usePerSqm
    ? (promoTotals ? promoTotals.priceGross : null)
    : (isNaN(promoPriceGrossRaw) ? null : round2(promoPriceGrossRaw))
  // Data sprzedaży — tylko gdy status SPRZEDANY i data poprawna.
  let soldAt: Date | null = null
  if (body.status === 'SPRZEDANY' && body.soldAt) {
    const d = new Date(body.soldAt)
    if (!isNaN(d.getTime())) soldAt = d
  }
  const unit = await prisma.unit.create({
    data: {
      number: body.number,
      type: body.type,
      area,
      pricePerSqmNet: ppmNet,
      pricePerSqmGross: ppmGross,
      priceNet,
      priceGross,
      vatRate: parseInt(body.vatRate) || 8,
      floor: body.floor !== undefined && body.floor !== '' ? parseInt(body.floor) : null,
      rooms: body.rooms !== undefined && body.rooms !== '' ? parseInt(body.rooms) : null,
      building: body.building || null,
      description: body.description || null,
      status: body.status || 'WOLNY',
      soldAt,
      // Pola integracji 3D Estate (defaulty: visibleOnMatrix=true, promoActive=false)
      visibleOnMatrix: body.visibleOnMatrix !== undefined ? !!body.visibleOnMatrix : undefined,
      promoActive: body.promoActive !== undefined ? !!body.promoActive : undefined,
      promoPricePerSqmNet: isNaN(promoPpmNet) ? null : promoPpmNet,
      promoPricePerSqmGross: isNaN(promoPpmGross) ? null : promoPpmGross,
      promoPriceNet,
      promoPriceGross,
    },
  })

  // Log początkowy do PriceHistory — źródło „Daty od której obowiązuje oferta" w raporcie dane.gov.pl.
  await recordPriceHistory(unit.id, {
    pricePerSqmNet: unit.pricePerSqmNet,
    pricePerSqmGross: unit.pricePerSqmGross,
    priceNet: unit.priceNet,
    priceGross: unit.priceGross,
    status: unit.status,
  })

  return NextResponse.json(unit, { status: 201 })
}
