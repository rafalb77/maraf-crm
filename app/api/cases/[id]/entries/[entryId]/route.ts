import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'

export const runtime = 'nodejs'

/**
 * DELETE /api/cases/[id]/entries/[entryId] — usuwa wpis korespondencji.
 * Skany podpięte do wpisu NIE są kasowane — odpinają się (entryId→null) i zostają
 * w dokumentach sprawy (CaseDocument.entry onDelete: SetNull w schemie).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = await prisma.caseEntry.findUnique({ where: { id: params.entryId } })
  if (!entry || entry.caseId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.caseEntry.delete({ where: { id: params.entryId } })

  const meta = extractRequestMeta(req)
  void audit({
    action: 'DELETE',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'CaseEntry',
    entityId: params.entryId,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { caseId: params.id },
  })

  return NextResponse.json({ success: true })
}
