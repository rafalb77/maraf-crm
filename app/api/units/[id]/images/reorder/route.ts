import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Bulk reorder galerii. Body: { ids: string[] } — kolejnosc id-ow odpowiada
// nowym wartosciom `position` (0..N-1).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : null
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: 'Brak ids' }, { status: 400 })
  }

  // Sanity: wszystkie id naleza do tego lokalu
  const owned = await prisma.unitImage.findMany({
    where: { unitId: params.id, id: { in: ids } },
    select: { id: true },
  })
  if (owned.length !== ids.length) {
    return NextResponse.json({ error: 'Nieprawidlowe ids' }, { status: 400 })
  }

  await prisma.$transaction(
    ids.map((id, position) => prisma.unitImage.update({ where: { id }, data: { position } })),
  )

  return NextResponse.json({ ok: true })
}
