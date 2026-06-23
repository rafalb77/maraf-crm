import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { prevContractStage, CONTRACT_TYPE_LABELS } from '@/lib/types'
import { unitStateForStage } from '@/lib/contracts'
import type { ContractType } from '@/lib/types'

/**
 * POST /api/contracts/[id]/revert — cofa deal o jeden etap (na wszelki wypadek,
 * np. pomyłkowe przejście). Odwrotność /advance.
 *
 * - Przywraca Contract.type/status/signedAt do stanu poprzedniego etapu
 *   (z jego wpisu w ContractStage).
 * - Wpis etapu, który opuszczamy, USUWAMY tylko gdy był niepodpisany (czysty
 *   placeholder po przejściu). Jeśli zdążył być podpisany — zostawiamy go
 *   (nie chcemy po cichu skasować realnej daty/aktu).
 * - Lokali nie rusza (zmiana etapu w przód też ich nie ruszała).
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      type: true,
      clientId: true,
      contractUnits: { select: { unitId: true } },
      stages: { select: { id: true, stage: true, status: true, signedAt: true } },
    },
  })
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })

  const current = contract.type as ContractType
  const prev = prevContractStage(current)
  if (!prev) {
    return NextResponse.json(
      { error: 'Umowa jest na pierwszym etapie (rezerwacyjna) — nie ma czego cofać.' },
      { status: 400 },
    )
  }

  const currentRow = contract.stages.find((s) => s.stage === current)
  const prevRow = contract.stages.find((s) => s.stage === prev)

  await prisma.$transaction([
    // Usuń opuszczany etap tylko gdy niepodpisany (placeholder po /advance).
    ...(currentRow && !currentRow.signedAt
      ? [prisma.contractStage.delete({ where: { id: currentRow.id } })]
      : []),
    prisma.contract.update({
      where: { id: params.id },
      data: {
        type: prev,
        status: prevRow?.status ?? 'W_PRZYGOTOWANIU',
        signedAt: prevRow?.signedAt ?? null,
        history: {
          create: {
            event: 'ZMIANA_ETAPU',
            details: `Cofnięto etap: ${CONTRACT_TYPE_LABELS[current]} → ${CONTRACT_TYPE_LABELS[prev]}`,
          },
        },
      },
    }),
  ])

  // Cofnięcie do rezerwacyjnej cofa „sprzedaż" lokali → twarda rezerwacja.
  // (Cofnięcie do deweloperskiej zostawia SPRZEDANY — deweloperska też sprzedaje.)
  if (prev === 'REZERWACYJNA') {
    const unitIds = contract.contractUnits.map((cu) => cu.unitId)
    if (unitIds.length) {
      await prisma.unit.updateMany({
        where: { id: { in: unitIds } },
        data: unitStateForStage('REZERWACYJNA', contract.clientId),
      })
    }
  }

  return NextResponse.json({ success: true, stage: prev })
}
