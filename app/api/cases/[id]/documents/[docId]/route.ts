import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'
import { deleteCaseFile } from '@/lib/case-uploads'

export const runtime = 'nodejs'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const doc = await prisma.caseDocument.findUnique({ where: { id: params.docId } })
  if (!doc || doc.caseId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.caseDocument.delete({ where: { id: params.docId } })
  await deleteCaseFile(doc.url)

  const meta = extractRequestMeta(req)
  void audit({
    action: 'DELETE',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'CaseDocument',
    entityId: params.docId,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { caseId: params.id, filename: doc.filename },
  })

  return NextResponse.json({ success: true })
}
