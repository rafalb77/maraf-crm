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
//
// Layout (faza 1b.2 — redesign po feedbacku "ubogo"):
//   GORA   — logo (duze) + nazwa inwestycji
//   HERO   — headline sprzedazowy (najwiekszy element) + zlota linia akcentu
//   DOL    — typ mieszkania (np. "Mieszkanie 3-pokojowe") + chipy (metraz/pietro)
//            + cena (GOLD) + maly numer lokalu + CTA

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

// Gotowe hasla do wyboru w generatorze (faza 1b.2). User moze tez wpisac wlasne.
export const HEADLINE_PRESETS = [
  'Twój nowy adres',
  'Tu zamieszkasz',
  'Wprowadź się w 2026',
  'Ostatnie mieszkania w tej cenie',
  'Mieszkanie gotowe na Twoje życie',
  'Komfort, który czujesz od progu',
  'Zamieszkaj bliżej tego, co ważne',
  'Sprawdź, zanim zniknie',
]

export type AdCreativeParams = {
  format: AdCreativeFormat
  headline: string
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

// "Mieszkanie 3-pokojowe", "Lokal usługowy" itd. — czytelny opis zamiast kodu typu.
function unitTypeHeadline(type: string, rooms: number | null): string {
  switch (type) {
    case 'MIESZKALNY':
      return rooms && rooms > 0 ? `Mieszkanie ${rooms}-pokojowe` : 'Mieszkanie'
    case 'USLUGOWY':
      return 'Lokal usługowy'
    case 'PARKING':
      return 'Miejsce parkingowe'
    case 'GARAZ':
      return 'Miejsce garażowe'
    case 'KOMORKA':
      return 'Komórka lokatorska'
    default:
      return 'Lokal'
  }
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
      return 0.62
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
  const logoH = Math.round(96 * s) // wieksze logo (feedback)
  const investSize = Math.round(30 * s)
  const headlineSize = Math.round(82 * s) // HERO — najwiekszy element
  const typeSize = Math.round(42 * s)
  const chipSize = Math.round(27 * s)
  const priceSize = Math.round(58 * s)
  const numberSize = Math.round(24 * s) // numer lokalu — maly, dyskretny
  const ctaSize = Math.round(30 * s)
  const gap = Math.round(18 * s)
  const goldBarW = Math.round(110 * s)
  const goldBarH = Math.round(8 * s)

  const chips: string[] = []
  if (p.area > 0) chips.push(`${fmtArea(p.area)} m²`)
  const fl = floorLabel(p.floor)
  if (fl) chips.push(fl)

  const price = priceText(p)
  const typeLabel = unitTypeHeadline(p.unitType, p.rooms)

  const chipsHtml = chips
    .map(
      (c) => `<span style="
        display:inline-block;
        background:rgba(255,255,255,0.16);
        border:1px solid rgba(255,255,255,0.4);
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

  // Scrim: lekko od gory (czytelnosc logo+headline), mocno od dolu (dane lokalu)
  const scrim = `<div style="position:absolute;inset:0;background:
    linear-gradient(to bottom,
      rgba(0,0,0,0.45) 0%,
      rgba(0,0,0,0.12) 22%,
      rgba(0,0,0,0) 42%,
      rgba(0,0,0,0.38) 62%,
      rgba(0,0,0,0.85) 100%);"></div>`

  const logoHtml = p.logoDataUrl
    ? `<img src="${p.logoDataUrl}" style="height:${logoH}px;width:auto;display:block;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5));" />`
    : ''

  const headlineHtml = p.headline
    ? `<div style="
        color:#fff;
        font-size:${headlineSize}px;
        font-weight:800;
        line-height:1.08;
        letter-spacing:-0.01em;
        text-shadow:0 3px 16px rgba(0,0,0,0.65);
        max-width:${Math.round(dim.w * (isLandscape ? 0.62 : 0.86))}px;
      ">${escapeHtml(p.headline)}</div>
      <div style="width:${goldBarW}px;height:${goldBarH}px;background:${GOLD};border-radius:${goldBarH}px;margin-top:${Math.round(gap * 1.4)}px;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`
    : ''

  const priceHtml = price
    ? `<div style="
        color:${GOLD};
        font-size:${priceSize}px;
        font-weight:800;
        line-height:1;
        margin-top:${gap}px;
        text-shadow:0 2px 10px rgba(0,0,0,0.6);
      ">${escapeHtml(price)}</div>`
    : ''

  const ctaHtml = `<div style="
      display:inline-block;
      margin-top:${Math.round(gap * 1.5)}px;
      background:${GOLD};
      color:${NAVY};
      font-size:${ctaSize}px;
      font-weight:700;
      padding:${Math.round(16 * s)}px ${Math.round(42 * s)}px;
      border-radius:${Math.round(12 * s)}px;
      box-shadow:0 6px 20px rgba(0,0,0,0.4);
    ">${escapeHtml(p.ctaText)}</div>`

  // Pozycja headline: tuz pod blokiem logo (gora). Dla landscape wyzej i wezej.
  const headlineTop = pad + logoH + Math.round(46 * s)

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

    <!-- GORA: logo + nazwa inwestycji -->
    <div style="position:absolute;top:${pad}px;left:${pad}px;right:${pad}px;display:flex;align-items:center;gap:${Math.round(22 * s)}px;">
      ${logoHtml}
      <div style="color:rgba(255,255,255,0.96);font-size:${investSize}px;font-weight:600;letter-spacing:0.02em;text-shadow:0 2px 8px rgba(0,0,0,0.6);">
        ${escapeHtml(p.investmentName)}
      </div>
    </div>

    <!-- HERO: headline sprzedazowy -->
    <div style="position:absolute;top:${headlineTop}px;left:${pad}px;right:${pad}px;">
      ${headlineHtml}
    </div>

    <!-- DOL: dane lokalu -->
    <div style="position:absolute;left:${pad}px;right:${pad}px;bottom:${pad}px;">
      <div style="color:rgba(255,255,255,0.75);font-size:${numberSize}px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:${Math.round(6 * s)}px;text-shadow:0 2px 6px rgba(0,0,0,0.6);">
        Lokal ${escapeHtml(p.unitNumber)}
      </div>
      <div style="color:#fff;font-size:${typeSize}px;font-weight:800;line-height:1.1;text-shadow:0 3px 12px rgba(0,0,0,0.65);">
        ${escapeHtml(typeLabel)}
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
