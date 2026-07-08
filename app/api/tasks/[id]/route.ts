import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/tasks/[id] — akcje na zadaniu z widgetu.
 * Body: { action: 'complete' | 'reopen' | 'snooze' | 'pin' | 'unpin', snoozeUntil? }
 *  - complete: OTWARTE → ZROBIONE (completedAt, completedById)
 *  - reopen:   ZROBIONE/ANULOWANE → OTWARTE (cofnięcie omyłkowego odhaczenia)
 *  - snooze:   drzemka do snoozeUntil (ISO) — widget pomija do tego czasu
 *  - pin/unpin: przypięcie na górę listy (scoring +1000)
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await prisma.task.findUnique({ where: { id: params.id } })
  if (!task) return NextResponse.json({ error: 'Zadanie nie istnieje' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const action = body?.action

  if (action === 'complete') {
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: 'ZROBIONE',
        completedAt: new Date(),
        completedById: session.user.id || null,
        autoCompleted: false,
        snoozedUntil: null,
      },
    })
    return NextResponse.json(updated)
  }

  if (action === 'reopen') {
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: 'OTWARTE', completedAt: null, completedById: null, autoCompleted: false },
    })
    return NextResponse.json(updated)
  }

  if (action === 'snooze') {
    const until = body?.snoozeUntil ? new Date(body.snoozeUntil) : null
    if (!until || isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'snoozeUntil musi być datą w przyszłości' }, { status: 400 })
    }
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { snoozedUntil: until },
    })
    return NextResponse.json(updated)
  }

  if (action === 'pin' || action === 'unpin') {
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { pinned: action === 'pin' },
    })
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Nieznana akcja' }, { status: 400 })
}

/**
 * DELETE /api/tasks/[id] — usunięcie zadania.
 * MANUAL: twarde usunięcie wiersza. RULE: tylko ANULOWANE — wiersz z ruleKey
 * musi zostać, inaczej silnik odtworzyłby zadanie przy następnym przebiegu.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await prisma.task.findUnique({ where: { id: params.id } })
  if (!task) return NextResponse.json({ error: 'Zadanie nie istnieje' }, { status: 404 })

  if (task.source === 'MANUAL') {
    await prisma.task.delete({ where: { id: task.id } })
  } else {
    await prisma.task.update({
      where: { id: task.id },
      data: { status: 'ANULOWANE', completedAt: new Date(), completedById: session.user.id || null },
    })
  }

  return NextResponse.json({ success: true })
}
