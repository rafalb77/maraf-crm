import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function round(n: number, dp: number) {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}

function computeItemsAndTotals(rawItems: any[]) {
  let subtotalNet = 0
  let subtotalGross = 0
  let totalDiscountNet = 0
  let totalDiscountGross = 0
  let totalNet = 0
  let totalGross = 0

  const itemsToCreate = rawItems.map((it: any, idx: number) => {
    const priceNet = Number(it.priceNet) || 0
    const priceGross = Number(it.priceGross) || 0
    const vatRate = Number(it.vatRate) || 8
    const discountValue = Number(it.discountValue) || 0
    const discountType = it.discountType === 'AMOUNT_NET' ? 'AMOUNT_NET' : 'PCT'
    let discountNet = 0
    if (discountValue > 0) {
      if (discountType === 'PCT') discountNet = priceNet * (discountValue / 100)
      else discountNet = Math.min(discountValue, priceNet)
    }
    const discountGross = discountNet * (1 + vatRate / 100)
    const finalNet = priceNet - discountNet
    const finalGross = priceGross - discountGross

    subtotalNet += priceNet
    subtotalGross += priceGross
    totalDiscountNet += discountNet
    totalDiscountGross += discountGross
    totalNet += finalNet
    totalGross += finalGross

    return {
      position: idx + 1,
      unitId: it.unitId || null,
      label: String(it.label || ''),
      unitType: String(it.unitType || ''),
      area: Number(it.area) || 0,
      pricePerSqmNet: Number(it.pricePerSqmNet) || 0,
      pricePerSqmGross: Number(it.pricePerSqmGross) || 0,
      priceNet: round(priceNet, 2),
      priceGross: round(priceGross, 2),
      vatRate,
      discountType,
      discountValue,
      discountNet: round(discountNet, 2),
      discountGross: round(discountGross, 2),
      finalNet: round(finalNet, 2),
      finalGross: round(finalGross, 2),
    }
  })

  return {
    itemsToCreate,
    totals: {
      subtotalNet: round(subtotalNet, 2),
      subtotalGross: round(subtotalGross, 2),
      totalDiscountNet: round(totalDiscountNet, 2),
      totalDiscountGross: round(totalDiscountGross, 2),
      totalNet: round(totalNet, 2),
      totalGross: round(totalGross, 2),
    },
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.offer.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  if (existing.status === 'ZAAKCEPTOWANA' || existing.status === 'ANULOWANA') {
    return NextResponse.json(
      { error: `Oferta jest ${existing.status.toLowerCase()} — nie można edytować` },
      { status: 409 },
    )
  }

  const body = await req.json()
  const { title, clientId, validUntil, notes, items } = body
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Brak pozycji oferty' }, { status: 400 })
  }

  const { itemsToCreate, totals } = computeItemsAndTotals(items)

  await prisma.$transaction([
    prisma.offerItem.deleteMany({ where: { offerId: id } }),
    prisma.offer.update({
      where: { id },
      data: {
        title: title || null,
        clientId: clientId || null,
        validUntil: validUntil ? new Date(validUntil) : null,
        notes: notes || null,
        ...totals,
        items: { create: itemsToCreate },
      },
    }),
  ])

  return NextResponse.json({ id })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.offer.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  await prisma.offer.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
