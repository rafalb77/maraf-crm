import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateContractNumber, validateContractUnits } from '@/lib/contracts'
import { resolveUnitPricesForClient, computeReservationFee, findClientUnitConflict } from '@/lib/contract-pricing'
import type { ContractType, UnitType } from '@/lib/types'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const type = searchParams.get('type') || ''
  const status = searchParams.get('status') || ''

  const contracts = await prisma.contract.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { number: { contains: search, mode: 'insensitive' } },
                { client: { firstName: { contains: search, mode: 'insensitive' } } },
                { client: { lastName: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {},
        type ? { type } : {},
        status ? { status } : {},
      ],
    },
    include: {
      client: true,
      contractUnits: { include: { unit: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(contracts)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    type,
    clientId,
    secondaryClientIds = [],
    unitIds = [],
    investmentName,
    plannedSignDate,
    notes,
  } = body

  if (!type || !clientId) {
    return NextResponse.json({ error: 'Brak typu umowy lub klienta' }, { status: 400 })
  }

  // Load selected units to validate composition
  const units = await prisma.unit.findMany({ where: { id: { in: unitIds } } })
  if (units.length !== unitIds.length) {
    return NextResponse.json({ error: 'Nie znaleziono wszystkich lokali' }, { status: 400 })
  }

  const validationError = validateContractUnits(
    type as ContractType,
    units.map((u) => ({ type: u.type as UnitType })),
  )
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  // Dedup: ten sam klient + ten sam lokal w aktywnej umowie → blokada.
  const conflict = await findClientUnitConflict(clientId, unitIds)
  if (conflict) {
    return NextResponse.json(
      {
        error: `Klient ma już aktywną umowę ${conflict.number} z lokalem ${conflict.units.join(', ')}. Nie tworzę drugiej — otwórz istniejącą.`,
        conflictContractId: conflict.id,
      },
      { status: 409 },
    )
  }

  // Ceny: z oferty klienta (fallback cena bazowa), z możliwością rabatu z
  // formularza (body.unitPrices = brutto po rabacie). Netto pochodne wg VAT.
  const resolved = await resolveUnitPricesForClient(clientId, unitIds)
  const overrides: Record<string, number> =
    body.unitPrices && typeof body.unitPrices === 'object' ? body.unitPrices : {}
  const unitById = new Map(units.map((u) => [u.id, u]))
  let totalNet = 0
  let totalGross = 0
  const contractUnitsData = (unitIds as string[]).map((unitId) => {
    const u = unitById.get(unitId)!
    const base = resolved.get(unitId) ?? { priceNet: u.priceNet, priceGross: u.priceGross }
    const ovr = Number(overrides[unitId])
    const priceGross = Number.isFinite(ovr) && ovr > 0 ? ovr : base.priceGross
    const vat = (u.vatRate ?? 8) / 100
    const priceNet = Math.round((priceGross / (1 + vat)) * 100) / 100
    totalNet += priceNet
    totalGross += priceGross
    return { unitId, priceNet, priceGross }
  })

  const reservationFee = computeReservationFee(totalGross)
  const reservationFeeDays =
    Number.isFinite(Number(body.reservationFeeDays)) && Number(body.reservationFeeDays) >= 1
      ? Math.round(Number(body.reservationFeeDays))
      : 7

  const number = await generateContractNumber(type as ContractType)

  const contract = await prisma.contract.create({
    data: {
      number,
      type,
      status: 'W_PRZYGOTOWANIU',
      investmentName: investmentName || 'Inwestycja',
      clientId,
      plannedSignDate: plannedSignDate ? new Date(plannedSignDate) : null,
      reservationFee,
      reservationFeeDays,
      valueNet: Math.round(totalNet * 100) / 100,
      valueGross: Math.round(totalGross * 100) / 100,
      notes: notes || null,
      contractUnits: {
        create: contractUnitsData,
      },
      contractClients: {
        create: (secondaryClientIds as string[])
          .filter((id) => id && id !== clientId)
          .map((id, idx) => ({ clientId: id, position: idx + 2 })),
      },
      stages: {
        create: { stage: type, status: 'W_PRZYGOTOWANIU' },
      },
      history: {
        create: { event: 'UTWORZONO', details: `Umowa ${number} utworzona (etap: ${type})` },
      },
    },
    include: { client: true, contractUnits: { include: { unit: true } } },
  })

  return NextResponse.json(contract, { status: 201 })
}
