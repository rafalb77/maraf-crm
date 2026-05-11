import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateOfferPdf } from '@/lib/pdf-generator'

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
  const offer = await prisma.offer.findUnique({ where: { id }, select: { number: true } })
  if (!offer) return NextResponse.json({ error: 'Nie znaleziono oferty' }, { status: 404 })

  // DIAGNOSTYKA — zwracaj w error response jak pdf padnie
  const os = await import('os')
  const fs = await import('fs')
  const diag = {
    user: os.userInfo().username,
    uid: os.userInfo().uid,
    home: process.env.HOME,
    homeFromUserInfo: os.userInfo().homedir,
    homeExists: fs.existsSync('/home/nextjs'),
    homeContents: fs.existsSync('/home/nextjs') ? fs.readdirSync('/home/nextjs') : null,
    chromeBin: '/usr/bin/google-chrome-stable',
    chromeBinExists: fs.existsSync('/usr/bin/google-chrome-stable'),
    chromiumBinExists: fs.existsSync('/usr/bin/chromium'),
  }
  console.log('[oferty.pdf] diag:', diag)

  try {
    const pdf = await generateOfferPdf(id)
    const filename = `${(offer.number || 'oferta').replace(/[/\\]/g, '-')}.pdf`
    return new NextResponse(pdf as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(pdf.byteLength),
      },
    })
  } catch (e: any) {
    console.error('[oferty.pdf] generation error:', e?.message, e?.stack?.split('\n').slice(0, 3))
    return NextResponse.json(
      { error: e?.message || 'Błąd generowania PDF', stack: e?.stack?.split('\n').slice(0, 5), diag },
      { status: 500 },
    )
  }
}
