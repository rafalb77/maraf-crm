import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'
import { saveCaseDocument, validateCaseFile } from '@/lib/case-uploads'

export const runtime = 'nodejs'

/**
 * POST /api/cases/[id]/entries — dodaje wpis do osi korespondencji + opcjonalne skany.
 * Przyjmuje multipart FormData: direction, channel, occurredAt, subject, body, files[].
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.case.findUnique({ where: { id: params.id } })
  if (!item) return NextResponse.json({ error: 'Sprawa nie istnieje' }, { status: 404 })

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Błędne żądanie' }, { status: 400 })

  const direction = (formData.get('direction') as string) || 'PRZYCHODZACA'
  const channel = (formData.get('channel') as string) || 'LIST'
  const subject = (formData.get('subject') as string) || null
  const bodyText = (formData.get('body') as string) || null
  const occurredAtRaw = formData.get('occurredAt') as string | null
  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date()

  const files: File[] = []
  for (const f of formData.getAll('files')) if (f instanceof File && f.size > 0) files.push(f)

  // Walidacja plików PRZED utworzeniem wpisu
  for (const f of files) {
    const err = validateCaseFile(f)
    if (err) return NextResponse.json({ error: err }, { status: 415 })
  }

  const userId = (session.user as any)?.id || null

  const entry = await prisma.caseEntry.create({
    data: {
      caseId: params.id,
      direction,
      channel,
      subject,
      body: bodyText,
      occurredAt,
      createdById: userId,
    },
  })

  for (const f of files) {
    await saveCaseDocument({ caseId: params.id, entryId: entry.id, file: f, uploadedById: userId })
  }

  // dotknięcie sprawy — żeby updatedAt odzwierciedlało aktywność
  await prisma.case.update({ where: { id: params.id }, data: { updatedAt: new Date() } })

  const meta = extractRequestMeta(req)
  void audit({
    action: 'CREATE',
    userId,
    userEmail: session.user?.email,
    entity: 'CaseEntry',
    entityId: entry.id,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { caseId: params.id, direction, channel, files: files.length },
  })

  const full = await prisma.caseEntry.findUnique({
    where: { id: entry.id },
    include: { documents: true },
  })
  return NextResponse.json(full, { status: 201 })
}
