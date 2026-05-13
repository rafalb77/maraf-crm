import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'

// Bulk reorder galerii wizualizacji inwestycji. Body: { ids: string[] }.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.email)) {
    return NextResponse.json({ error: 'Tylko admin' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : null
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: 'Brak ids' }, { status: 400 })
  }

  const owned = await prisma.investmentImage.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  if (owned.length !== ids.length) {
    return NextResponse.json({ error: 'Nieprawidlowe ids' }, { status: 400 })
  }

  await prisma.$transaction(
    ids.map((id, position) => prisma.investmentImage.update({ where: { id }, data: { position } })),
  )

  return NextResponse.json({ ok: true })
}
