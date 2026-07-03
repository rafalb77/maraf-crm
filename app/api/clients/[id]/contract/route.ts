import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateContractNumber, validateContractUnits } from '@/lib/contracts'
import { resolveUnitPricesForClient, computeReservationFee, findClientUnitConflict } from '@/lib/contract-pricing'
import type { ContractType, UnitType } from '@/lib/types'

/**
 * POST /api/clients/[id]/contract — przekształca rezerwację klienta w umowę.
 *
 * Tworzy jeden deal (Contract) przenosząc klienta i WSZYSTKIE jego przypisane
 * lokale (ClientUnit) do umowy — bez ręcznego przepisywania. Deal startuje od
 * wybranego etapu (domyślnie REZERWACYJNA; może też od razu DEWELOPERSKA).
 * Sam Contract.number to nasz numer umowy; numery aktów notarialnych dokłada
 * się później per-etap.
 *
 * Body: { type?, reservationEndDate?, reservationFeeDays?, investmentName?, notes? }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const startStage = (body.type || 'REZERWACYJNA') as ContractType

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 })

  // Lokale przypisane do klienta (rezerwacja) → składniki umowy.
  const clientUnits = await prisma.clientUnit.findMany({
    where: { clientId: params.id },
    include: { unit: { select: { id: true, type: true, vatRate: true, priceNet: true, priceGross: true } } },
  })
  const unitIds = clientUnits.map((cu) => cu.unitId)
  if (unitIds.length === 0) {
    return NextResponse.json(
      { error: 'Klient nie ma przypisanych lokali — nie ma czego przenieść do umowy.' },
      { status: 400 },
    )
  }

  const validationError = validateContractUnits(
    startStage,
    clientUnits.map((cu) => ({ type: cu.unit.type as UnitType })),
  )
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  // Dedup: klient już ma aktywną umowę z którymś z tych lokali?
  const conflict = await findClientUnitConflict(params.id, unitIds)
  if (conflict) {
    return NextResponse.json(
      {
        error: `Klient ma już aktywną umowę ${conflict.number} z lokalem ${conflict.units.join(', ')}. Otwórz istniejącą zamiast tworzyć nową.`,
        conflictContractId: conflict.id,
      },
      { status: 409 },
    )
  }

  // Ceny z oferty klienta (fallback bazowa) → snapshot na umowie + opłata 1%.
  const resolved = await resolveUnitPricesForClient(params.id, unitIds)
  const unitById = new Map(clientUnits.map((cu) => [cu.unit.id, cu.unit]))
  let totalNet = 0
  let totalGross = 0
  const contractUnitsData = unitIds.map((unitId) => {
    const u = unitById.get(unitId)!
    const base = resolved.get(unitId) ?? { priceNet: u.priceNet, priceGross: u.priceGross }
    totalNet += base.priceNet
    totalGross += base.priceGross
    return { unitId, priceNet: base.priceNet, priceGross: base.priceGross }
  })
  const reservationFee = computeReservationFee(totalGross)
  const reservationFeeDays =
    Number.isFinite(Number(body.reservationFeeDays)) && Number(body.reservationFeeDays) >= 1
      ? Math.round(Number(body.reservationFeeDays))
      : 7

  const number = await generateContractNumber(startStage)

  const contract = await prisma.contract.create({
    data: {
      number,
      type: startStage,
      status: 'W_PRZYGOTOWANIU',
      investmentName: body.investmentName || 'Inwestycja',
      clientId: params.id,
      plannedSignDate: body.plannedSignDate ? new Date(body.plannedSignDate) : null,
      reservationEndDate: body.reservationEndDate ? new Date(body.reservationEndDate) : null,
      reservationFee,
      reservationFeeDays,
      valueNet: Math.round(totalNet * 100) / 100,
      valueGross: Math.round(totalGross * 100) / 100,
      notes: body.notes || null,
      contractUnits: { create: contractUnitsData },
      stages: { create: { stage: startStage, status: 'W_PRZYGOTOWANIU' } },
      history: {
        create: {
          event: 'UTWORZONO',
          details: `Umowa ${number} utworzona z rezerwacji klienta (etap: ${startStage})`,
        },
      },
    },
    include: { client: true, contractUnits: { include: { unit: true } } },
  })

  return NextResponse.json(contract, { status: 201 })
}
