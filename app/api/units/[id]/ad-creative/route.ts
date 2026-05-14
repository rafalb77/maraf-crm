import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import {
  getAdCreativeHtml,
  AD_FORMAT_DIMENSIONS,
  type AdCreativeFormat,
  type PriceMode,
} from '@/lib/ad-creative-html'
import { canGenerateCreative } from '@/lib/types'
import { generateAdCreativePng } from '@/lib/ad-creative-generator'

const VALID_FORMATS = Object.keys(AD_FORMAT_DIMENSIONS) as AdCreativeFormat[]
const VALID_PRICE_MODES: PriceMode[] = ['EXACT', 'FROM', 'PER_SQM', 'NONE']

// Czyta plik z public/<urlPath> i zwraca base64 data URL. Pusty string przy bledzie.
async function fileToDataUrl(urlPath: string): Promise<string> {
  try {
    // sanityzacja: tylko sciezki w public/, bez path traversal
    if (!urlPath.startsWith('/') || urlPath.includes('..')) return ''
    const filePath = path.join(process.cwd(), 'public', urlPath.replace(/^\//, ''))
    const resolved = path.resolve(filePath)
    const base = path.resolve(path.join(process.cwd(), 'public'))
    if (resolved !== base && !resolved.startsWith(base + path.sep)) return ''
    const buffer = await fs.readFile(resolved)
    const ext = path.extname(urlPath).slice(1).toLowerCase()
    const mime = ext === 'jpg' ? 'jpeg' : ext
    return `data:image/${mime};base64,${buffer.toString('base64')}`
  } catch {
    return ''
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') as AdCreativeFormat | null
  const priceModeRaw = (searchParams.get('priceMode') || 'FROM') as PriceMode
  const cta = (searchParams.get('cta') || 'Zobacz szczegóły').slice(0, 60)
  const headline = (searchParams.get('headline') || '').slice(0, 80)
  const bgParam = searchParams.get('bg') // sciezka /uploads/... lub puste

  if (!format || !VALID_FORMATS.includes(format)) {
    return NextResponse.json({ error: 'Nieprawidlowy format' }, { status: 400 })
  }
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

  // Nazwa inwestycji z Settings
  const investRow = await prisma.settings.findUnique({ where: { key: 'investmentName' } })
  const investmentName = investRow?.value || 'Inwestycja'

  // Wybor tla: jawny bg z query albo auto wg formatu
  let bgUrl = ''
  if (bgParam && bgParam.startsWith('/uploads/')) {
    bgUrl = bgParam
  } else {
    // auto: story/landscape -> InvestmentImage, feed -> UnitImage
    if (format === 'story' || format === 'landscape') {
      const inv = await prisma.investmentImage.findFirst({
        orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
      })
      bgUrl = inv?.url || ''
    }
    if (!bgUrl) {
      const primary = unit.images.find((i) => i.isPrimary) || unit.images[0]
      bgUrl = primary?.url || ''
    }
  }

  const [bgImageDataUrl, logoDataUrl] = await Promise.all([
    bgUrl ? fileToDataUrl(bgUrl) : Promise.resolve(''),
    fileToDataUrl('/logo-novastaffa.png'),
  ])

  const html = getAdCreativeHtml({
    format,
    headline,
    investmentName,
    unitNumber: unit.number,
    unitType: unit.type,
    area: unit.area,
    floor: unit.floor,
    rooms: unit.rooms,
    priceGross: unit.priceGross,
    pricePerSqmGross: unit.pricePerSqmGross,
    priceMode,
    ctaText: cta,
    bgImageDataUrl,
    logoDataUrl,
  })

  const dim = AD_FORMAT_DIMENSIONS[format]

  try {
    const png = await generateAdCreativePng(html, dim.w, dim.h)
    const download = searchParams.get('download') === '1'
    const headers: Record<string, string> = {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Cache-Control': 'no-store',
    }
    if (download) {
      const safeName = `${unit.number}-${format}`.replace(/[^a-zA-Z0-9._-]/g, '_')
      headers['Content-Disposition'] = `attachment; filename="${safeName}.png"`
    }
    return new NextResponse(new Uint8Array(png), { status: 200, headers })
  } catch (err: any) {
    console.error('[ad-creative] generate error:', err)
    return NextResponse.json(
      { error: 'Blad generowania kreacji: ' + (err?.message || 'nieznany') },
      { status: 500 },
    )
  }
}
