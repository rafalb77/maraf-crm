import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeBucket, computeTaskScore, maybeGenerateTasks } from '@/lib/tasks'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tasks — lista otwartych zadań do widgetu „Do zrobienia" na pulpicie.
 * Przy okazji odpala silnik reguł (throttling 10 min) — widget działa nawet
 * bez skonfigurowanego crona w Coolify. Zwraca zadania posortowane wg
 * priorytetu (scoring w lib/tasks.ts) + statystyki do paska postępu.
 * Zadania w drzemce (snoozedUntil w przyszłości) są pomijane.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await maybeGenerateTasks()

  const now = new Date()
  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)

  const [open, doneToday] = await Promise.all([
    prisma.task.findMany({
      where: {
        status: 'OTWARTE',
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true } },
        unit: { select: { id: true, number: true, priceGross: true } },
        contract: { select: { id: true, number: true, valueGross: true } },
        payment: { select: { id: true, title: true, plannedAmount: true, plannedDate: true } },
        case: { select: { id: true, number: true } },
        assignee: { select: { id: true, name: true, preferredName: true } },
      },
    }),
    prisma.task.count({
      where: { status: 'ZROBIONE', autoCompleted: false, completedAt: { gte: startToday } },
    }),
  ])

  const tasks = open
    .map((t) => ({
      ...t,
      score: computeTaskScore(t, now),
      bucket: computeBucket(t.dueAt, now),
    }))
    .sort((a, b) => b.score - a.score)

  const overdueCount = tasks.filter((t) => t.bucket === 'PRZETERMINOWANE').length
  const todayCount = tasks.filter((t) => t.bucket === 'DZIS').length

  return NextResponse.json({
    tasks,
    currentUserId: (session.user as any)?.id || null,
    stats: {
      openCount: tasks.length,
      overdueCount,
      todayCount,
      doneToday,
    },
  })
}

/**
 * POST /api/tasks — ręczne zadanie z szybkiego dodawania w widgecie.
 * Body: { title, type?, dueAt?, description?, clientId? }.
 * Bez dueAt zadanie ląduje „na dziś" (koniec dnia) — trafia do właściwej sekcji.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'Tytuł zadania jest wymagany' }, { status: 400 })

  let dueAt: Date
  if (body.dueAt) {
    dueAt = new Date(body.dueAt)
    if (isNaN(dueAt.getTime())) {
      return NextResponse.json({ error: 'Nieprawidłowa data terminu' }, { status: 400 })
    }
  } else {
    dueAt = new Date()
    dueAt.setHours(23, 59, 0, 0)
  }

  const task = await prisma.task.create({
    data: {
      title: title.slice(0, 300),
      description: typeof body.description === 'string' ? body.description.slice(0, 2000) : null,
      type: typeof body.type === 'string' ? body.type : 'INNE',
      dueAt,
      clientId: typeof body.clientId === 'string' ? body.clientId : null,
      source: 'MANUAL',
      createdById: session.user.id || null,
    },
  })

  return NextResponse.json(task, { status: 201 })
}
