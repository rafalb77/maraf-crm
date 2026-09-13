#!/usr/bin/env node
/**
 * Podkłady z PROJEKTU WYKONAWCZEGO dla modułu Odbiory (uruchamiać LOKALNIE).
 *
 * Wejście: rzuty kondygnacji PW (PDF, jedna plansza A0+ z warstwą tekstową CAD)
 *   PW-B1-01 … RZUT PARTERU, PW-B1-02 … PIĘTRA +1, …, PW-B1-05 … PIĘTRA +4, PW-B1-06 … RZUT DACHU
 * Wyjście: public/rzuty/pw/<kondygnacja>.webp (wycinek rzutu bez tabel, skala IMAGE_SCALE)
 *          public/rzuty/pw/sheets.json — manifest arkuszy: rozmiar w pt (układ współrzędnych
 *          pinezek = viewport PDF przy scale 1, przesunięty o lewy-górny róg wycinka),
 *          znaczniki lokali (centroid + obwiednia z bloków pomieszczeń), pomieszczenia
 *          (kod lokalu, nazwa, powierzchnia, pozycja) i kotwice klatek (B1.<p>.K.<litera>).
 *
 * Skąd co: każde pomieszczenie na rzucie ma blok tekstu [kod lokalu (h≈10) / „NN.Nazwa" (h≈7) /
 * „X.XX m²"]. Tabele zestawień po prawej stronie planszy mają kody lokali w jednej kolumnie
 * (stałe x) — odrzucane przez filtr kolumnowy. Granice rzutu = obwiednia etykiet osi
 * („1.1"…„1.15" i litery A–P) + margines.
 *
 * Użycie: node scripts/extract-pw-sheets.mjs [--src "<katalog z PDF>"] [--scale 1.5] [--only 1]
 * Wymaga: pdfjs-dist (zależność react-pdf) + @napi-rs/canvas (devDependency).
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'rzuty', 'pw')
const args = process.argv.slice(2)
const argOf = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const SRC = argOf('--src', 'C:/Users/reo7/Desktop/2025-09-09-PW/02_ARCHITEKTURA/PDF')
const IMAGE_SCALE = Number(argOf('--scale', '1.5'))
const ONLY = argOf('--only', null)
const WEBP_QUALITY = 82
const AXIS_MARGIN = 70 // pt wokół obwiedni osi
const ROOM_BOX_PAD = 45 // pt — obwiednia lokalu = rozrzut bloków pomieszczeń ± pad

const SHEETS = [
  { key: 'pw-0', floor: 0, file: /RZUT PARTERU/i, name: 'Parter', slug: 'parter' },
  { key: 'pw-1', floor: 1, file: /PIĘTRA \+1/i, name: '1 piętro', slug: 'pietro-1' },
  { key: 'pw-2', floor: 2, file: /PIĘTRA \+2/i, name: '2 piętro', slug: 'pietro-2' },
  { key: 'pw-3', floor: 3, file: /PIĘTRA \+3/i, name: '3 piętro', slug: 'pietro-3' },
  { key: 'pw-4', floor: 4, file: /PIĘTRA \+4/i, name: '4 piętro', slug: 'pietro-4' },
  { key: 'pw-dach', floor: null, file: /RZUT DACHU/i, name: 'Dach', slug: 'dach', kind: 'ROOF' },
]

const pdfjs = await import(pathToFileURL(path.join(ROOT, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href)

function normalizeUnit(str) {
  // "B1.1.KOM.LOK. 8" → "B1.1.KL8" (jak markers.json); "B1.1.M8" bez zmian; "U-1.2" bez zmian
  const m = /^B1\.(\d+)\.KOM\.LOK\.\s*(\d+)$/i.exec(str)
  if (m) return `B1.${m[1]}.KL${m[2]}`
  return str
}
function unitKind(number) {
  if (/^B1\.\d+\.M\d+$/.test(number)) return 'MIESZKALNY'
  if (/^B1\.\d+\.KL\d+$/.test(number)) return 'KOMORKA'
  if (/^U-\d/.test(number)) return 'USLUGOWY'
  return 'INNY'
}
const UNIT_RE = /^(B1\.\d+\.M\d+|B1\.\d+\.KOM\.LOK\.\s*\d+|U-\d+\.\d+)$/i
const STAIR_RE = /^B1\.\d+\.K\.([A-Z])$/
const ROOM_RE = /^(\d{2})\.\s*(\p{L}[\p{L}\p{N} .,\-/()]*)$/u
const AREA_RE = /^(\d+(?:[.,]\d+)?)\s*m²$/
const AXIS_RE = /^(1\.\d{1,2}|[A-P])$/

async function processSheet(def, file) {
  const data = new Uint8Array(fs.readFileSync(file))
  const doc = await pdfjs.getDocument({ data }).promise
  const page = await doc.getPage(1)
  const vp1 = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()
  const items = tc.items
    .filter((i) => i.str && i.str.trim())
    .map((i) => {
      const [a, b, , d, e, f] = i.transform
      const [x, y] = vp1.convertToViewportPoint(e, f)
      return { str: i.str.trim(), x, y, h: Math.hypot(b, d), w: i.width }
    })

  // 1) granice rzutu z osi
  const axes = items.filter((t) => AXIS_RE.test(t.str))
  let x0 = 0, y0 = 0, x1 = vp1.width, y1 = vp1.height
  if (axes.length >= 6) {
    x0 = Math.max(0, Math.min(...axes.map((t) => t.x)) - AXIS_MARGIN)
    y0 = Math.max(0, Math.min(...axes.map((t) => t.y)) - AXIS_MARGIN)
    x1 = Math.min(vp1.width, Math.max(...axes.map((t) => t.x + t.w)) + AXIS_MARGIN)
    y1 = Math.min(vp1.height, Math.max(...axes.map((t) => t.y)) + AXIS_MARGIN)
  }
  const cropW = Math.round(x1 - x0)
  const cropH = Math.round(y1 - y0)

  // 2) kody lokali na planie (bez tabel: kolumna ≥4 wpisów o tym samym x)
  const unitItems = items.filter((t) => UNIT_RE.test(t.str))
  const inColumn = (t) => unitItems.filter((o) => o !== t && Math.abs(o.x - t.x) < 2.5 && Math.abs(o.y - t.y) > 4).length >= 4
  const planUnits = unitItems.filter((t) => !inColumn(t) && t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1)

  // 3) pomieszczenia: „NN.Nazwa" + kod lokalu tuż nad (≤ 14 pt) + powierzchnia tuż pod
  const rooms = []
  for (const t of items) {
    const m = ROOM_RE.exec(t.str)
    if (!m) continue
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue
    if (t.h > 9) continue // nagłówki tabel
    const unit = planUnits.filter((u) => Math.abs(u.x - t.x) < 25 && t.y - u.y > 0 && t.y - u.y < 14).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0] || null
    const areaItem = items.filter((a) => AREA_RE.test(a.str) && Math.abs(a.x - t.x) < 25 && a.y - t.y > 0 && a.y - t.y < 14)[0] || null
    const area = areaItem ? Number(AREA_RE.exec(areaItem.str)[1].replace(',', '.')) : null
    rooms.push({
      unit: unit ? normalizeUnit(unit.str) : null,
      num: m[1],
      name: m[2].trim(),
      area,
      x: Math.round((t.x - x0 + t.w / 2) * 10) / 10,
      y: Math.round((t.y - y0) * 10) / 10,
    })
  }

  // 4) kotwice klatek
  const stairs = items
    .filter((t) => STAIR_RE.test(t.str) && t.x >= x0 && t.x <= x1)
    .map((t) => ({ letter: STAIR_RE.exec(t.str)[1], x: t.x - x0, y: t.y - y0 }))

  // 5) znaczniki lokali: centroid + obwiednia z pomieszczeń (fallback: pozycja kodu)
  const byUnit = new Map()
  for (const u of planUnits) {
    const number = normalizeUnit(u.str)
    const arr = byUnit.get(number) || []
    arr.push({ x: u.x - x0 + u.w / 2, y: u.y - y0 })
    byUnit.set(number, arr)
  }
  const markers = []
  for (const [number, pts] of byUnit) {
    const roomPts = rooms.filter((r) => r.unit === number).map((r) => ({ x: r.x, y: r.y }))
    const all = roomPts.length ? roomPts : pts
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y)
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length
    const kind = unitKind(number)
    const pad = kind === 'KOMORKA' ? 18 : ROOM_BOX_PAD
    let staircase = null
    if (stairs.length) {
      const near = stairs.map((s) => ({ s, d: Math.hypot(s.x - cx, s.y - cy) })).sort((a, b) => a.d - b.d)[0]
      staircase = near.s.letter
    }
    markers.push({
      number,
      kind,
      x: Math.round(cx * 10) / 10,
      y: Math.round(cy * 10) / 10,
      box: [Math.round(Math.max(0, Math.min(...xs) - pad)), Math.round(Math.max(0, Math.min(...ys) - pad)), Math.round(Math.min(cropW, Math.max(...xs) + pad)), Math.round(Math.min(cropH, Math.max(...ys) + pad))],
      staircase,
      rooms: roomPts.length,
    })
  }
  markers.sort((a, b) => a.number.localeCompare(b.number, 'pl', { numeric: true }))

  // 6) render wycinka
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const imageFile = `${def.slug}.webp`
  const outPath = path.join(OUT_DIR, imageFile)
  const vp = page.getViewport({ scale: IMAGE_SCALE, offsetX: -x0 * IMAGE_SCALE, offsetY: -y0 * IMAGE_SCALE })
  const W = Math.round(cropW * IMAGE_SCALE)
  const H = Math.round(cropH * IMAGE_SCALE)
  const { canvas, context } = doc.canvasFactory.create(W, H)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, W, H)
  await page.render({ canvasContext: context, viewport: vp }).promise
  fs.writeFileSync(outPath, canvas.toBuffer('image/webp', WEBP_QUALITY))
  const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2)
  await doc.destroy()

  console.log(
    `${def.key}: ${path.basename(file)} → ${imageFile} ${W}×${H}px (${sizeMb} MB), wycinek ${cropW}×${cropH} pt @(${Math.round(x0)},${Math.round(y0)}), lokale ${markers.length} (M ${markers.filter((m) => m.kind === 'MIESZKALNY').length}, KL ${markers.filter((m) => m.kind === 'KOMORKA').length}, U ${markers.filter((m) => m.kind === 'USLUGOWY').length}), pomieszczenia ${rooms.length} (bez lokalu ${rooms.filter((r) => !r.unit).length}), klatki ${[...new Set(stairs.map((s) => s.letter))].join('') || '-'}`,
  )
  return {
    key: def.key,
    kind: def.kind || 'FLOOR',
    name: def.name,
    building: 'B1',
    floor: def.floor,
    source: path.basename(file),
    image: `/rzuty/pw/${imageFile}`,
    imageScale: IMAGE_SCALE,
    width: cropW,
    height: cropH,
    crop: [Math.round(x0), Math.round(y0)],
    stairs: stairs.map((s) => ({ letter: s.letter, x: Math.round(s.x), y: Math.round(s.y) })),
    markers,
    rooms,
  }
}

const files = fs.readdirSync(SRC).filter((f) => /\.pdf$/i.test(f))
const manifestPath = path.join(OUT_DIR, 'sheets.json')
const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { sheets: [] }
const sheets = []
for (const def of SHEETS) {
  if (ONLY && String(def.floor) !== ONLY && def.key !== ONLY) {
    const prev = existing.sheets.find((s) => s.key === def.key)
    if (prev) sheets.push(prev)
    continue
  }
  const file = files.find((f) => def.file.test(f))
  if (!file) {
    console.warn(`${def.key}: brak pliku pasującego do ${def.file} w ${SRC}`)
    const prev = existing.sheets.find((s) => s.key === def.key)
    if (prev) sheets.push(prev)
    continue
  }
  sheets.push(await processSheet(def, path.join(SRC, file)))
}
fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), imageScale: IMAGE_SCALE, sheets }, null, 1))
console.log('manifest:', manifestPath, `(${(fs.statSync(manifestPath).size / 1024).toFixed(0)} KB)`)
