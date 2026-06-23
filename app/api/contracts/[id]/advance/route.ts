import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nextContractStage, CONTRACT_TYPE_LABELS } from '@/lib/types'
import { unitStateForStage } from '@/lib/contracts'
import type { ContractType } from '@/lib/types'

/**
 * POST /api/contracts/[id]/advance — przesuwa deal do kolejnego etapu
 * (REZERWACYJNA → DEWELOPERSKA → PRZENIESIENIA). `Contract.type` = bieżący etap.
 *
 * Czynność techniczna: zmienia bieżący etap, dokłada wpis do osi etapów i
 * resetuje status/signedAt (nowy etap jest jeszcze niepodpisany). Lokale,
 * klient, współkupujący i harmonogram wpłat zostają bez zmian — to ten sam deal.
 * Datę podpisania poprzedniego etapu trzyma jego wpis w ContractStage.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    select: { id: true, type: true },
  })
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })

  const next = nextContractStage(contract.type as ContractType)
  if (!next) {
    return NextResponse.json(
      { error: 'Umowa jest już na ostatnim etapie (przeniesienie własności).' },
      { status: 400 },
    )
  }

  const updated = await prisma.contract.update({
    where: { id: params.id },
    data: {
      type: next,
      status: 'W_PRZYGOTOWANIU',
      signedAt: null,
      stages: {
        upsert: {
          where: { contractId_stage: { contractId: params.id, stage: next } },
          create: { stage: next, status: 'W_PRZYGOTOWANIU' },
          update: {},
        },
      },
      history: {
        create: {
          event: 'ZMIANA_ETAPU',
          details: `${CONTRACT_TYPE_LABELS[contract.type as ContractType]} → ${CONTRACT_TYPE_LABELS[next]}`,
        },
      },
    },
    include: {
      client: true,
      contractUnits: { include: { unit: true } },
      stages: { orderBy: { createdAt: 'asc' } },
    },
  })

  // Wejście na etap deweloperski/przeniesienia = wiążąca sprzedaż → lokale SPRZEDANY.
  const unitIds = updated.contractUnits.map((cu) => cu.unitId)
  if (unitIds.length) {
    await prisma.unit.updateMany({
      where: { id: { in: unitIds } },
      data: unitStateForStage(next, updated.clientId),
    })
  }

  return NextResponse.json(updated)
}
