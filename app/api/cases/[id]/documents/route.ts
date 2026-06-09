import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'
import { saveCaseDocument, validateCaseFile } from '@/lib/case-uploads'

export const runtime = 'nodejs'

/**
 * POST /api/cases/[id]/documents — wgranie skanów do sprawy (multipart).
 * Pole "files" (wiele) + opcjonalne "entryId" (podpięcie do wpisu korespondencji).
 * Dozwolone: PDF / JPG / PNG / WEBP, do 25 MB. ocrStatus=PENDING (OCR w fazie 3).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.case.findUnique({ where: { id: params.id } })
  if (!item) return NextResponse.json({ error: 'Sprawa nie istnieje' }, { status: 404 })

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Brak pliku w żądaniu' }, { status: 400 })

  const entryId = (formData.get('entryId') as string) || null

  const files: File[] = []
  const single = formData.get('file')
  if (single instanceof File) files.push(single)
  for (const f of formData.getAll('files')) if (f instanceof File) files.push(f)
  const nonEmpty = files.filter((f) => f.size > 0)
  if (nonEmpty.length === 0) return NextResponse.json({ error: 'Brak pliku' }, { status: 400 })

  for (const f of nonEmpty) {
    const err = validateCaseFile(f)
    if (err) return NextResponse.json({ error: err }, { status: 415 })
  }

  const userId = (session.user as any)?.id || null
  const meta = extractRequestMeta(req)
  const created: any[] = []

  for (const f of nonEmpty) {
    const doc = await saveCaseDocument({ caseId: params.id, entryId, file: f, uploadedById: userId })
    void audit({
      action: 'CREATE',
      userId,
      userEmail: session.user?.email,
      entity: 'CaseDocument',
      entityId: doc.id,
      path: req.nextUrl.pathname,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { caseId: params.id, filename: f.name, size: f.size },
    })
    created.push(doc)
  }

  return NextResponse.json({ documents: created }, { status: 201 })
}
