import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/przeroby/protocols/items/[id]
 *
 * Ręczne porównanie pozycji protokołu z obmiarem Maraf — zapis `marafManualValue`
 * i `marafManualNote`. Używane gdy auto-dopasowanie (lib/protokol-maraf-match.ts)
 * jest niepewne, błędne lub brakuje reguły. Wpisana wartość nadpisuje auto-match
 * w kolumnie "Maraf (obmiar)" w widoku protokołu.
 *
 * Body: { marafManualValue: number | null, marafManualNote?: string | null }
 *   - marafManualValue null / '' → czyści ręczną wartość (wraca auto-match)
 *
 * Gate permissji `przeroby` realizuje middleware.ts (URL bez kropki → łapany matcherem).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const item = await prisma.protocolItem.findUnique({ where: { id: params.id } })
  if (!item) {
    return NextResponse.json({ error: 'Pozycja nie istnieje' }, { status: 404 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 })
  }

  // marafManualValue — liczba dodatnia albo null (czyszczenie)
  let marafManualValue: number | null = null
  const raw = body.marafManualValue
  if (raw !== null && raw !== undefined && raw !== '') {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: 'marafManualValue musi być liczbą ≥ 0 albo null' },
        { status: 400 },
      )
    }
    marafManualValue = Math.round(n * 10000) / 10000
  }

  const marafManualNote =
    typeof body.marafManualNote === 'string' && body.marafManualNote.trim()
      ? body.marafManualNote.trim().slice(0, 500)
      : null

  const updated = await prisma.protocolItem.update({
    where: { id: params.id },
    data: { marafManualValue, marafManualNote },
    select: { id: true, marafManualValue: true, marafManualNote: true },
  })

  return NextResponse.json(updated)
}
