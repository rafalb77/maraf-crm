import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unitStateForStage } from '@/lib/contracts'
import { findClientUnitConflict } from '@/lib/contract-pricing'
import type { ContractType } from '@/lib/types'

/**
 * POST /api/contracts/[id]/annex — aneks do PODPISANEJ umowy: dokłada
 * składnik(i) (garaż / miejsce postojowe / komórka) BEZ ruszania dotychczasowych
 * lokali ani ich cen. Tworzy ContractAnnex, spina z nim nowe ContractUnit
 * (annexId), ustawia lokale wg etapu umowy (deweloperska → SPRZEDANY), zwiększa
 * wartość umowy o wartość dołożonych lokali. Nie zmienia opłaty rezerwacyjnej.
 *
 * Body: { number?, signedAt?, notes?, units: [{ unitId, priceGross }] }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    select: {
      id: true, type: true, status: true, clientId: true,
      valueNet: true, valueGross: true,
      contractUnits: { select: { unitId: true } },
    },
  })
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })
  if (contract.status !== 'PODPISANA') {
    return NextResponse.json({ error: 'Aneks można dodać tylko do PODPISANEJ umowy.' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const rawUnits: { unitId?: string; priceGross?: unknown }[] = Array.isArray(body.units) ? body.units : []
  const wanted = new Map<string, number>()
  for (const r of rawUnits) {
    if (!r.unitId) continue
    const g = Number(r.priceGross)
    wanted.set(r.unitId, Number.isFinite(g) && g >= 0 ? g : NaN)
  }
  const unitIds = [...wanted.keys()]
  if (unitIds.length === 0) {
    return NextResponse.json({ error: 'Aneks musi dołożyć co najmniej jeden lokal.' }, { status: 400 })
  }
  for (const g of wanted.values()) {
    if (!Number.isFinite(g)) return NextResponse.json({ error: 'Niepoprawna cena lokalu.' }, { status: 400 })
  }

  // Lokal już na tej umowie? (aneks tylko DODAJE nowe składniki)
  if (unitIds.some((id) => contract.contractUnits.some((cu) => cu.unitId === id))) {
    return NextResponse.json({ error: 'Któryś z lokali jest już składnikiem tej umowy.' }, { status: 409 })
  }

  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds } },
    select: { id: true, status: true, vatRate: true, priceGross: true, reservationType: true, reservedById: true },
  })
  if (units.length !== unitIds.length) {
    return NextResponse.json({ error: 'Nie znaleziono wszystkich lokali' }, { status: 400 })
  }

  // Dostępność dokładanych lokali.
  const blocked = units.find(
    (u) =>
      u.status === 'SPRZEDANY' ||
      u.status === 'NIEDOSTEPNY' ||
      (u.reservationType === 'REZERWACJA' && u.reservedById != null && u.reservedById !== contract.clientId),
  )
  if (blocked) {
    return NextResponse.json(
      { error: 'Któryś z lokali jest niedostępny (sprzedany lub zarezerwowany przez innego klienta).' },
      { status: 409 },
    )
  }

  // Dedup: lokal nie może być w INNEJ aktywnej umowie tego klienta.
  const conflict = await findClientUnitConflict(contract.clientId, unitIds, contract.id)
  if (conflict) {
    return NextResponse.json(
      { error: `Lokal ${conflict.units.join(', ')} jest już w aktywnej umowie ${conflict.number} tego klienta.` },
      { status: 409 },
    )
  }

  let deltaNet = 0
  let deltaGross = 0
  const unitById = new Map(units.map((u) => [u.id, u]))
  const unitData = unitIds.map((unitId) => {
    const u = unitById.get(unitId)!
    const priceGross = Math.round(wanted.get(unitId)! * 100) / 100
    const vat = (u.vatRate ?? 8) / 100
    const priceNet = Math.round((priceGross / (1 + vat)) * 100) / 100
    deltaNet += priceNet
    deltaGross += priceGross
    return { unitId, priceNet, priceGross }
  })
  deltaNet = Math.round(deltaNet * 100) / 100
  deltaGross = Math.round(deltaGross * 100) / 100

  const state = unitStateForStage(contract.type as ContractType, contract.clientId)
  const signedAt = body.signedAt ? new Date(body.signedAt) : null

  const annex = await prisma.$transaction(async (tx) => {
    const a = await tx.contractAnnex.create({
      data: {
        contractId: contract.id,
        number: body.number || null,
        signedAt,
        notes: body.notes || null,
        valueNetDelta: deltaNet,
        valueGrossDelta: deltaGross,
      },
    })
    for (const d of unitData) {
      await tx.contractUnit.create({
        data: { contractId: contract.id, unitId: d.unitId, priceNet: d.priceNet, priceGross: d.priceGross, annexId: a.id },
      })
    }
    await tx.unit.updateMany({ where: { id: { in: unitIds } }, data: state })
    await tx.contract.update({
      where: { id: contract.id },
      data: {
        valueNet: Math.round(((contract.valueNet ?? 0) + deltaNet) * 100) / 100,
        valueGross: Math.round(((contract.valueGross ?? 0) + deltaGross) * 100) / 100,
        history: {
          create: {
            event: 'ANEKS',
            details: `Aneks${body.number ? ' ' + body.number : ''}: +${unitData.length} lok., +${deltaGross.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`,
          },
        },
      },
    })
    return a
  })

  return NextResponse.json({ id: annex.id }, { status: 201 })
}
