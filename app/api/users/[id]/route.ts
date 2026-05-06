import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * DELETE /api/users/[id]
 * Usuwa użytkownika. Nie pozwala usunąć siebie.
 * Nie pozwala usunąć ostatniego konta w systemie (zostawia minimum 1).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = params.id
  const sessionUserId = (session.user as any).id

  if (id === sessionUserId) {
    return NextResponse.json({ error: 'Nie możesz usunąć własnego konta' }, { status: 400 })
  }

  const total = await prisma.user.count()
  if (total <= 1) {
    return NextResponse.json({ error: 'Nie można usunąć ostatniego konta w systemie' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) {
    return NextResponse.json({ error: 'Użytkownik nie istnieje' }, { status: 404 })
  }

  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
