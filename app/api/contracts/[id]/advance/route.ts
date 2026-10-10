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
 * Body: { signedAt: 'RRRR-MM-DD' (wymagane), number?: string, nextPlannedSignDate?: 'RRRR-MM-DD' }
 *
 * Przejście dalej = kończony etap został PODPISANY. Od 10.10.2026 endpoint
 * wymaga daty podpisania kończonego etapu (wcześniej etap zostawał „bez daty
 * podpisania", a umowa deweloperska bez daty nie trafiała np. do zestawienia
 * dla banku) i zapisuje ją w osi etapów z numerem aktu, ze skutkami podpisania
 * jak „Oznacz jako podpisaną" (status klienta → UMOWA). Potem: nowy etap
 * W_PRZYGOTOWANIU, lokale wg nowego etapu (deweloperska/przeniesienia →
 * SPRZEDANY). Lokale, klient, współkupujący i harmonogram wpłat zostają — to
 * ten sam deal.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      type: true,
      status: true,
      clientId: true,
      contractUnits: { select: { unitId: true } },
      contractClients: { select: { clientId: true } },
      stages: { select: { stage: true, status: true, signedAt: true, number: true } },
    },
  })
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })
  if (contract.status === 'ROZWIAZANA' || contract.status === 'ANULOWANA') {
    return NextResponse.json({ error: 'Umowa rozwiązana/anulowana — nie można zmieniać etapu.' }, { status: 400 })
  }

  const current = contract.type as ContractType
  const next = nextContractStage(current)
  if (!next) {
    return NextResponse.json(
      { error: 'Umowa jest już na ostatnim etapie (przeniesienie własności).' },
      { status: 400 },
    )
  }

  // --- data podpisania kończonego etapu (wymagana) ---
  const signedAtRaw = typeof body.signedAt === 'string' ? body.signedAt.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signedAtRaw)) {
    return NextResponse.json(
      { error: `Podaj datę podpisania etapu „${CONTRACT_TYPE_LABELS[current]}” — przejście dalej oznacza, że ten etap został podpisany.` },
      { status: 400 },
    )
  }
  const signedAt = new Date(signedAtRaw)
  if (isNaN(signedAt.getTime())) return NextResponse.json({ error: 'Nieprawidłowa data podpisania' }, { status: 400 })
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
  if (signedAt > tomorrow) {
    return NextResponse.json({ error: 'Data podpisania nie może być z przyszłości.' }, { status: 400 })
  }
  const actNumber: string | null | undefined =
    body.number === undefined ? undefined : typeof body.number === 'string' && body.number.trim() ? body.number.trim() : null
  let nextPlanned: Date | null = null
  if (body.nextPlannedSignDate) {
    nextPlanned = new Date(String(body.nextPlannedSignDate))
    if (isNaN(nextPlanned.getTime())) return NextResponse.json({ error: 'Nieprawidłowa planowana data podpisania' }, { status: 400 })
  }

  const currentRow = contract.stages.find((s) => s.stage === current)
  const wasSigned = currentRow?.status === 'PODPISANA' && !!currentRow.signedAt
  const datePl = (d: Date) => d.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' })
  const signedPl = datePl(signedAt)
  const act = actNumber ?? currentRow?.number ?? null

  const updated = await prisma.$transaction(async (tx) => {
    // 1. Kończony etap = podpisany (data + numer aktu).
    await tx.contractStage.upsert({
      where: { contractId_stage: { contractId: contract.id, stage: current } },
      create: { contractId: contract.id, stage: current, status: 'PODPISANA', signedAt, number: actNumber ?? null },
      update: { status: 'PODPISANA', signedAt, ...(actNumber !== undefined ? { number: actNumber } : {}) },
    })

    // 2. Podpisanie podnosi status klientów (jak „Oznacz jako podpisaną”); nie cofa dalszych.
    const clientIds = Array.from(new Set([contract.clientId, ...contract.contractClients.map((cc) => cc.clientId)]))
    await tx.client.updateMany({
      where: { id: { in: clientIds }, status: { in: ['ZAPYTANIE', 'OFERTA', 'REZERWACJA'] } },
      data: { status: 'UMOWA' },
    })

    // 3. Nowy etap bieżący (jeszcze niepodpisany) + wpis w historii.
    return tx.contract.update({
      where: { id: contract.id },
      data: {
        type: next,
        status: 'W_PRZYGOTOWANIU',
        signedAt: null,
        plannedSignDate: nextPlanned,
        stages: {
          upsert: {
            where: { contractId_stage: { contractId: contract.id, stage: next } },
            create: { stage: next, status: 'W_PRZYGOTOWANIU', plannedSignDate: nextPlanned },
            update: nextPlanned ? { plannedSignDate: nextPlanned } : {},
          },
        },
        history: {
          create: {
            event: 'ZMIANA_ETAPU',
            details:
              `${CONTRACT_TYPE_LABELS[current]} (${wasSigned ? 'podpisana' : 'podpisana przy przejściu'} ${signedPl}${act ? `, akt ${act}` : ''})` +
              ` → ${CONTRACT_TYPE_LABELS[next]}${nextPlanned ? ` (planowane podpisanie ${datePl(nextPlanned)})` : ''}`,
          },
        },
      },
      include: {
        client: true,
        contractUnits: { include: { unit: true } },
        stages: { orderBy: { createdAt: 'asc' } },
      },
    })
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
