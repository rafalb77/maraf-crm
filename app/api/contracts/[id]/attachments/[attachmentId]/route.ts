import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { promises as fs } from 'fs'
import path from 'path'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'

export const runtime = 'nodejs'

/**
 * DELETE /api/contracts/[id]/attachments/[attachmentId]
 * Kasuje rekord ContractAttachment + plik z fs. Audyt DELETE.
 * Bezpieczeństwo: sprawdzamy że attachment należy do podanej umowy
 * (zapobiega usunięciu cudzego załącznika przez podmianę id w URL).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; attachmentId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const attachment = await prisma.contractAttachment.findUnique({
    where: { id: params.attachmentId },
  })
  if (!attachment || attachment.contractId !== params.id) {
    return NextResponse.json({ error: 'Załącznik nie istnieje' }, { status: 404 })
  }

  // Usuń plik z fs (best-effort — gdyby już go nie było, nie blokuj rekordu w DB)
  if (attachment.url.startsWith('/uploads/')) {
    const rel = attachment.url.replace(/^\/+/, '')
    const fullPath = path.join(process.cwd(), 'public', rel)
    try {
      await fs.unlink(fullPath)
    } catch (e: any) {
      if (e?.code !== 'ENOENT') {
        console.warn(`[attachment.delete] fs unlink failed: ${e?.message}`)
      }
    }
  }

  await prisma.contractAttachment.delete({ where: { id: params.attachmentId } })

  const meta = extractRequestMeta(req)
  void audit({
    action: 'DELETE',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'ContractAttachment',
    entityId: attachment.id,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { contractId: params.id, filename: attachment.filename },
  })

  return NextResponse.json({ success: true })
}
