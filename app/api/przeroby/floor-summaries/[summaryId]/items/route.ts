import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/przeroby/floor-summaries/[summaryId]/items
 * Body: {
 *   name: string,
 *   unit: 'm2' | 'm3' | 'mb' | 'szt' | 'kpl' | 'T' | 'kg',
 *   manualValue?: number,         // wartość Marafu (ręczna)
 *   konradManualValue?: number,   // wartość kierownika (ręczna)
 *   konradManualReason?: string,
 * }
 *
 * Dodaje recznie nową pozycję porównania. matchMode = 'MANUAL_ADDED' —
 * przy reimporcie kierownika zostanie zachowana (w przeciwieństwie do
 * standardowych pozycji, które są regenerowane z buildPositionsForFloor).
 *
 * Dostep: każdy z permission 'przeroby' (middleware już sprawdza).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ summaryId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { summaryId } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const unit = typeof body.unit === 'string' ? body.unit.trim() : ''
  if (!name || name.length < 2) return NextResponse.json({ error: 'Nazwa pozycji jest wymagana (min. 2 znaki).' }, { status: 400 })
  if (!['m2', 'm3', 'mb', 'szt', 'kpl', 'T', 'kg'].includes(unit)) {
    return NextResponse.json({ error: 'Nieprawidłowa jednostka. Dozwolone: m2, m3, mb, szt, kpl, T, kg.' }, { status: 400 })
  }

  const summary = await prisma.floorSummary.findUnique({ where: { id: summaryId } })
  if (!summary) return NextResponse.json({ error: 'Nie znaleziono podsumowania kondygnacji.' }, { status: 404 })

  // position = max existing + 1
  const maxPos = await prisma.floorSummaryItem.findFirst({
    where: { summaryId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  const nextPosition = (maxPos?.position ?? 0) + 1

  const manualValue = body.manualValue != null ? Number(body.manualValue) : null
  const konradManualValue = body.konradManualValue != null ? Number(body.konradManualValue) : null
  const konradManualReason = typeof body.konradManualReason === 'string' && body.konradManualReason.trim().length > 0
    ? body.konradManualReason.trim()
    : null

  const userEmail = (session.user as any)?.email || null

  const created = await prisma.floorSummaryItem.create({
    data: {
      summaryId,
      position: nextPosition,
      name,
      unit,
      laborQty: 0,
      concreteVol: 0,
      rebarMass: 0,
      matchMode: 'MANUAL_ADDED',
      matchReason: 'Pozycja dodana ręcznie przez użytkownika',
      mappingRule: null,
      manualValue,
      manualNote: null,
      konradManualValue,
      konradManualReason,
    },
  })

  // Wpis w historii — kto kiedy dodał
  await prisma.floorSummaryItemHistory.create({
    data: {
      itemId: created.id,
      action: 'ITEM_ADDED',
      oldValue: null,
      newValue: JSON.stringify({ name, unit, manualValue, konradManualValue }),
      note: 'Pozycja dodana ręcznie',
      userEmail,
    },
  })

  return NextResponse.json(created)
}
