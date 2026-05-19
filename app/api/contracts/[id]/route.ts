import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { ContractStatus } from '@/lib/types'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      contractUnits: { include: { unit: true } },
      attachments: true,
      history: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(contract)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { contractUnits: true },
  })
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: any = {}
  const historyEvents: { event: string; details?: string }[] = []

  // form field usunięty z Contract — nieużywany w szablonie DOCX, mylący w UI.
  // discount/valueNet/valueGross zostają w schemie (auto-set przy konwersji
  // oferty), ale nie są już edytowalne przez to API — usunięte z formularza.
  // reservationFee ZOSTAJE (kluczowy placeholder w szablonie umowy).
  const editableStringFields = ['notes', 'investmentName']
  for (const f of editableStringFields) {
    if (body[f] !== undefined) data[f] = body[f] || null
  }
  if (body.reservationFee !== undefined) {
    data.reservationFee =
      body.reservationFee === '' || body.reservationFee == null
        ? null
        : parseFloat(body.reservationFee)
  }
  if (body.plannedSignDate !== undefined) {
    data.plannedSignDate = body.plannedSignDate ? new Date(body.plannedSignDate) : null
  }

  // Status change handling with side effects
  if (body.status && body.status !== contract.status) {
    const newStatus = body.status as ContractStatus
    data.status = newStatus
    historyEvents.push({
      event: 'ZMIANA_STATUSU',
      details: `${contract.status} → ${newStatus}`,
    })

    if (newStatus === 'PODPISANA') {
      data.signedAt = body.signedAt ? new Date(body.signedAt) : new Date()

      // Hard-lock reserved units
      const unitIds = contract.contractUnits.map((cu) => cu.unitId)
      if (contract.type === 'REZERWACYJNA' || contract.type === 'DEWELOPERSKA') {
        await prisma.unit.updateMany({
          where: { id: { in: unitIds } },
          data: {
            status: 'ZAREZERWOWANY',
            reservationType: 'REZERWACJA',
            reservationExpiresAt: null,
            reservedById: contract.clientId,
          },
        })
      } else if (contract.type === 'PRZENIESIENIA') {
        await prisma.unit.updateMany({
          where: { id: { in: unitIds } },
          data: {
            status: 'SPRZEDANY',
            reservationType: null,
            reservationExpiresAt: null,
            reservedById: null,
          },
        })
      }
    } else if (newStatus === 'ROZWIAZANA' || newStatus === 'ANULOWANA') {
      // Release units
      const unitIds = contract.contractUnits.map((cu) => cu.unitId)
      await prisma.unit.updateMany({
        where: { id: { in: unitIds } },
        data: {
          status: 'WOLNY',
          reservationType: null,
          reservationExpiresAt: null,
          reservedById: null,
        },
      })
      await prisma.clientUnit.deleteMany({ where: { unitId: { in: unitIds } } })
    }
  } else if (body.signedAt !== undefined) {
    data.signedAt = body.signedAt ? new Date(body.signedAt) : null
  }

  const updated = await prisma.contract.update({
    where: { id: params.id },
    data: {
      ...data,
      ...(historyEvents.length
        ? { history: { create: historyEvents } }
        : {}),
    },
    include: {
      client: true,
      contractUnits: { include: { unit: true } },
      attachments: true,
      history: { orderBy: { createdAt: 'desc' } },
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { contractUnits: true },
  })
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Release units on delete
  const unitIds = contract.contractUnits.map((cu) => cu.unitId)
  if (unitIds.length) {
    await prisma.unit.updateMany({
      where: { id: { in: unitIds }, reservationType: 'REZERWACJA' },
      data: {
        status: 'WOLNY',
        reservationType: null,
        reservationExpiresAt: null,
        reservedById: null,
      },
    })
  }

  await prisma.contract.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
