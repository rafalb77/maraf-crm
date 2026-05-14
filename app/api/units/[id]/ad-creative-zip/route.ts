import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AD_FORMAT_DIMENSIONS, type AdCreativeFormat, type PriceMode } from '@/lib/ad-creative-html'
import { buildAdCreativePng } from '@/lib/ad-creative-build'
import { canGenerateCreative } from '@/lib/types'
import { createZip, type ZipEntry } from '@/lib/zip'

const FORMATS = Object.keys(AD_FORMAT_DIMENSIONS) as AdCreativeFormat[]
const VALID_PRICE_MODES: PriceMode[] = ['EXACT', 'FROM', 'PER_SQM', 'NONE']

// Generuje wszystkie 4 formaty kreacji i pakuje do ZIP.
// bg per format przekazywany jako query: bg_feed_square, bg_feed_portrait, bg_story, bg_landscape.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const priceModeRaw = (searchParams.get('priceMode') || 'FROM') as PriceMode
  const cta = (searchParams.get('cta') || 'Zobacz szczegóły').slice(0, 60)
  const headline = (searchParams.get('headline') || '').slice(0, 80)
  const priceMode = VALID_PRICE_MODES.includes(priceModeRaw) ? priceModeRaw : 'FROM'

  const unit = await prisma.unit.findUnique({
    where: { id: params.id },
    include: { images: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
  })
  if (!unit) return NextResponse.json({ error: 'Lokal nie istnieje' }, { status: 404 })
  if (!canGenerateCreative(unit)) {
    return NextResponse.json(
      { error: 'Generowanie kreacji niedostępne dla tego lokalu (komórka/parking/garaż lub lokal sprzedany).' },
      { status: 403 },
    )
  }

  const investRow = await prisma.settings.findUnique({ where: { key: 'investmentName' } })
  const investmentName = investRow?.value || 'Inwestycja'
  const investImage = await prisma.investmentImage.findFirst({
    orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
  })

  try {
    // Sekwencyjnie (nie rownolegle) — kazdy puppeteer to osobny Chrome, oszczednosc RAM
    const entries: ZipEntry[] = []
    for (const format of FORMATS) {
      const bgOverride = searchParams.get(`bg_${format}`)
      const png = await buildAdCreativePng({
        format,
        unit,
        investmentName,
        investmentImageUrl: investImage?.url || null,
        priceMode,
        cta,
        headline,
        bgOverride,
      })
      const dim = AD_FORMAT_DIMENSIONS[format]
      const safeNum = unit.number.replace(/[^a-zA-Z0-9._-]/g, '_')
      entries.push({ name: `${safeNum}-${format}-${dim.w}x${dim.h}.png`, data: png })
    }

    const zip = createZip(entries)
    const safeNum = unit.number.replace(/[^a-zA-Z0-9._-]/g, '_')
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(zip.length),
        'Content-Disposition': `attachment; filename="kreacje-${safeNum}.zip"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    console.error('[ad-creative-zip] generate error:', err)
    return NextResponse.json(
      { error: 'Blad generowania kreacji: ' + (err?.message || 'nieznany') },
      { status: 500 },
    )
  }
}
