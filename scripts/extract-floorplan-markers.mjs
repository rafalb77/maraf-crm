// Ekstrakcja znaczników lokali z rzutów marketingowych (public/rzuty/*.pdf)
// do public/rzuty/markers.json — zasila widok „Rzuty pięter".
//
// Rzuty (wektorowe z CAD) mają warstwę tekstową z etykietami lokali:
//   B1.<klatka>.M<nr>          — mieszkanie (etykieta główna + powtórzenia
//                                w numerach pomieszczeń; bierzemy wystąpienie
//                                z NAJWIĘKSZĄ czcionką = etykieta główna)
//   B1.<klatka>.KOM.LOK. <nr>  — komórka lokatorska → w bazie B1.<klatka>.KL<nr>
//   P<nr> (parter)             — miejsce garażowe w hali → w bazie MG.<nr>
//   U-<k>.<nr> (parter)        — lokal usługowy (informacyjnie; bazowy numer
//                                dopasowywany po sufiksie, jeśli istnieje)
//
// Współrzędne zapisujemy już PRZELICZONE do układu viewportu strony przy
// scale=1 (piksele od lewego-GÓRNEGO rogu) — viewer mnoży przez własny scale.
//
// Uruchomienie (po podmianie PDF-ów): node scripts/extract-floorplan-markers.mjs
import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RZUTY = path.join(__dirname, '..', 'public', 'rzuty')
const pdfjs = await import(
  pathToFileURL(path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href
)

// Plansze: kondygnacje budynku + PZT (teren, miejsca postojowe naziemne).
const SHEETS = [
  { key: '0', file: 'kondygnacja-0.pdf', mode: 'floor' },
  { key: '1', file: 'kondygnacja-1.pdf', mode: 'floor' },
  { key: '2', file: 'kondygnacja-2.pdf', mode: 'floor' },
  { key: '3', file: 'kondygnacja-3.pdf', mode: 'floor' },
  { key: '4', file: 'kondygnacja-4.pdf', mode: 'floor' },
  { key: 'pzt', file: 'pzt.pdf', mode: 'pzt' },
]

/** Rozpoznaje etykietę lokalu → { number: numer w bazie, kind } albo null. */
function parseLabel(raw, mode) {
  const s = raw.trim()
  if (mode === 'pzt') {
    // PZT: P1.01–P1.25 i P2.01–P2.04 → w bazie MP.<n> (P2 numerowane dalej, +25).
    const m = /^P([12])\.(\d{2})$/.exec(s)
    if (!m) return null
    const n = parseInt(m[2], 10) + (m[1] === '2' ? 25 : 0)
    return { number: `MP.${n}`, kind: 'PARKING' }
  }
  let m = /^B1\.(\d)\.M(\d+)$/.exec(s)
  if (m) return { number: `B1.${m[1]}.M${m[2]}`, kind: 'MIESZKALNY' }
  // Warianty na rzutach: "B1.1.KOM.LOK. 8" (p.1) i "B1.2.Kom.lok.8" (p.2-4).
  m = /^B1\.(\d)\.KOM\.LOK\.?\s*(\d+)$/i.exec(s)
  if (m) return { number: `B1.${m[1]}.KL${m[2]}`, kind: 'KOMORKA' }
  m = /^P(\d+)$/.exec(s)
  if (m) return { number: `MG.${m[1]}`, kind: 'GARAZ' }
  m = /^U-(\d)\.(\d+)$/.exec(s)
  if (m) return { number: `U-${m[1]}.${m[2]}`, kind: 'USLUGOWY' }
  return null
}

// Teksty objaśnień w LEGENDZIE rzutu — przykładowe etykiety ("P1",
// "B1.1.KOM.LOK. 1") stoją tuż obok nich i trzeba je odrzucić.
const LEGEND_HINTS = [
  'numer komórki lokatorskiej',
  'obszar komórki lokatorskiej',
  'numer miejsca gara',
  'miejsce garażowe o wymiarach',
  'NUMER PROJEKTOWANYCH',
  // UWAGA: nie dodawać ogólnego 'LEGENDA' — na PZT napis stoi tuż przy
  // realnych miejscach P1.14-P1.22 i promień wykluczenia je wycinał.
]

const out = { generatedAt: new Date().toISOString(), floors: {} }

for (const sheet of SHEETS) {
  const data = new Uint8Array(fs.readFileSync(path.join(RZUTY, sheet.file)))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  const page = await doc.getPage(1)
  const vp = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()

  // Strefy legendy: otoczenie tekstów objaśniających (w układzie PDF).
  const legendZones = tc.items
    .filter((it) => it.str && LEGEND_HINTS.some((h) => it.str.toLowerCase().includes(h.toLowerCase())))
    .map((it) => ({ x: it.transform[4], y: it.transform[5] }))
  const inLegend = (x, y) => legendZones.some((z) => Math.hypot(x - z.x, y - z.y) < 250)

  // Najlepsze (największa czcionka) wystąpienie numeru = pozycja znacznika;
  // WSZYSTKIE wystąpienia (etykiety pomieszczeń wewnątrz mieszkania) = punkty
  // do obwiedni obszaru mieszkania (box).
  const best = new Map()
  const points = new Map()
  for (const it of tc.items) {
    if (!it.str) continue
    const parsed = parseLabel(it.str, sheet.mode)
    if (!parsed) continue
    if (inLegend(it.transform[4], it.transform[5])) continue
    // Wysokość czcionki z macierzy transformacji (skala Y).
    const fontH = Math.hypot(it.transform[1], it.transform[3])
    // convertToViewportPoint: układ PDF → piksele viewportu (origin lewy-górny).
    const [vx, vy] = vp.convertToViewportPoint(it.transform[4] + (it.width || 0) / 2, it.transform[5])
    const prev = best.get(parsed.number)
    if (!prev || fontH > prev.fontH) {
      // Metadane do kotwiczenia obrysów na PZT: początek tekstu i rotacja.
      const [sx, sy] = vp.convertToViewportPoint(it.transform[4], it.transform[5])
      const rotated = Math.abs(it.transform[1]) > Math.abs(it.transform[3]) * 0.5
      best.set(parsed.number, { ...parsed, x: Math.round(vx), y: Math.round(vy), fontH, sx, sy, rotated })
    }
    const pts = points.get(parsed.number) || []
    pts.push([vx, vy])
    points.set(parsed.number, pts)
  }

  const markers = [...best.values()]
    .map(({ fontH, sx, sy, rotated, ...m }) => {
      m._meta = { sx, sy, rotated, fontH }
      return m
    })
    .map((m) => {
      // Obwiednia obszaru mieszkania z rozrzutu etykiet pomieszczeń (≥2 punkty).
      const pts = points.get(m.number) || []
      if (m.kind === 'MIESZKALNY' && pts.length >= 2) {
        const xs = pts.map((p) => p[0])
        const ys = pts.map((p) => p[1])
        m.box = [
          Math.round(Math.min(...xs)),
          Math.round(Math.min(...ys)),
          Math.round(Math.max(...xs)),
          Math.round(Math.max(...ys)),
        ]
      }
      return m
    })
    .sort((a, b) => a.number.localeCompare(b.number, 'pl', { numeric: true }))

  // Obrysy miejsc postojowych/garażowych: prostokąt 2,5×5 m wyznaczony
  // z rozstawu sąsiednich etykiet. Kierunek rzędu z położenia najbliższego
  // sąsiada tej samej grupy. Na kondygnacjach etykieta stoi na środku miejsca
  // (centrowanie); na PZT etykiety są kotwiczone różnie (obok/nad/obrócone) —
  // osobne reguły wg orientacji tekstu, skalibrowane na kompozycie kontrolnym.
  for (const kind of ['GARAZ', 'PARKING']) {
    const group = markers.filter((m) => m.kind === kind)
    if (group.length < 2) continue
    const gaps = []
    const nearestOf = new Map()
    for (const m of group) {
      let bestD = Infinity
      let nearest = null
      for (const o of group) {
        if (o === m) continue
        const d = Math.hypot(o.x - m.x, o.y - m.y)
        if (d < bestD) {
          bestD = d
          nearest = o
        }
      }
      if (nearest) {
        gaps.push(bestD)
        nearestOf.set(m, nearest)
      }
    }
    gaps.sort((a, b) => a - b)
    const sp = gaps[Math.floor(gaps.length / 2)] // mediana = 2,5 m w pt
    for (const m of group) {
      const nearest = nearestOf.get(m)
      if (!nearest) continue
      const verticalRow = Math.abs(nearest.y - m.y) > Math.abs(nearest.x - m.x)
      const meta = m._meta || {}
      if (sheet.mode === 'pzt') {
        if (!meta.rotated && verticalRow) {
          // P1.05-18: rząd pionowy, tekst poziomy w ~1/3 szerokości miejsca
          // od lewej (kalibracja na kompozycie kontrolnym).
          m.box = [Math.round(m.x - 0.7 * sp), Math.round(m.y - sp / 2), Math.round(m.x + 1.3 * sp), Math.round(m.y + sp / 2)]
        } else if (!meta.rotated && !verticalRow) {
          // P1.01-04: tekst poziomy NAD miejscem pionowym (pas chodnika między).
          m.box = [Math.round(m.x - sp / 2), Math.round(m.y + 0.35 * sp), Math.round(m.x + sp / 2), Math.round(m.y + 0.35 * sp + 2 * sp)]
        } else if (meta.rotated && !verticalRow) {
          // P1.19-25: rząd poziomy, tekst obrócony pisany od dołu — miejsce
          // pionowe NAD początkiem tekstu.
          m.box = [Math.round(meta.sx - sp / 2), Math.round(meta.sy - 3 - 2 * sp), Math.round(meta.sx + sp / 2), Math.round(meta.sy - 3)]
        } else {
          // P2.01-04: rząd pionowy przy krawędzi, tekst obrócony — miejsce
          // poziome na prawo od etykiety.
          m.box = [Math.round(meta.sx + 2), Math.round(m.y - sp / 2), Math.round(meta.sx + 2 + 2 * sp), Math.round(m.y + sp / 2)]
        }
      } else {
        // Hala garażowa: etykieta w środku miejsca — centrowanie.
        const w = verticalRow ? sp * 2 : sp
        const h = verticalRow ? sp : sp * 2
        m.box = [Math.round(m.x - w / 2), Math.round(m.y - h / 2), Math.round(m.x + w / 2), Math.round(m.y + h / 2)]
      }
    }
  }
  // Kotwica znacznika/tooltipa miejsc = środek obrysu (etykiety bywają z boku).
  for (const m of markers) {
    if ((m.kind === 'PARKING' || m.kind === 'GARAZ') && m.box) {
      m.x = Math.round((m.box[0] + m.box[2]) / 2)
      m.y = Math.round((m.box[1] + m.box[3]) / 2)
    }
    delete m._meta
  }

  out.floors[sheet.key] = {
    file: sheet.file,
    image: sheet.file.replace(/\.pdf$/, '.png'),
    width: Math.round(vp.width),
    height: Math.round(vp.height),
    markers,
  }

  // Pre-render planszy do PNG (scale 2) — viewer używa <img> zamiast pdfjs
  // w przeglądarce (wektorowe rzuty CAD renderowały się sekundami).
  {
    const renderVp = page.getViewport({ scale: 2 })
    const canvasFactory = doc.canvasFactory
    const { canvas, context } = canvasFactory.create(Math.round(renderVp.width), Math.round(renderVp.height))
    await page.render({ canvasContext: context, viewport: renderVp }).promise
    const png = canvas.toBuffer('image/png')
    fs.writeFileSync(path.join(RZUTY, sheet.file.replace(/\.pdf$/, '.png')), png)
    canvasFactory.destroy({ canvas, context })
  }
  console.log(
    `${sheet.file}: ${markers.length} znaczników (` +
      ['MIESZKALNY', 'KOMORKA', 'GARAZ', 'USLUGOWY', 'PARKING']
        .map((k) => `${k}: ${markers.filter((x) => x.kind === k).length}`)
        .join(', ') +
      `, z obwiednią: ${markers.filter((x) => x.box).length})`,
  )
}

fs.writeFileSync(path.join(RZUTY, 'markers.json'), JSON.stringify(out, null, 1))
console.log('Zapisano public/rzuty/markers.json')
