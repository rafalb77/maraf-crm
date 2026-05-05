import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const existing = await prisma.floorSummaryItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  const userEmail = (session.user as any)?.email || null

  const data: any = {}
  const historyEntries: any[] = []

  if ('manualValue' in body) {
    const newVal = body.manualValue == null ? null : Number(body.manualValue)
    if (newVal !== existing.manualValue) {
      data.manualValue = newVal
      historyEntries.push({
        itemId: id,
        action: newVal == null ? 'CLEAR_MANUAL_VALUE' : 'SET_MANUAL_VALUE',
        oldValue: JSON.stringify(existing.manualValue),
        newValue: JSON.stringify(newVal),
        note: 'manualNote' in body ? body.manualNote || null : existing.manualNote,
        userEmail,
      })
    }
  }
  if ('manualNote' in body) {
    const newNote = body.manualNote || null
    if (newNote !== existing.manualNote) {
      data.manualNote = newNote
      // jeśli manualValue już zalogowane w tej samej akcji, dopisz tylko gdy zmiana sama z siebie
      if (!('manualValue' in body)) {
        historyEntries.push({
          itemId: id,
          action: 'EDIT_NOTE',
          oldValue: JSON.stringify(existing.manualNote),
          newValue: JSON.stringify(newNote),
          userEmail,
        })
      }
    }
  }
  if ('accepted' in body) {
    const newAccepted = !!body.accepted
    if (newAccepted !== existing.accepted) {
      data.accepted = newAccepted
      data.acceptedAt = newAccepted ? new Date() : null
      historyEntries.push({
        itemId: id,
        action: newAccepted ? 'ACCEPT' : 'UNACCEPT',
        oldValue: JSON.stringify(existing.accepted),
        newValue: JSON.stringify(newAccepted),
        note: 'acceptedNote' in body ? body.acceptedNote || null : existing.acceptedNote,
        userEmail,
      })
    }
  }
  if ('acceptedNote' in body) {
    data.acceptedNote = body.acceptedNote || null
  }

  // Auto-przełączanie matchMode (bez logowania historii — to derived state)
  if ('manualValue' in body && body.manualValue != null && existing.matchMode === 'AUTO_OK') {
    data.matchMode = 'MANUAL_OVERRIDE'
  }
  if ('manualValue' in body && body.manualValue == null && existing.matchMode === 'MANUAL_OVERRIDE') {
    data.matchMode = 'AUTO_OK'
  }

  // Transakcja: update + history
  await prisma.$transaction([
    prisma.floorSummaryItem.update({ where: { id }, data }),
    ...historyEntries.map((h) => prisma.floorSummaryItemHistory.create({ data: h })),
  ])

  const updated = await prisma.floorSummaryItem.findUnique({ where: { id } })
  return NextResponse.json(updated)
}
