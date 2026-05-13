import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'

// Dostep gate'owany jest na poziomie middleware (permission 'przeroby').
// Wszyscy z tym permission (i admin) moga edytowac obie wartosci — manualValue
// (Maraf) i konradManualValue (kierownik). Akceptacje inwestora moze ustawic
// TYLKO admin. Historia zmian (FloorSummaryItemHistory) trzyma kto-co-kiedy
// do auditingu.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const existing = await prisma.floorSummaryItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  const userEmail = (session.user as any)?.email || null
  const userIsAdmin = isAdmin(userEmail)

  // Akceptacja inwestora — tylko admin moze ustawic.
  if (('investorApproved' in body || 'investorApprovedNote' in body) && !userIsAdmin) {
    return NextResponse.json(
      { error: 'Akceptacja inwestora wymaga uprawnień administratora.' },
      { status: 403 },
    )
  }

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
  if ('konradManualValue' in body) {
    const newVal = body.konradManualValue == null ? null : Number(body.konradManualValue)
    if (newVal !== existing.konradManualValue) {
      data.konradManualValue = newVal
      const newReason = 'konradManualReason' in body ? (body.konradManualReason || null) : existing.konradManualReason
      historyEntries.push({
        itemId: id,
        action: newVal == null ? 'CLEAR_KONRAD_VALUE' : 'SET_KONRAD_VALUE',
        oldValue: JSON.stringify(existing.konradManualValue),
        newValue: JSON.stringify(newVal),
        note: newReason,
        userEmail,
      })
      // Zmiana wartosci kierownika unieważnia akceptację inwestora — wymaga reakceptacji.
      // (Snapshot investorApprovedValue pokaże poprzednią wartość — admin widzi że coś się zmieniło.)
      if (existing.investorApproved) {
        data.investorApproved = false
        data.investorApprovedAt = null
        data.investorApprovedBy = null
        data.investorApprovedNote = null
        historyEntries.push({
          itemId: id,
          action: 'INVESTOR_UNAPPROVE',
          oldValue: JSON.stringify({ approved: true, approvedValue: existing.investorApprovedValue }),
          newValue: JSON.stringify({ approved: false, reason: 'auto-cofnięcie: zmiana wartości kierownika' }),
          userEmail,
        })
      }
    }
  }
  if ('konradManualReason' in body) {
    const newReason = body.konradManualReason || null
    if (newReason !== existing.konradManualReason) {
      data.konradManualReason = newReason
      if (!('konradManualValue' in body)) {
        historyEntries.push({
          itemId: id,
          action: 'EDIT_NOTE',
          oldValue: JSON.stringify(existing.konradManualReason),
          newValue: JSON.stringify(newReason),
          note: 'Uzasadnienie wartości kierownika',
          userEmail,
        })
      }
    }
  }
  if ('investorApproved' in body && userIsAdmin) {
    const newApproved = !!body.investorApproved
    if (newApproved !== existing.investorApproved) {
      data.investorApproved = newApproved
      data.investorApprovedAt = newApproved ? new Date() : null
      data.investorApprovedBy = newApproved ? userEmail : null
      // Snapshot wartości kierownika w momencie akceptacji — żeby później wykryć rozjazd.
      if (newApproved) {
        const kierownikValue = existing.konradManualValue != null
          ? existing.konradManualValue
          : existing.unit === 'm2' ? existing.laborQty : existing.concreteVol
        data.investorApprovedValue = kierownikValue
      } else {
        data.investorApprovedValue = null
      }
      data.investorApprovedNote = newApproved
        ? ('investorApprovedNote' in body ? body.investorApprovedNote || null : existing.investorApprovedNote)
        : null
      historyEntries.push({
        itemId: id,
        action: newApproved ? 'INVESTOR_APPROVE' : 'INVESTOR_UNAPPROVE',
        oldValue: JSON.stringify({ approved: existing.investorApproved }),
        newValue: JSON.stringify({ approved: newApproved, approvedValue: data.investorApprovedValue }),
        note: 'investorApprovedNote' in body ? body.investorApprovedNote || null : null,
        userEmail,
      })
    } else if ('investorApprovedNote' in body && newApproved) {
      // tylko aktualizacja notatki przy already-approved
      const newNote = body.investorApprovedNote || null
      if (newNote !== existing.investorApprovedNote) {
        data.investorApprovedNote = newNote
      }
    }
  }

  // Auto-przełączanie matchMode (bez logowania historii — to derived state)
  if ('manualValue' in body && body.manualValue != null && existing.matchMode === 'AUTO_OK') {
    data.matchMode = 'MANUAL_OVERRIDE'
  }
  if ('manualValue' in body && body.manualValue == null && existing.matchMode === 'MANUAL_OVERRIDE') {
    data.matchMode = 'AUTO_OK'
  }

  await prisma.$transaction([
    prisma.floorSummaryItem.update({ where: { id }, data }),
    ...historyEntries.map((h) => prisma.floorSummaryItemHistory.create({ data: h })),
  ])

  const updated = await prisma.floorSummaryItem.findUnique({ where: { id } })
  return NextResponse.json(updated)
}

/**
 * DELETE /api/przeroby/floor-summaries/items/[id]
 * Usuwa pozycję — tylko dla matchMode === 'MANUAL_ADDED' (recznie dodana).
 * Standardowe pozycje (z buildPositionsForFloor) nie sa kasowalne — beda
 * odtworzone przy reimporcie kierownika.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.floorSummaryItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  if (existing.matchMode !== 'MANUAL_ADDED') {
    return NextResponse.json(
      { error: 'Można usuwać tylko pozycje dodane ręcznie. Standardowe pozycje są chronione (odtwarzane przy reimporcie).' },
      { status: 400 },
    )
  }

  await prisma.floorSummaryItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
