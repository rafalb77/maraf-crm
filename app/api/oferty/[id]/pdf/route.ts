import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateOfferPdf } from '@/lib/pdf-generator'
import { buildOfferFilenameBase, offerContentDisposition } from '@/lib/offer-filename'

export const runtime = 'nodejs'

/**
 * GET /api/oferty/[id]/pdf
 * Generuje PDF z oferta i zwraca jako application/pdf.
 * Klient: pobierz przez fetch lub otwórz w nowej karcie.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const offer = await prisma.offer.findUnique({
    where: { id },
    select: {
      number: true,
      createdAt: true,
      client: { select: { firstName: true, lastName: true } },
      items: { select: { label: true }, orderBy: { position: 'asc' } },
    },
  })
  if (!offer) return NextResponse.json({ error: 'Nie znaleziono oferty' }, { status: 404 })

  try {
    const pdf = await generateOfferPdf(id)
    return new NextResponse(pdf as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': offerContentDisposition(buildOfferFilenameBase(offer), 'inline'),
        'Content-Length': String(pdf.byteLength),
      },
    })
  } catch (e: any) {
    console.error('[oferty.pdf] generation error:', e?.message, e?.stack?.split('\n').slice(0, 3))
    return NextResponse.json(
      { error: e?.message || 'Błąd generowania PDF' },
      { status: 500 },
    )
  }
}
