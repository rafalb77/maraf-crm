import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'

/**
 * POST /api/budowa/tasks/[id]/odbior — akt odbioru częściowego (moduł Budowa, Etap 2).
 * Zadanie musi być w DO_ODBIORU (zgłoszone przez kierownika z check-inu albo ręcznie).
 *  - PRZYJETY / PRZYJETY_Z_UWAGAMI → ZAKONCZONE (progress 100, actualEnd = dziś)
 *  - ODRZUCONY → wraca do W_TOKU (uwagi w acceptanceNote — kierownik widzi w check-inie)
 * Ślad: acceptedAt / acceptedByEmail / acceptanceResult / acceptanceNote + AuditLog.
 * Powiązany Task-przypomnienie (BUDOWA_ODBIOR) domyka się od razu.
 */
const RESULTS = ['PRZYJETY', 'PRZYJETY_Z_UWAGAMI', 'ODRZUCONY'] as const

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }
  const result = String(body.result || '')
  if (!RESULTS.includes(result as any)) {
    return NextResponse.json({ error: 'Wynik odbioru: PRZYJETY, PRZYJETY_Z_UWAGAMI albo ODRZUCONY' }, { status: 400 })
  }
  const note = body.note ? String(body.note).slice(0, 1000) : null
  if (result === 'ODRZUCONY' && !note) {
    return NextResponse.json({ error: 'Przy odrzuceniu napisz, co jest do poprawy' }, { status: 400 })
  }

  const task = await prisma.constructionTask.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, isMilestone: true, name: true },
  })
  if (!task) return NextResponse.json({ error: 'Zadanie nie istnieje' }, { status: 404 })
  if (task.status !== 'DO_ODBIORU') {
    return NextResponse.json({ error: 'Odbiór możliwy tylko dla zadań w statusie „do odbioru"' }, { status: 400 })
  }

  const accepted = result !== 'ODRZUCONY'
  const now = new Date()
  const updated = await prisma.constructionTask.update({
    where: { id: task.id },
    data: {
      status: accepted ? 'ZAKONCZONE' : 'W_TOKU',
      progress: accepted ? 100 : undefined,
      actualEnd: accepted ? now : null,
      acceptedAt: now,
      acceptedByEmail: session.user.email || null,
      acceptanceResult: result,
      acceptanceNote: note,
    },
    select: { id: true, status: true, progress: true, acceptanceResult: true, acceptedAt: true },
  })

  // Przypomnienie "odbiór czeka" domknij od razu (reconcile i tak by je złapał)
  await prisma.task.updateMany({
    where: { ruleKey: `BUDOWA_ODBIOR:${task.id}`, status: 'OTWARTE' },
    data: { status: accepted ? 'ZROBIONE' : 'ANULOWANE', autoCompleted: true, completedAt: now },
  })

  void audit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: 'UPDATE',
    entity: 'ConstructionTask',
    entityId: task.id,
    metadata: { odbior: result, note },
  })

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    progress: updated.progress,
    acceptanceResult: updated.acceptanceResult,
    acceptedAt: updated.acceptedAt?.toISOString().slice(0, 10) ?? null,
  })
}
