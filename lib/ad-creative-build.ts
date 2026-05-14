// Wspolna logika budowy pojedynczej kreacji PNG — uzywana przez:
//   - /api/units/[id]/ad-creative      (pojedynczy format)
//   - /api/units/[id]/ad-creative-zip  (4 formaty w ZIP)
// Server-only (czyta pliki z fs, uruchamia puppeteer).

import { promises as fs } from 'fs'
import path from 'path'
import {
  getAdCreativeHtml,
  AD_FORMAT_DIMENSIONS,
  type AdCreativeFormat,
  type PriceMode,
} from './ad-creative-html'
import { generateAdCreativePng } from './ad-creative-generator'

export type CreativeUnitData = {
  number: string
  type: string
  area: number
  floor: number | null
  rooms: number | null
  priceGross: number
  pricePerSqmGross: number
  images: { url: string; isPrimary: boolean }[]
}

// Czyta plik z public/<urlPath> i zwraca base64 data URL. Pusty string przy bledzie.
export async function fileToDataUrl(urlPath: string): Promise<string> {
  try {
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

/**
 * Rozwiazuje sciezke tla dla danego formatu:
 *  - jawny bgOverride (/uploads/...) ma priorytet
 *  - inaczej auto: story/landscape -> wizualizacja inwestycji, feed -> zdjecie lokalu
 */
export function resolveBackgroundUrl(opts: {
  format: AdCreativeFormat
  unit: CreativeUnitData
  investmentImageUrl: string | null
  bgOverride?: string | null
}): string {
  const { format, unit, investmentImageUrl, bgOverride } = opts
  if (bgOverride && bgOverride.startsWith('/uploads/')) return bgOverride

  let bg = ''
  if (format === 'story' || format === 'landscape') {
    bg = investmentImageUrl || ''
  }
  if (!bg) {
    const primary = unit.images.find((i) => i.isPrimary) || unit.images[0]
    bg = primary?.url || ''
  }
  return bg
}

/**
 * Buduje pojedynczy PNG kreacji. Rzuca przy bledzie puppeteera.
 */
export async function buildAdCreativePng(opts: {
  format: AdCreativeFormat
  unit: CreativeUnitData
  investmentName: string
  investmentImageUrl: string | null
  priceMode: PriceMode
  cta: string
  headline: string
  bgOverride?: string | null
}): Promise<Buffer> {
  const bgUrl = resolveBackgroundUrl({
    format: opts.format,
    unit: opts.unit,
    investmentImageUrl: opts.investmentImageUrl,
    bgOverride: opts.bgOverride,
  })

  const [bgImageDataUrl, logoDataUrl] = await Promise.all([
    bgUrl ? fileToDataUrl(bgUrl) : Promise.resolve(''),
    fileToDataUrl('/logo-novastaffa.png'),
  ])

  const html = getAdCreativeHtml({
    format: opts.format,
    headline: opts.headline,
    investmentName: opts.investmentName,
    unitNumber: opts.unit.number,
    unitType: opts.unit.type,
    area: opts.unit.area,
    floor: opts.unit.floor,
    rooms: opts.unit.rooms,
    priceGross: opts.unit.priceGross,
    pricePerSqmGross: opts.unit.pricePerSqmGross,
    priceMode: opts.priceMode,
    ctaText: opts.cta,
    bgImageDataUrl,
    logoDataUrl,
  })

  const dim = AD_FORMAT_DIMENSIONS[opts.format]
  return generateAdCreativePng(html, dim.w, dim.h)
}
