import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordPriceHistoryIfChanged } from '@/lib/price-history'
import { unitTotalsPerSqm, round2 } from '@/lib/unit-pricing'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unit = await prisma.unit.findUnique({
    where: { id: params.id },
    include: {
      clientUnits: { include: { client: true } },
      serviceRequests: { include: { client: true }, orderBy: { createdAt: 'desc' } },
    },
  })

  if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(unit)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const area = parseFloat(body.area) || 0
  const ppmNet = parseFloat(body.pricePerSqmNet) || 0
  const ppmGross = parseFloat(body.pricePerSqmGross) || 0
  const usePerSqm = ppmNet > 0 || ppmGross > 0
  const vatRate = parseInt(body.vatRate) || 8
  // Ceny całkowite: brutto = netto × (1+VAT), nie powierzchnia × zaokrąglona
  // stawka brutto (lib/unit-pricing.ts — wspólne z formularzem i POST).
  const totals = usePerSqm ? unitTotalsPerSqm(area, ppmNet, ppmGross, vatRate) : null
  const priceNet = totals ? totals.priceNet : round2(parseFloat(body.priceNet) || 0)
  const priceGross = totals ? totals.priceGross : round2(parseFloat(body.priceGross) || 0)
  // Promo prices — mirror tej samej logiki per-sqm vs ryczalt.
  // Wartości promo zapisujemy zawsze (nie tylko gdy promoActive=true) — żeby
  // zachować wpisane wartości po odznaczeniu/zaznaczeniu checkboxa "Promocja aktywna".
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

  // Data sprzedaży — przechowywana tylko dla statusu SPRZEDANY; zmiana statusu
  // na inny czyści pole. Niepoprawna data → null.
  let soldAt: Date | null = null
  if (body.status === 'SPRZEDANY' && body.soldAt) {
    const d = new Date(body.soldAt)
    if (!isNaN(d.getTime())) soldAt = d
  }

  // Stan PRZED update — do porównania w recordPriceHistoryIfChanged (źródło
  // „Daty od której obowiązuje oferta" w raporcie dane.gov.pl).
  const before = await prisma.unit.findUnique({
    where: { id: params.id },
    select: { pricePerSqmNet: true, pricePerSqmGross: true, priceNet: true, priceGross: true, status: true },
  })

  const unit = await prisma.unit.update({
    where: { id: params.id },
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
      status: body.status,
      soldAt,
      floorPlanUrl: body.floorPlanUrl !== undefined ? body.floorPlanUrl : undefined,
      // Pola integracji 3D Estate
      visibleOnMatrix: body.visibleOnMatrix !== undefined ? !!body.visibleOnMatrix : undefined,
      promoActive: body.promoActive !== undefined ? !!body.promoActive : undefined,
      promoPricePerSqmNet: isNaN(promoPpmNet) ? null : promoPpmNet,
      promoPricePerSqmGross: isNaN(promoPpmGross) ? null : promoPpmGross,
      promoPriceNet,
      promoPriceGross,
    },
  })

  if (before) {
    await recordPriceHistoryIfChanged(unit.id, before, {
      pricePerSqmNet: unit.pricePerSqmNet,
      pricePerSqmGross: unit.pricePerSqmGross,
      priceNet: unit.priceNet,
      priceGross: unit.priceGross,
      status: unit.status,
    })
  }

  return NextResponse.json(unit)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.unit.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
