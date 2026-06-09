import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runOcr } from '@/lib/ocr'

export const runtime = 'nodejs'

/**
 * POST /api/cases/[id]/documents/[docId]/ocr — ręczne (ponowne) uruchomienie OCR
 * dla skanu. Ustawia PENDING i odpala OCR w tle (fire-and-forget) — user odświeża
 * stronę po chwili, żeby zobaczyć wynik.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const doc = await prisma.caseDocument.findUnique({ where: { id: params.docId } })
  if (!doc || doc.caseId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.caseDocument.update({ where: { id: params.docId }, data: { ocrStatus: 'PENDING' } })
  void runOcr(params.docId)

  return NextResponse.json({ ok: true, status: 'PENDING' })
}
