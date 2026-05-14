import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canGenerateCreative } from '@/lib/types'

const VALID_PRICE_MODES = ['EXACT', 'FROM', 'PER_SQM', 'NONE']

// Zapis (upsert) zapamietanych ustawien generatora kreacji per lokal.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unit = await prisma.unit.findUnique({ where: { id: params.id }, select: { id: true, type: true, status: true } })
  if (!unit) return NextResponse.json({ error: 'Lokal nie istnieje' }, { status: 404 })
  if (!canGenerateCreative(unit)) {
    return NextResponse.json({ error: 'Generowanie kreacji niedostępne dla tego lokalu.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const priceMode = VALID_PRICE_MODES.includes(body?.priceMode) ? body.priceMode : 'FROM'
  const ctaText = typeof body?.ctaText === 'string' ? body.ctaText.slice(0, 60) : 'Zobacz szczegóły'
  const headline = typeof body?.headline === 'string' ? body.headline.slice(0, 80) : ''

  // backgrounds: obiekt { format: url } — serializujemy do JSON stringa
  let backgrounds = '{}'
  if (body?.backgrounds && typeof body.backgrounds === 'object') {
    const clean: Record<string, string> = {}
    for (const [k, v] of Object.entries(body.backgrounds)) {
      if (typeof v === 'string' && v.startsWith('/uploads/')) clean[k] = v
    }
    backgrounds = JSON.stringify(clean)
  }

  const saved = await prisma.unitCreativeSettings.upsert({
    where: { unitId: params.id },
    create: { unitId: params.id, priceMode, ctaText, headline, backgrounds },
    update: { priceMode, ctaText, headline, backgrounds },
  })

  return NextResponse.json({ settings: saved })
}
