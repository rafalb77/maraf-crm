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

const FLOORS = [0, 1, 2, 3, 4]

/** Rozpoznaje etykietę lokalu → { number: numer w bazie, kind } albo null. */
function parseLabel(raw) {
  const s = raw.trim()
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
  'LEGENDA',
]

const out = { generatedAt: new Date().toISOString(), floors: {} }

for (const floor of FLOORS) {
  const file = `kondygnacja-${floor}.pdf`
  const data = new Uint8Array(fs.readFileSync(path.join(RZUTY, file)))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  const page = await doc.getPage(1)
  const vp = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()

  // Strefy legendy: otoczenie tekstów objaśniających (w układzie PDF).
  const legendZones = tc.items
    .filter((it) => it.str && LEGEND_HINTS.some((h) => it.str.toLowerCase().includes(h.toLowerCase())))
    .map((it) => ({ x: it.transform[4], y: it.transform[5] }))
  const inLegend = (x, y) => legendZones.some((z) => Math.hypot(x - z.x, y - z.y) < 250)

  // Najlepsze (największa czcionka) wystąpienie każdego numeru.
  const best = new Map()
  for (const it of tc.items) {
    if (!it.str) continue
    const parsed = parseLabel(it.str)
    if (!parsed) continue
    if (inLegend(it.transform[4], it.transform[5])) continue
    // Wysokość czcionki z macierzy transformacji (skala Y).
    const fontH = Math.hypot(it.transform[1], it.transform[3])
    // convertToViewportPoint: układ PDF → piksele viewportu (origin lewy-górny).
    const [vx, vy] = vp.convertToViewportPoint(it.transform[4] + (it.width || 0) / 2, it.transform[5])
    const prev = best.get(parsed.number)
    if (!prev || fontH > prev.fontH) {
      best.set(parsed.number, { ...parsed, x: Math.round(vx), y: Math.round(vy), fontH })
    }
  }

  const markers = [...best.values()]
    .map(({ fontH, ...m }) => m)
    .sort((a, b) => a.number.localeCompare(b.number, 'pl', { numeric: true }))
  out.floors[floor] = { file, width: Math.round(vp.width), height: Math.round(vp.height), markers }
  console.log(
    `${file}: ${markers.length} znaczników (` +
      ['MIESZKALNY', 'KOMORKA', 'GARAZ', 'USLUGOWY']
        .map((k) => `${k}: ${markers.filter((x) => x.kind === k).length}`)
        .join(', ') +
      ')',
  )
}

fs.writeFileSync(path.join(RZUTY, 'markers.json'), JSON.stringify(out, null, 1))
console.log('Zapisano public/rzuty/markers.json')
