import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CONTRACT_STAGE_ORDER, type ContractType } from '@/lib/types'

/**
 * PATCH /api/contracts/[id]/stages/[stage] — edycja metadanych etapu:
 * numer aktu notarialnego (repertorium), planowana data podpisania, data
 * podpisania, notatki. NIE wywołuje skutków podpisania (blokada lokali) — to
 * robi osobno PATCH umowy (status PODPISANA dla bieżącego etapu). Tu chodzi o
 * uzupełnienie/korektę danych etapu (np. wpisanie numeru aktu, backfill daty).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; stage: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stage = params.stage as ContractType
  if (!CONTRACT_STAGE_ORDER.includes(stage)) {
    return NextResponse.json({ error: 'Nieznany etap' }, { status: 400 })
  }

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    select: { id: true },
  })
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (body.number !== undefined) data.number = body.number || null
  if (body.notes !== undefined) data.notes = body.notes || null
  if (body.plannedSignDate !== undefined) {
    data.plannedSignDate = body.plannedSignDate ? new Date(body.plannedSignDate) : null
  }
  if (body.signedAt !== undefined) {
    data.signedAt = body.signedAt ? new Date(body.signedAt) : null
  }

  const updated = await prisma.contractStage.upsert({
    where: { contractId_stage: { contractId: params.id, stage } },
    create: { contractId: params.id, stage, ...data },
    update: data,
  })

  return NextResponse.json(updated)
}
