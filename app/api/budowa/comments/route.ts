import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { createClarificationTask } from '@/lib/budowa-tasks'

/**
 * POST /api/budowa/comments — komentarz/flaga przy raporcie, zdjęciu albo luzem
 * przy inwestycji (głównie tata z Widoku Prezesa). needsClarification=true →
 * Task „do wyjaśnienia" dla Rafała. Permission 'budowa' egzekwuje middleware.
 */
export async function POST(req: NextRequest) {
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

  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 2000) : ''
  const needsClarification = body.needsClarification === true
  if (!text && !needsClarification) {
    return NextResponse.json({ error: 'Pusty komentarz' }, { status: 400 })
  }

  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!investment) {
    return NextResponse.json({ error: 'Brak aktywnej inwestycji' }, { status: 400 })
  }

  // Kotwice opcjonalne — waliduj istnienie, złe id po prostu pomijamy (komentarz
  // i tak zostaje przy inwestycji).
  let reportId: string | null = null
  let photoId: string | null = null
  if (typeof body.reportId === 'string' && body.reportId) {
    const r = await prisma.siteReport.findUnique({ where: { id: body.reportId }, select: { id: true } })
    reportId = r?.id ?? null
  }
  if (typeof body.photoId === 'string' && body.photoId) {
    const p = await prisma.sitePhoto.findUnique({ where: { id: body.photoId }, select: { id: true } })
    photoId = p?.id ?? null
  }

  const comment = await prisma.constructionComment.create({
    data: {
      investmentId: investment.id,
      reportId,
      photoId,
      body: text,
      needsClarification,
      authorId: session.user.id || null,
      authorEmail: session.user.email || null,
    },
  })

  if (needsClarification) {
    try {
      await createClarificationTask(comment)
    } catch (e) {
      console.error('[budowa.comments] błąd tworzenia zadania „do wyjaśnienia":', e)
    }
  }

  void audit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: 'CREATE',
    entity: 'ConstructionComment',
    entityId: comment.id,
  })

  return NextResponse.json({ id: comment.id }, { status: 201 })
}
