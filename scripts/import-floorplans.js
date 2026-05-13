/* eslint-disable */
/**
 * Bulk import floor-planow (kart mieszkan PDF) do bazy + uploads volume.
 *
 * Strategia dopasowania:
 *   Parsuje tekst z PDF (pdf-parse), wyciaga `metraz X,XX m²` i `Y PIETRO`.
 *   W bazie szuka Unit gdzie type=MIESZKALNY + area=X (±0.05) + floor=Y.
 *   Jesli dokladnie 1 wynik → mapuje. Inaczej → flag warning.
 *
 * Pliki kopiowane do /app/public/uploads/floorplans/{number}-{ts}.pdf,
 * Unit.floorPlanUrl ustawiane na `/uploads/floorplans/{filename}`.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/import-floorplans.js /app/data/karty            # faktyczny import
 *   node scripts/import-floorplans.js /app/data/karty --dry-run  # tylko preview
 *
 * Wymaga: pdf-parse w node_modules + struktura `<dir>/<podfolder>/*.pdf`
 * (rekursywne czytanie podkatalogow, czyli folder „Karty/Pietro 1/", „Karty/Pietro 2/" itp.).
 */
const fs = require('fs').promises
const path = require('path')
const pdfParse = require('pdf-parse')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const ROMAN_TO_NUM = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }

async function findPdfs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const result = []
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      result.push(...(await findPdfs(full)))
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
      result.push(full)
    }
  }
  return result
}

async function parsePdf(filepath) {
  const buffer = await fs.readFile(filepath)
  const data = await pdfParse(buffer)
  const text = data.text.replace(/\s+/g, ' ')

  // "I PIĘTRO", "II PIĘTRO" itd.
  const pietroMatch = text.match(/([IVX]+)\s*PIĘTRO/i)
  // "40,48 m²", "39,48 m²"; w nagłówku jest tylko jeden "X,XX m²" + dopiero później powierzchnie pokoi.
  // Bierzemy pierwszy taki z "Metraż" lub po nim — fallback to dowolny pierwszy "X,XX m²" w tekście.
  const metrazMatch =
    text.match(/Metra[żz]\s*[:\s]*\s*(\d+[,.]?\d*)\s*m²/i) ||
    text.match(/(\d+[,.]?\d*)\s*m²/)

  if (!pietroMatch || !metrazMatch) return null
  const floor = ROMAN_TO_NUM[pietroMatch[1].toUpperCase()] || parseInt(pietroMatch[1])
  const area = parseFloat(metrazMatch[1].replace(',', '.'))
  if (!floor || !area) return null
  return { floor, area }
}

async function findUnit(floor, area) {
  // ±0.05 m² tolerancja (zaokrąglenia w PDF vs xlsx)
  return prisma.unit.findMany({
    where: {
      type: 'MIESZKALNY',
      floor,
      area: { gte: area - 0.05, lte: area + 0.05 },
    },
    select: { id: true, number: true, area: true },
  })
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const dir = args.find((a) => !a.startsWith('--')) || '/app/data/karty'

  console.log(`📂 Katalog: ${dir}`)
  console.log(`🔍 Dry-run: ${dryRun ? 'TAK (bez zmian w bazie)' : 'NIE (faktyczny import)'}\n`)

  const targetDir = '/app/public/uploads/floorplans'
  if (!dryRun) await fs.mkdir(targetDir, { recursive: true })

  let pdfs
  try {
    pdfs = await findPdfs(dir)
  } catch (e) {
    console.error(`❌ Błąd czytania katalogu: ${e.message}`)
    process.exit(1)
  }
  console.log(`📄 Znaleziono ${pdfs.length} plików PDF\n`)

  const stats = { ok: 0, ambiguous: 0, notFound: 0, parseErr: 0 }
  const mappings = []

  for (const filepath of pdfs.sort()) {
    const relPath = path.relative(dir, filepath)
    const parsed = await parsePdf(filepath).catch((e) => {
      console.warn(`⚠️  ${relPath}: błąd parsowania PDF — ${e.message}`)
      return null
    })
    if (!parsed) {
      console.log(`⚠️  ${relPath}: brak danych w PDF (metraż / piętro)`)
      stats.parseErr++
      continue
    }

    const candidates = await findUnit(parsed.floor, parsed.area)
    if (candidates.length === 0) {
      console.log(`❌ ${relPath}: brak lokalu (piętro ${parsed.floor}, ${parsed.area} m²)`)
      stats.notFound++
      continue
    }
    if (candidates.length > 1) {
      console.log(
        `⚠️  ${relPath}: niejednoznaczne (${parsed.floor}p, ${parsed.area} m²) → ${candidates
          .map((c) => c.number)
          .join(', ')}`,
      )
      stats.ambiguous++
      continue
    }

    const unit = candidates[0]
    mappings.push({ filepath, relPath, unit, area: parsed.area, floor: parsed.floor })
    console.log(`✓ ${relPath} → ${unit.number} (p${parsed.floor}, ${parsed.area} m²)`)
    stats.ok++
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`✅ OK: ${stats.ok}`)
  console.log(`⚠️  Niejednoznaczne: ${stats.ambiguous}`)
  console.log(`❌ Brak lokalu: ${stats.notFound}`)
  console.log(`⚠️  Błąd parsowania: ${stats.parseErr}`)

  if (dryRun) {
    console.log(`\n💡 Tryb dry-run — uruchom bez --dry-run żeby faktycznie zaimportować.`)
    return
  }

  if (mappings.length === 0) {
    console.log('\nBrak plików do importu.')
    return
  }

  console.log(`\n📤 Importuję ${mappings.length} plików do bazy + uploads...`)
  let imported = 0
  for (const m of mappings) {
    const ext = path.extname(m.filepath).slice(1).toLowerCase() || 'pdf'
    const safeNumber = m.unit.number.replace(/[\\/]/g, '-')
    const newFilename = `${safeNumber}-${Date.now()}.${ext}`
    const newPath = path.join(targetDir, newFilename)
    await fs.copyFile(m.filepath, newPath)
    await prisma.unit.update({
      where: { id: m.unit.id },
      data: { floorPlanUrl: `/uploads/floorplans/${newFilename}` },
    })
    imported++
    if (imported % 10 === 0) console.log(`  ${imported}/${mappings.length}...`)
  }
  console.log(`\n✅ Zaimportowano ${imported} kart mieszkań`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
