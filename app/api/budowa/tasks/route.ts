import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { parseDateInput } from '@/lib/budowa-task-edit'

/**
 * POST /api/budowa/tasks — ręczne dodanie zadania lub kamienia milowego do harmonogramu
 * (uzupełnianie planu przez Rafała/kierownika obok importu z Excela).
 * Kamień milowy: isMilestone=true → plannedEnd = plannedStart.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 300) : ''
  if (name.length < 2) return NextResponse.json({ error: 'Podaj nazwę zadania' }, { status: 400 })

  const isMilestone = body.isMilestone === true
  const plannedStart = parseDateInput(body.plannedStart)
  if (!plannedStart) return NextResponse.json({ error: 'Nieprawidłowa data początku' }, { status: 400 })
  const plannedEnd = isMilestone ? plannedStart : parseDateInput(body.plannedEnd)
  if (!plannedEnd) return NextResponse.json({ error: 'Nieprawidłowa data końca' }, { status: 400 })
  if (plannedEnd < plannedStart) {
    return NextResponse.json({ error: 'Koniec nie może być przed początkiem' }, { status: 400 })
  }

  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!investment) return NextResponse.json({ error: 'Brak aktywnej inwestycji' }, { status: 400 })

  // Etap opcjonalny — waliduj przynależność do inwestycji
  let stageId: string | null = null
  if (typeof body.stageId === 'string' && body.stageId) {
    const stage = await prisma.constructionStage.findFirst({
      where: { id: body.stageId, investmentId: investment.id },
      select: { id: true },
    })
    if (!stage) return NextResponse.json({ error: 'Nieznany etap' }, { status: 400 })
    stageId = stage.id
  }

  let subcontractorId: string | null = null
  if (typeof body.subcontractorId === 'string' && body.subcontractorId) {
    const sub = await prisma.subcontractor.findUnique({
      where: { id: body.subcontractorId },
      select: { id: true },
    })
    subcontractorId = sub?.id ?? null
  }

  // Nowe pozycje na końcu listy (importy zajmują 1..N)
  const maxOrder = await prisma.constructionTask.aggregate({
    where: { investmentId: investment.id },
    _max: { orderIndex: true },
  })

  const task = await prisma.constructionTask.create({
    data: {
      investmentId: investment.id,
      stageId,
      name,
      isMilestone,
      plannedStart,
      plannedEnd,
      subcontractorId,
      orderIndex: (maxOrder._max.orderIndex ?? 0) + 1,
    },
  })

  void audit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: 'CREATE',
    entity: 'ConstructionTask',
    entityId: task.id,
  })

  // Kształt zgodny z HarmonogramView (daty jako yyyy-mm-dd) — front dokleja do listy
  return NextResponse.json(
    {
      id: task.id,
      number: task.number,
      name: task.name,
      stageId: task.stageId,
      status: task.status,
      progress: task.progress,
      plannedStart: task.plannedStart.toISOString().slice(0, 10),
      plannedEnd: task.plannedEnd.toISOString().slice(0, 10),
      isMilestone: task.isMilestone,
      subcontractorId: task.subcontractorId,
      delayReason: task.delayReason,
    },
    { status: 201 },
  )
}
