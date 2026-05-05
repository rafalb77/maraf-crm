/* eslint-disable */
/**
 * Import obmiaru z pliku Excel do wskazanego ZAKRESU robót (WorkScope).
 *
 * Uruchomienie:
 *   node scripts/import-obmiar.js [scope-slug] [ścieżka-xlsx]
 *
 * Domyślnie: zakres "konstrukcja-zelbetowa" + plik z dysku Rafała.
 *
 * Wczytuje 9 arkuszy → tworzy WorkCategory + WorkItem przypisane do zakresu.
 * Wiersze agregowane po (kondygnacja, nazwa elementu).
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const DEFAULT_FILE = 'C:/Users/Rafał/Documents/Nova Staffa - konstrukcja żelbetowa.xlsx'
const DEFAULT_SCOPE_SLUG = 'konstrukcja-zelbetowa'
const DEFAULT_SCOPE_NAME = 'Konstrukcja żelbetowa'

const scopeSlug = process.argv[2] || DEFAULT_SCOPE_SLUG
const filePath = process.argv[3] || DEFAULT_FILE

// Kategorie + ich domyślna jednostka rozliczeniowa
const CATEGORIES = [
  { name: 'Fundamenty',         slug: 'fundamenty',         order: 10, primaryUnit: 'M3' },
  { name: 'Piony 0',            slug: 'piony-0',            order: 20, primaryUnit: 'M3' },
  { name: 'Belki nad 0',        slug: 'belki-nad-0',        order: 30, primaryUnit: 'M3' },
  { name: 'Strop nad 0',        slug: 'strop-nad-0',        order: 40, primaryUnit: 'M2' },
  { name: 'Piony nadziemia',    slug: 'piony-nadziemia',    order: 50, primaryUnit: 'M3' },
  { name: 'Belki nadziemia',    slug: 'belki-nadziemia',    order: 60, primaryUnit: 'M3' },
  { name: 'Stropy nadziemia',   slug: 'stropy-nadziemia',   order: 70, primaryUnit: 'M2' },
  { name: 'Szyby windowe',      slug: 'szyby-windowe',      order: 80, primaryUnit: 'M3' },
  { name: 'Biegi schodowe',     slug: 'biegi-schodowe',     order: 90, primaryUnit: 'M3' },
]

// Rodzaje elementu, dla których ROZLICZENIE jest M2 (powierzchnia płyty)
// nawet jeśli kategoria sumuje w M3
const M2_ELEMENT_TYPES = new Set([
  'Płyta stropowa',
  'Balkony',
  'Balkony niższe',
  'Balkony wyższe',
])

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i] || []
    const hasRodzaj = r.includes('Rodzaj elementu')
    const hasNazwa = r.includes('Nazwa elementu')
    if (hasRodzaj && hasNazwa) return i
  }
  return -1
}

function buildColumnMap(headerRow) {
  // Mapuje nazwę nagłówka → indeks kolumny.
  // Kolumny mogą się różnić między arkuszami (np. Belki nad 0 ma 'Uwagi' przed 'A [m2]').
  const map = {}
  headerRow.forEach((h, idx) => {
    if (typeof h !== 'string') return
    const norm = h.trim().toLowerCase()
    if (norm === 'rodzaj elementu') map.rodzaj = idx
    else if (norm === 'kondygnacja') map.kondygnacja = idx
    else if (norm === 'szt.') map.szt = idx
    else if (norm === 'nazwa elementu') map.nazwa = idx
    else if (norm === 'l [m]') map.L = idx
    else if (norm === 'b [m]') map.B = idx
    else if (norm === 'h [m]') map.h = idx
    else if (norm === 'a [m2]') map.A = idx
    else if (norm === 'vj [m3]') map.Vj = idx
    else if (norm === 'v [m3]') map.V = idx
    else if (norm === 'uwagi') map.uwagi = idx
  })
  return map
}

function isSummaryRow(row, colMap) {
  const rodzaj = row[colMap.rodzaj]
  const nazwa = row[colMap.nazwa]
  // Wiersze pivot table
  if (typeof rodzaj === 'string') {
    if (/^etykiety wierszy/i.test(rodzaj)) return true
    if (/^suma końcowa/i.test(rodzaj)) return true
    if (/^uwagi/i.test(rodzaj)) return true
  }
  if (typeof nazwa === 'string') {
    if (/^suma końcowa/i.test(nazwa)) return true
    if (/^etykiety wierszy/i.test(nazwa)) return true
  }
  return false
}

function parseSheet(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const headerIdx = findHeaderRow(rows)
  if (headerIdx < 0) {
    console.warn(`  ⚠️  ${sheetName}: nie znaleziono wiersza nagłówka`)
    return []
  }
  const colMap = buildColumnMap(rows[headerIdx])
  if (colMap.nazwa == null) {
    console.warn(`  ⚠️  ${sheetName}: brak kolumny "Nazwa elementu"`)
    return []
  }

  // Agregacja: klucz = "${rodzaj}|${kondygnacja}|${nazwa}"
  const groups = new Map()

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => c == null)) continue
    if (isSummaryRow(row, colMap)) continue

    const rodzaj = row[colMap.rodzaj]
    const kondygnacja = row[colMap.kondygnacja]
    const nazwa = row[colMap.nazwa]

    if (!nazwa || typeof nazwa !== 'string') continue
    // Wiersze pivot summary mają nazwa = "Łf-01" w pierwszej kolumnie - pomijamy gdy brak innych danych
    // (heurystyka: trzeba mieć kondygnację lub jakąkolwiek liczbę)
    const hasNumeric = [colMap.szt, colMap.L, colMap.B, colMap.h, colMap.A, colMap.Vj, colMap.V]
      .some((idx) => idx != null && typeof row[idx] === 'number')
    if (!hasNumeric) continue

    const key = `${rodzaj || ''}|${kondygnacja || ''}|${nazwa}`
    let g = groups.get(key)
    if (!g) {
      g = {
        rodzaj: rodzaj || null,
        kondygnacja: kondygnacja || null,
        nazwa,
        count: 0,
        L: null,
        B: null,
        h: null,
        A: 0,
        V: 0,
        notes: [],
        sourceRow: i + 1,
      }
      groups.set(key, g)
    }

    if (typeof row[colMap.szt] === 'number') g.count += row[colMap.szt]
    if (g.L == null && typeof row[colMap.L] === 'number') g.L = row[colMap.L]
    if (g.B == null && typeof row[colMap.B] === 'number') g.B = row[colMap.B]
    if (g.h == null && typeof row[colMap.h] === 'number') g.h = row[colMap.h]
    if (typeof row[colMap.A] === 'number') g.A += row[colMap.A]
    if (typeof row[colMap.V] === 'number') g.V += row[colMap.V]
    else if (typeof row[colMap.Vj] === 'number') g.V += row[colMap.Vj]
    const uw = colMap.uwagi != null ? row[colMap.uwagi] : null
    if (uw && typeof uw === 'string') g.notes.push(uw)
  }

  return [...groups.values()]
}

async function main() {
  console.log(`📂 Czytanie pliku: ${filePath}`)
  console.log(`🏷️  Zakres: ${scopeSlug}`)
  const wb = XLSX.readFile(filePath)

  // Upewnij się, że zakres istnieje
  let scope = await prisma.workScope.findUnique({ where: { slug: scopeSlug } })
  if (!scope) {
    const name = scopeSlug === DEFAULT_SCOPE_SLUG
      ? DEFAULT_SCOPE_NAME
      : scopeSlug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    scope = await prisma.workScope.create({
      data: { slug: scopeSlug, name, order: 10 },
    })
    console.log(`➕ Utworzono zakres: ${scope.name}`)
  }

  // Wyczyść istniejące dane TEGO zakresu
  await prisma.workItem.deleteMany({ where: { category: { scopeId: scope.id } } })
  await prisma.workCategory.deleteMany({ where: { scopeId: scope.id } })
  console.log('🗑️  Wyczyszczono poprzedni obmiar zakresu')

  let totalItems = 0
  let totalVolume = 0
  let totalArea = 0

  for (const cat of CATEGORIES) {
    const ws = wb.Sheets[cat.name]
    if (!ws) {
      console.warn(`  ⚠️  Brak arkusza: ${cat.name}`)
      continue
    }
    const groups = parseSheet(ws, cat.name)
    if (groups.length === 0) {
      console.warn(`  ⚠️  ${cat.name}: 0 pozycji`)
      continue
    }

    const category = await prisma.workCategory.create({
      data: {
        scopeId: scope.id,
        name: cat.name,
        slug: cat.slug,
        order: cat.order,
        primaryUnit: cat.primaryUnit,
      },
    })

    let catVol = 0
    let catArea = 0
    for (const g of groups) {
      // Wybór jednostki rozliczeniowej dla pozycji
      let primaryUnit = cat.primaryUnit
      if (g.rodzaj && M2_ELEMENT_TYPES.has(g.rodzaj.trim())) {
        primaryUnit = 'M2'
      }
      const primaryQty = primaryUnit === 'M2' ? g.A : primaryUnit === 'SZT' ? g.count : g.V

      await prisma.workItem.create({
        data: {
          categoryId: category.id,
          floor: g.kondygnacja,
          elementType: g.rodzaj,
          name: g.nazwa,
          count: g.count || null,
          lengthM: g.L,
          widthM: g.B,
          heightM: g.h,
          areaM2: g.A || null,
          volumeM3: g.V || null,
          primaryUnit,
          primaryQty: round(primaryQty || 0, 4),
          notes: g.notes.length ? g.notes.join(' | ') : null,
          sourceRow: g.sourceRow,
        },
      })
      catVol += g.V || 0
      catArea += g.A || 0
    }

    totalItems += groups.length
    totalVolume += catVol
    totalArea += catArea

    console.log(
      `  ✓ ${cat.name.padEnd(22)} ${String(groups.length).padStart(4)} poz.   ` +
        `V=${catVol.toFixed(2).padStart(8)} m³   A=${catArea.toFixed(2).padStart(8)} m²`,
    )
  }

  console.log('')
  console.log(`✅ Zaimportowano ${totalItems} pozycji obmiaru`)
  console.log(`   Łączna objętość żelbetu: ${totalVolume.toFixed(2)} m³`)
  console.log(`   Łączna powierzchnia płyt: ${totalArea.toFixed(2)} m²`)
}

function round(n, dp) {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
