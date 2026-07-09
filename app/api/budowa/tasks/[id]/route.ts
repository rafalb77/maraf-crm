import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { buildTaskEdit } from '@/lib/budowa-task-edit'

/**
 * PATCH /api/budowa/tasks/[id] — edycja zadania harmonogramu (terminy/postęp/status/
 * nazwa/wykonawca). Rdzeń „prostej aktualizacji terminów po imporcie". Permission 'budowa'.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }

  const { data, error } = buildTaskEdit(body)
  if (error || !data) return NextResponse.json({ error: error || 'Brak danych' }, { status: 400 })

  const existing = await prisma.constructionTask.findUnique({
    where: { id: params.id },
    select: { id: true, plannedStart: true, plannedEnd: true, status: true },
  })
  if (!existing) return NextResponse.json({ error: 'Zadanie nie istnieje' }, { status: 404 })

  // Spójność terminów, gdy zmieniana jest tylko jedna data (druga z bazy).
  const start = data.plannedStart ?? existing.plannedStart
  const end = data.plannedEnd ?? existing.plannedEnd
  if (start && end && end < start) {
    return NextResponse.json({ error: 'Koniec nie może być przed początkiem' }, { status: 400 })
  }

  // Odhaczenie postępu na 100% domyka zadanie (o ile nie było już zakończone/anulowane).
  if (data.progress === 100 && data.status === undefined && existing.status !== 'ANULOWANE') {
    data.status = 'ZAKONCZONE'
  }

  const updated = await prisma.constructionTask.update({
    where: { id: params.id },
    data,
    select: { id: true, plannedStart: true, plannedEnd: true, progress: true, status: true, name: true },
  })

  void audit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: 'UPDATE',
    entity: 'ConstructionTask',
    entityId: params.id,
    metadata: { fields: Object.keys(data) },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.constructionTask.findUnique({
    where: { id: params.id },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Zadanie nie istnieje' }, { status: 404 })

  await prisma.constructionTask.delete({ where: { id: params.id } })
  void audit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: 'DELETE',
    entity: 'ConstructionTask',
    entityId: params.id,
  })
  return NextResponse.json({ ok: true })
}
