import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Tworzy szkic protokołu na bazie FloorSummary.
 * Każdą pozycję podsumowania matchujemy do ContractWorkItem po nazwie (case-insensitive).
 * Używamy laborQty jako qty wykonane w tym okresie.
 *
 * Jeśli pozycji podsumowania nie ma w umowie — pomijamy (zwracamy listę pominiętych).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { summaryId, contractId, number, periodFrom, periodTo } = body
  if (!summaryId || !contractId || !periodFrom || !periodTo) {
    return NextResponse.json({ error: 'Brak wymaganych pól' }, { status: 400 })
  }

  const summary = await prisma.floorSummary.findUnique({
    where: { id: summaryId },
    include: { items: true },
  })
  if (!summary) return NextResponse.json({ error: 'Nie znaleziono podsumowania' }, { status: 404 })

  const contract = await prisma.subContract.findUnique({
    where: { id: contractId },
    include: { workItems: true },
  })
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })

  const periodFromD = new Date(periodFrom)
  const periodToD = new Date(periodTo)

  // Sprawdź czy są poprzednie ZATWIERDZONE protokoły dla tej umowy z tym samym lub późniejszym okresem
  // (potrzebne do walidacji „obmiar w okresie" — nie liczymy tego co już rozliczone)
  const previousProtocols = await prisma.protocol.findMany({
    where: {
      contractId: contract.id,
      status: { not: 'ANULOWANY' },
    },
    include: { items: true },
  })

  // Dopasuj pozycje podsumowania → pozycje umowy (po nazwie case-insensitive)
  const itemsToCreate: any[] = []
  const skipped: string[] = []
  let totalNet = 0

  for (const sumItem of summary.items) {
    // Wartość rozliczeniowa: ręczna nadpisuje, inaczej laborQty
    const qty = sumItem.manualValue != null ? sumItem.manualValue : sumItem.laborQty
    if (!qty || qty <= 0) {
      skipped.push(`${sumItem.name} (qty=0)`)
      continue
    }

    // Match po nazwie case-insensitive, normalizacja spacji
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
    const target = norm(sumItem.name)
    const cwi = contract.workItems.find((w) => norm(w.name) === target)
    if (!cwi) {
      skipped.push(`${sumItem.name} (brak w umowie)`)
      continue
    }

    // Ile już rozliczono w poprzednich protokołach
    const prevQty = previousProtocols
      .flatMap((p) => p.items)
      .filter((pi) => pi.contractWorkItemId === cwi.id)
      .reduce((s, pi) => s + pi.qty, 0)

    // Delta w tym okresie = całkowita - poprzednia
    const deltaQty = Math.max(0, qty - prevQty)
    if (deltaQty <= 0.0001) {
      skipped.push(`${sumItem.name} (już rozliczone w poprzednich protokołach)`)
      continue
    }

    const amount = deltaQty * cwi.unitPrice
    totalNet += amount
    itemsToCreate.push({
      contractWorkItemId: cwi.id,
      qty: round(deltaQty, 4),
      unit: cwi.unit,
      unitPrice: cwi.unitPrice,
      amountNet: round(amount, 2),
      note: `Z podsumowania kierownika (${summary.floor})`,
    })
  }

  const ret = contract.retentionPct || 0
  const retentionAmount = (totalNet * ret) / 100
  const payableNet = totalNet - retentionAmount

  const protocol = await prisma.protocol.create({
    data: {
      subcontractorId: contract.subcontractorId,
      contractId: contract.id,
      number: number || null,
      periodFrom: periodFromD,
      periodTo: periodToD,
      periodYear: periodToD.getUTCFullYear(),
      periodMonth: periodToD.getUTCMonth() + 1,
      status: 'SZKIC',
      totalNet: round(totalNet, 2),
      retentionAmount: round(retentionAmount, 2),
      payableNet: round(payableNet, 2),
      notes: `Protokół wygenerowany z podsumowania ${summary.floor}.${skipped.length ? ` Pominięto: ${skipped.join('; ')}` : ''}`,
      items: { create: itemsToCreate },
    },
  })

  return NextResponse.json({
    id: protocol.id,
    created: itemsToCreate.length,
    skipped,
    totalNet: protocol.totalNet,
  })
}

function round(n: number, dp: number) {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}
