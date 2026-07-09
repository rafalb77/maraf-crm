import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { closeClarificationTask } from '@/lib/budowa-tasks'

/**
 * PATCH /api/budowa/comments/[id] — oznaczenie „wyjaśnione" (Rafał).
 * Ustawia resolvedAt i auto-domyka powiązany Task (BUDOWA_WYJASNIENIE).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }
  if (body.resolved !== true) {
    return NextResponse.json({ error: 'Obsługiwane: { resolved: true }' }, { status: 400 })
  }

  const comment = await prisma.constructionComment.findUnique({
    where: { id: params.id },
    select: { id: true, resolvedAt: true },
  })
  if (!comment) {
    return NextResponse.json({ error: 'Komentarz nie istnieje' }, { status: 404 })
  }

  if (!comment.resolvedAt) {
    await prisma.constructionComment.update({
      where: { id: comment.id },
      data: { resolvedAt: new Date() },
    })
    await closeClarificationTask(comment.id)
  }

  void audit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: 'UPDATE',
    entity: 'ConstructionComment',
    entityId: comment.id,
    metadata: { resolved: true },
  })

  return NextResponse.json({ ok: true })
}
