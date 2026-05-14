import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/przeroby/contracts/[id]
 *
 * Edycja umowy podwykonawcy. Na razie obsługuje tylko `agreedValueNet` —
 * umowną wartość netto całego zakresu robót (wpisywaną ręcznie). To mianownik
 * wskaźnika "% kontraktu" w widoku protokołu.
 *
 * UWAGA: `valueNet` (wyliczana z protokołów) NIE jest tu edytowalna — nadpisuje
 * ją importer protokołów. `agreedValueNet` to osobne, ręczne pole którego
 * importer nie dotyka.
 *
 * Body: { agreedValueNet: number | null }  (null / '' → czyści wartość)
 *
 * Gate permissji `przeroby` realizuje middleware.ts (URL bez kropki).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contract = await prisma.subContract.findUnique({ where: { id: params.id } })
  if (!contract) {
    return NextResponse.json({ error: 'Umowa nie istnieje' }, { status: 404 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 })
  }

  // agreedValueNet — liczba dodatnia albo null (czyszczenie)
  let agreedValueNet: number | null = null
  const raw = body.agreedValueNet
  if (raw !== null && raw !== undefined && raw !== '') {
    // dopuszczamy przecinek jako separator dziesiętny i spacje (1 234,56)
    const normalized = typeof raw === 'string' ? raw.replace(/\s/g, '').replace(',', '.') : raw
    const n = Number(normalized)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: 'agreedValueNet musi być liczbą ≥ 0 albo null' },
        { status: 400 },
      )
    }
    agreedValueNet = Math.round(n * 100) / 100
  }

  const updated = await prisma.subContract.update({
    where: { id: params.id },
    data: { agreedValueNet },
    select: { id: true, agreedValueNet: true },
  })

  return NextResponse.json(updated)
}
