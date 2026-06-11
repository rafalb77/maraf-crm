import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateContractNumber, validateContractUnits } from '@/lib/contracts'
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
    reservationFee,
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

  const number = await generateContractNumber(type as ContractType)

  const contract = await prisma.contract.create({
    data: {
      number,
      type,
      status: 'W_PRZYGOTOWANIU',
      investmentName: investmentName || 'Inwestycja',
      clientId,
      plannedSignDate: plannedSignDate ? new Date(plannedSignDate) : null,
      reservationFee: reservationFee != null && reservationFee !== '' ? parseFloat(reservationFee) : null,
      notes: notes || null,
      contractUnits: {
        create: unitIds.map((unitId: string) => ({ unitId })),
      },
      contractClients: {
        create: (secondaryClientIds as string[])
          .filter((id) => id && id !== clientId)
          .map((id, idx) => ({ clientId: id, position: idx + 2 })),
      },
      history: {
        create: { event: 'UTWORZONO', details: `Umowa ${number} utworzona` },
      },
    },
    include: { client: true, contractUnits: { include: { unit: true } } },
  })

  return NextResponse.json(contract, { status: 201 })
}
