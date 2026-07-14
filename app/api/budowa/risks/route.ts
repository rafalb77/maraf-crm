import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'

const KINDS = ['RYZYKO', 'BLOKER']
const SEVERITIES = ['NISKIE', 'SREDNIE', 'WYSOKIE', 'KRYTYCZNE']

/**
 * POST /api/budowa/risks — nowe ryzyko/bloker (moduł Budowa, Etap 4).
 * Permission 'budowa' egzekwuje middleware. Powiązanie z zadaniem opcjonalne.
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

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 300) : ''
  if (title.length < 2) return NextResponse.json({ error: 'Podaj krótki opis ryzyka' }, { status: 400 })
  const kind = KINDS.includes(body.kind) ? body.kind : 'RYZYKO'
  const severity = SEVERITIES.includes(body.severity) ? body.severity : 'SREDNIE'

  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!investment) return NextResponse.json({ error: 'Brak aktywnej inwestycji' }, { status: 400 })

  let taskId: string | null = null
  if (typeof body.taskId === 'string' && body.taskId) {
    const task = await prisma.constructionTask.findFirst({
      where: { id: body.taskId, investmentId: investment.id },
      select: { id: true },
    })
    taskId = task?.id ?? null
  }

  const impactDays =
    body.impactDays !== undefined && body.impactDays !== null && body.impactDays !== ''
      ? Math.max(0, Math.round(Number(body.impactDays)))
      : null

  const risk = await prisma.constructionRisk.create({
    data: {
      investmentId: investment.id,
      taskId,
      kind,
      title,
      description: body.description ? String(body.description).slice(0, 2000) : null,
      severity,
      impactDays: Number.isFinite(impactDays as number) ? impactDays : null,
      mitigation: body.mitigation ? String(body.mitigation).slice(0, 2000) : null,
      createdById: session.user.id || null,
      createdByEmail: session.user.email || null,
    },
    select: { id: true },
  })

  void audit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: 'CREATE',
    entity: 'ConstructionRisk',
    entityId: risk.id,
  })

  return NextResponse.json({ id: risk.id }, { status: 201 })
}
