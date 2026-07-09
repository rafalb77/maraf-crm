import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { buildStageEdit } from '@/lib/budowa-task-edit'

/** PATCH /api/budowa/stages/[id] — edycja etapu (nazwa/terminy/status/kolejność). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }

  const { data, error } = buildStageEdit(body)
  if (error || !data) return NextResponse.json({ error: error || 'Brak danych' }, { status: 400 })

  const existing = await prisma.constructionStage.findUnique({
    where: { id: params.id },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Etap nie istnieje' }, { status: 404 })

  try {
    const updated = await prisma.constructionStage.update({
      where: { id: params.id },
      data,
      select: { id: true, name: true, status: true, plannedStart: true, plannedEnd: true },
    })
    void audit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'UPDATE',
      entity: 'ConstructionStage',
      entityId: params.id,
      metadata: { fields: Object.keys(data) },
    })
    return NextResponse.json(updated)
  } catch (e: any) {
    // @@unique([investmentId, name]) — kolizja nazwy etapu
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Etap o tej nazwie już istnieje' }, { status: 400 })
    }
    throw e
  }
}
