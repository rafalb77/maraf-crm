/* eslint-disable */
/**
 * Bulk import floor-planow (kart mieszkan PDF) do bazy + uploads volume.
 *
 * Strategia DETERMINISTYCZNA (bez parsowania PDF — fonty osadzone bez CMap):
 *   1. Folder name → numer pietra (np. "Pietro 1" → 1, "Pietro 4" → 4)
 *   2. Filename → globalny numer pliku (`nr1.pdf` → 1, `nr59.pdf` → 59)
 *   3. W bazie: SELECT Unit WHERE type=MIESZKALNY, posortowane NUMERYCZNIE
 *      po koncowym numerze z Unit.number (np. "B1.1.M2" → 2, "B1.1.M10" → 10).
 *      UWAGA: Prisma orderBy sortowalo stringami → M1, M10, M11..., M2, M3...
 *      Ludzie numeruja M1, M2, M3, M4...M10, M11 — wiec sort numeryczny.
 *   4. N-ty plik (po globalnym numerze) = N-ty Unit z listy
 *   5. Weryfikacja: Unit.floor === folderFloor — jesli nie, warning
 *
 * Pliki kopiowane do /app/public/uploads/floorplans/{number}-{ts}.pdf,
 * Unit.floorPlanUrl ustawiane na `/uploads/floorplans/{filename}`.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/import-floorplans.js /app/data/karty            # faktyczny import
 *   node scripts/import-floorplans.js /app/data/karty --dry-run  # tylko preview
 */
const fs = require('fs').promises
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

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

// Parsuje "Piętro 1" / "Pietro 1" / "I piętro" z nazwy folderu w ścieżce
function parseFloorFromPath(filepath, baseDir) {
  const rel = path.relative(baseDir, filepath)
  const parts = rel.split(path.sep)
  for (const part of parts) {
    // Format: "Pietro 1", "Piętro 4"
    const m1 = part.match(/Pi[ęe]tro\s*(\d+)/i)
    if (m1) return parseInt(m1[1])
    // Format: "I pietro", "II pietro"
    const m2 = part.match(/^([IVX]+)\s*pi[ęe]tro/i)
    if (m2) {
      const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5 }
      return roman[m2[1].toUpperCase()] || null
    }
  }
  return null
}

// Parsuje "nr15" / "nr1" z nazwy pliku
function parseNumberFromFilename(filename) {
  const m = filename.match(/nr(\d+)/i)
  return m ? parseInt(m[1]) : null
}

// Wyciaga koncowy numer z Unit.number do sortowania numerycznego.
// "B1.1.M2" → 2, "B1.1.M10" → 10, "B1.4.M59" → 59
function extractTrailingNumber(unitNumber) {
  const m = unitNumber.match(/(\d+)$/)
  return m ? parseInt(m[1]) : 0
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const dir = args.find((a) => !a.startsWith('--')) || '/app/data/karty'

  console.log(`📂 Katalog: ${dir}`)
  console.log(`🔍 Dry-run: ${dryRun ? 'TAK (bez zmian)' : 'NIE'}\n`)

  const targetDir = '/app/public/uploads/floorplans'
  if (!dryRun) await fs.mkdir(targetDir, { recursive: true })

  // 1. Znajdź wszystkie PDFy
  const pdfs = await findPdfs(dir)
  console.log(`📄 Znaleziono ${pdfs.length} plików PDF\n`)

  // 2. Sparsuj każdy plik
  const parsed = pdfs.map((f) => ({
    filepath: f,
    relPath: path.relative(dir, f),
    folderFloor: parseFloorFromPath(f, dir),
    fileNumber: parseNumberFromFilename(path.basename(f)),
  }))

  const unparseable = parsed.filter((p) => !p.folderFloor || !p.fileNumber)
  if (unparseable.length > 0) {
    console.warn(`⚠️  ${unparseable.length} plików bez parsowania (folder/numer):`)
    unparseable.slice(0, 5).forEach((p) => console.warn(`   ${p.relPath}`))
    if (unparseable.length > 5) console.warn(`   ... i ${unparseable.length - 5} więcej`)
  }

  // 3. Pobierz Unit MIESZKALNY z bazy i posortuj NUMERYCZNIE po koncowym numerze
  //    (Prisma orderBy string sort daje M1, M10, M11..., M2 — nie chcemy tego).
  const unitsRaw = await prisma.unit.findMany({
    where: { type: 'MIESZKALNY' },
    select: { id: true, number: true, floor: true, area: true },
  })
  const units = unitsRaw.sort(
    (a, b) => extractTrailingNumber(a.number) - extractTrailingNumber(b.number),
  )
  console.log(`🏠 Mieszkań w bazie: ${units.length}`)
  console.log(`   Pierwsze 3 po sortowaniu numerycznym: ${units.slice(0, 3).map((u) => u.number).join(', ')}`)
  console.log(`   Ostatnie 3: ${units.slice(-3).map((u) => u.number).join(', ')}\n`)

  if (units.length === 0) {
    console.error('❌ Brak mieszkań w bazie — czy import lokali xlsx był wykonany?')
    process.exit(1)
  }

  // 4. Mapowanie: globalny numer N → N-ty Unit z listy
  const sortedParsed = parsed
    .filter((p) => p.fileNumber)
    .sort((a, b) => a.fileNumber - b.fileNumber)

  const mappings = []
  const stats = { ok: 0, floorMismatch: 0, outOfRange: 0 }

  for (const p of sortedParsed) {
    const idx = p.fileNumber - 1 // nr1 → idx 0
    if (idx < 0 || idx >= units.length) {
      console.log(`❌ ${p.relPath}: numer ${p.fileNumber} poza zakresem (max ${units.length})`)
      stats.outOfRange++
      continue
    }
    const unit = units[idx]

    if (p.folderFloor !== unit.floor) {
      console.log(
        `⚠️  ${p.relPath} → ${unit.number}: piętro NIE PASUJE (folder=p${p.folderFloor}, baza floor=${unit.floor})`,
      )
      stats.floorMismatch++
    }

    mappings.push({ ...p, unit })
    console.log(`✓ ${p.relPath} → ${unit.number} (floor=${unit.floor}, ${unit.area} m²)`)
    stats.ok++
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`✅ Zmapowane: ${stats.ok}`)
  console.log(`⚠️  Niezgodne piętro: ${stats.floorMismatch}`)
  console.log(`❌ Poza zakresem: ${stats.outOfRange}`)

  if (stats.floorMismatch > 0) {
    console.log('\n⚠️  UWAGA: są niezgodności pięter. Wklej output do Claude przed importem.')
  }

  if (dryRun) {
    console.log(`\n💡 Tryb dry-run — uruchom bez --dry-run żeby zaimportować.`)
    return
  }

  if (mappings.length === 0) {
    console.log('\nBrak plików do importu.')
    return
  }

  console.log(`\n📤 Importuję ${mappings.length} plików...`)
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
