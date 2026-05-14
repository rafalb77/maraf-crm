// Composer HTML kreacji reklamowych Meta Ads (FB/IG).
// Zwraca self-contained HTML string (inline CSS, base64 obrazki) ktory
// puppeteer renderuje i robi screenshot PNG — patrz lib/ad-creative-generator.ts.
// Wzorowane na lib/offer-pdf-html.ts (ten sam pattern: HTML string + base64).
//
// 4 formaty Meta — patrz docs/meta-ads-decyzje.md (faza 1b):
//   feed_square   1080×1080  FB/IG feed
//   feed_portrait 1080×1350  IG portrait 4:5
//   story         1080×1920  Stories / Reels 9:16
//   landscape     1200×628   FB landscape 1.91:1

export type AdCreativeFormat = 'feed_square' | 'feed_portrait' | 'story' | 'landscape'
export type PriceMode = 'EXACT' | 'FROM' | 'PER_SQM' | 'NONE'

export const AD_FORMAT_DIMENSIONS: Record<AdCreativeFormat, { w: number; h: number; label: string }> = {
  feed_square: { w: 1080, h: 1080, label: 'Feed kwadrat 1:1' },
  feed_portrait: { w: 1080, h: 1350, label: 'Feed pionowy 4:5' },
  story: { w: 1080, h: 1920, label: 'Stories / Reels 9:16' },
  landscape: { w: 1200, h: 628, label: 'FB poziomy 1.91:1' },
}

export const PRICE_MODE_LABELS: Record<PriceMode, string> = {
  EXACT: 'Konkretna cena',
  FROM: 'Od (cena)',
  PER_SQM: 'Cena za m²',
  NONE: 'Bez ceny',
}

export type AdCreativeParams = {
  format: AdCreativeFormat
  investmentName: string
  unitNumber: string
  unitType: string
  area: number
  floor: number | null
  rooms: number | null
  priceGross: number
  pricePerSqmGross: number
  priceMode: PriceMode
  ctaText: string
  bgImageDataUrl: string // base64 data URL tla (puste = sam navy background)
  logoDataUrl: string // base64 data URL logo
}

const NAVY = '#2C3E54'
const GOLD = '#C9A37A'

function escapeHtml(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtPrice(n: number): string {
  return Math.round(n).toLocaleString('pl-PL')
}

function fmtArea(n: number): string {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function floorLabel(floor: number | null): string | null {
  if (floor === null || floor === undefined) return null
  if (floor === 0) return 'parter'
  if (floor < 0) return 'podziemie'
  return `${floor}. piętro`
}

function priceText(p: AdCreativeParams): string | null {
  switch (p.priceMode) {
    case 'NONE':
      return null
    case 'PER_SQM':
      return p.pricePerSqmGross > 0 ? `${fmtPrice(p.pricePerSqmGross)} zł/m²` : null
    case 'EXACT':
      return p.priceGross > 0 ? `${fmtPrice(p.priceGross)} zł` : null
    case 'FROM':
    default:
      return p.priceGross > 0 ? `od ${fmtPrice(p.priceGross)} zł` : null
  }
}

/**
 * Skala layoutu wzgledem formatu. Story ma duzo miejsca w pionie,
 * landscape malo — skalujemy rozmiary fontow/paddingow proporcjonalnie.
 */
function scaleFor(format: AdCreativeFormat): number {
  switch (format) {
    case 'story':
      return 1.15
    case 'feed_portrait':
      return 1.05
    case 'landscape':
      return 0.7
    case 'feed_square':
    default:
      return 1
  }
}

export function getAdCreativeHtml(p: AdCreativeParams): string {
  const dim = AD_FORMAT_DIMENSIONS[p.format]
  const s = scaleFor(p.format)
  const isLandscape = p.format === 'landscape'

  // Rozmiary bazowe (px) × skala
  const pad = Math.round(64 * s)
  const logoH = Math.round(56 * s)
  const investSize = Math.round(34 * s)
  const numberSize = Math.round(isLandscape ? 56 : 88 * s)
  const chipSize = Math.round(28 * s)
  const priceSize = Math.round(isLandscape ? 44 : 64 * s)
  const ctaSize = Math.round(30 * s)
  const gap = Math.round(20 * s)

  const chips: string[] = []
  if (p.area > 0) chips.push(`${fmtArea(p.area)} m²`)
  if (p.rooms && p.rooms > 0) chips.push(`${p.rooms} ${p.rooms === 1 ? 'pokój' : p.rooms <= 4 ? 'pokoje' : 'pokoi'}`)
  const fl = floorLabel(p.floor)
  if (fl) chips.push(fl)

  const price = priceText(p)

  const chipsHtml = chips
    .map(
      (c) => `<span style="
        display:inline-block;
        background:rgba(255,255,255,0.16);
        border:1px solid rgba(255,255,255,0.35);
        color:#fff;
        font-size:${chipSize}px;
        font-weight:500;
        padding:${Math.round(8 * s)}px ${Math.round(20 * s)}px;
        border-radius:999px;
        margin-right:${Math.round(12 * s)}px;
        margin-bottom:${Math.round(12 * s)}px;
        white-space:nowrap;
      ">${escapeHtml(c)}</span>`,
    )
    .join('')

  // Tlo: zdjecie albo navy gradient gdy brak
  const bgLayer = p.bgImageDataUrl
    ? `<div style="position:absolute;inset:0;background-image:url('${p.bgImageDataUrl}');background-size:cover;background-position:center;"></div>`
    : `<div style="position:absolute;inset:0;background:linear-gradient(135deg,${NAVY} 0%,#1d2a38 100%);"></div>`

  // Gradient przyciemniajacy dol (czytelnosc tekstu)
  const scrim = `<div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0) 35%,rgba(0,0,0,0.35) 60%,rgba(0,0,0,0.82) 100%);"></div>`

  const logoHtml = p.logoDataUrl
    ? `<img src="${p.logoDataUrl}" style="height:${logoH}px;width:auto;display:block;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4));" />`
    : `<div style="color:#fff;font-size:${investSize}px;font-weight:700;">${escapeHtml(p.investmentName)}</div>`

  const priceHtml = price
    ? `<div style="
        color:${GOLD};
        font-size:${priceSize}px;
        font-weight:800;
        line-height:1;
        margin-top:${gap}px;
        text-shadow:0 2px 8px rgba(0,0,0,0.5);
      ">${escapeHtml(price)}</div>`
    : ''

  const ctaHtml = `<div style="
      display:inline-block;
      margin-top:${Math.round(gap * 1.4)}px;
      background:${GOLD};
      color:${NAVY};
      font-size:${ctaSize}px;
      font-weight:700;
      padding:${Math.round(16 * s)}px ${Math.round(40 * s)}px;
      border-radius:${Math.round(12 * s)}px;
      box-shadow:0 6px 18px rgba(0,0,0,0.35);
    ">${escapeHtml(p.ctaText)}</div>`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${dim.w}px; height:${dim.h}px; }
  body {
    font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }
</style>
</head>
<body>
  <div style="position:relative;width:${dim.w}px;height:${dim.h}px;overflow:hidden;">
    ${bgLayer}
    ${scrim}

    <!-- Top: logo + nazwa inwestycji -->
    <div style="position:absolute;top:${pad}px;left:${pad}px;right:${pad}px;display:flex;align-items:center;gap:${Math.round(20 * s)}px;">
      ${logoHtml}
      <div style="color:rgba(255,255,255,0.95);font-size:${investSize}px;font-weight:600;text-shadow:0 2px 6px rgba(0,0,0,0.5);">
        ${escapeHtml(p.investmentName)}
      </div>
    </div>

    <!-- Bottom: dane lokalu -->
    <div style="position:absolute;left:${pad}px;right:${pad}px;bottom:${pad}px;">
      <div style="color:#fff;font-size:${numberSize}px;font-weight:800;line-height:1.05;text-shadow:0 3px 12px rgba(0,0,0,0.6);">
        ${escapeHtml(p.unitNumber)}
      </div>
      <div style="margin-top:${gap}px;">
        ${chipsHtml}
      </div>
      ${priceHtml}
      ${ctaHtml}
    </div>
  </div>
</body>
</html>`
}
