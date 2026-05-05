/* eslint-disable */
/**
 * Import „Podsumowania kondygnacji" kierownika do FloorSummary.
 *
 * node scripts/import-podsumowanie.js [floor-key] [ścieżka.xlsx] [scope-slug]
 *   floor-key:    PARTER | I_PIETRO | II_PIETRO | III_PIETRO | IV_PIETRO | DACH | FUNDAMENTY
 *   scope-slug:   konstrukcja-zelbetowa (domyślnie)
 *
 * Importer jest header-aware — detekcja kolumn po nazwach z nagłówka
 * (Robocizny / Beton C25/30 / Zbrojenie). Toleruje dodatkowe kolumny w Excelu.
 */
const XLSX = require('xlsx')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// ---------- Reguły mapowania per kondygnacja ----------

const PARTER_RULES = {
  'Zaszalowanie i zabetonowanie ścian parteru': {
    matchMode: 'MANUAL_FLOOR_SPLIT',
    matchReason: 'Ściany w obmiarze inżynierskim mierzone razem z fragmentem fundamentowym (pełna wysokość ~4-5m). Bez rzędnych nie da się wydzielić samej części parteru.',
  },
  'Zaszalowanie i zabetonowanie słupów parteru': {
    matchMode: 'MANUAL_FLOOR_SPLIT',
    matchReason: 'Słupy obejmują pełną wysokość (od fundamentu do stropu nad parterem). Kierownik liczy tylko parter.',
  },
  'Zaszalowanie i zabetonowanie słupów okrągłych': {
    matchMode: 'MANUAL_FLOOR_SPLIT',
    matchReason: 'Słupy okrągłe analogicznie — pełna wysokość w obmiarze inżynierskim.',
  },
  'Zaszalowanie i zazbrojenie trzpieni żelbetowych': {
    matchMode: 'MANUAL_FLOOR_SPLIT',
    matchReason: 'Trzpienie żelbetowe spinają kilka kondygnacji jednym ciągłym zbrojeniem.',
  },
  'Zaszalowanie i zazbrojenie belek żelbetowych stropu nad parterem': {
    matchMode: 'AUTO_OK',
    mappingRule: { categoryName: 'Belki nad 0' },
    agg: 'volumeSum',
  },
  'Zaszalowanie i zazbrojenie stropu nad parterem': {
    matchMode: 'AUTO_OK',
    mappingRule: { categoryName: 'Strop nad 0', elementType: 'Płyta stropowa' },
    agg: 'areaSum',
  },
  'Zaszalowanie i zazbrojenie daszków nad parterem': {
    matchMode: 'MANUAL_NOT_FOUND',
    matchReason: 'Daszki nie występują jako odrębne pozycje w obmiarze konstrukcji żelbetowej.',
  },
  'Zaszalowanie i zazbrojenie balkonów żelbetowych': {
    matchMode: 'MANUAL_FLOOR_SPLIT',
    matchReason: 'Obmiar inżynierski grupuje wszystkie balkony stropu nad parterem łącznie. Kierownik liczy tylko balkony parteru — wymaga selekcji.',
  },
  'Zaszalowanie i zazbrojenie schodów żelbetowych': {
    matchMode: 'MANUAL_DIFF_UNIT',
    matchReason: 'Kierownik: kpl (klatka schodowa). Inżynier: szt biegów. Konwersja 1:N wymaga potwierdzenia.',
  },
  'Wieńce na windzie nad parterem': {
    matchMode: 'AUTO_OK',
    mappingRule: { categoryName: 'Szyby windowe', elementType: 'Wieniec szybu', floor: 'Kondygnacja 0' },
    agg: 'volumeSum',
  },
  'Murowanie ścian parteru': {
    matchMode: 'MANUAL_OUT_OF_SCOPE',
    matchReason: 'Prace murarskie — poza zakresem obmiaru konstrukcji żelbetowej.',
  },
  'Montaż łączników balkonowych': {
    matchMode: 'MANUAL_OUT_OF_SCOPE',
    matchReason: 'Element wykonawczy (ISOKORB) montowany przy robotach żelbetowych, nie liczony w obmiarze.',
  },
}

// I PIĘTRO — ściany/trzpienie nadziemia są już mierzone per kondygnacja (h ~2.92m).
// W naszym obmiarze inżynierskim "Belki nadziemia / Kondygnacja N" oznacza belki
// stropu nad kondygnacją N. Manager w pliku „I Piętro" pisze pozycje fazowo
// (co buduje się w trakcie roboty na I piętrze: ściany → belki/wieńce → strop).
//
// Najlepsze automatyczne dopasowania (sprawdzone empirycznie na danych marca):
//   ściany I Piętra      114,22 m³ kier vs 104,85 m³ inż  →  -8%   ✓
//   stropu nad parterem  971 m²    kier vs 1013 m² inż    →  +4,4% ✓
//   belki + nadproża + wsporniki Kondygnacja 2 = 3,89 vs 3,69 m³  →  +5%  ✓
const I_PIETRO_RULES = {
  'Zaszalowanie i zabetonowanie ścian I Piętra': {
    matchMode: 'AUTO_OK',
    mappingRule: { categoryName: 'Piony nadziemia', elementType: 'Ściany nadziemia', floor: 'Kondygnacja 1' },
    agg: 'volumeSum',
  },
  'Zaszalowanie i zabetonowanie Rdzeni I Piętra': {
    matchMode: 'MANUAL_NOT_FOUND',
    matchReason: 'Pojęcie „rdzeni" w nomenklaturze kierownika oznacza pojedyncze rdzenie wzmacniające ściany. W obmiarze inżynierskim mamy tylko „Trzpienie nadziemia" (V≈5,9 m³ na Kondygnację 1) co jest innym pojęciem. Wymaga ręcznej weryfikacji.',
  },
  'Zaszalowanie i zazbrojenie belek żelbetowych stropu nad I Piętrem': {
    matchMode: 'AUTO_OK',
    matchReason: 'Suma kategorii „Belki nadziemia" (belki + nadproża drzwi + wsporniki) na poziomie stropu nad I piętrem (Kondygnacja 2 w obmiarze inżynierskim).',
    mappingRule: { categoryName: 'Belki nadziemia', elementType: ['Belki nadziemia', 'Nadproża drzwi (nadziemie)', 'Wsporniki nadziemia'], floor: 'Kondygnacja 2' },
    agg: 'volumeSum',
  },
  'Zaszalowanie i zazbrojenie wieńcy żelbetowych': {
    matchMode: 'MANUAL_OVERRIDE',
    matchReason: 'Wieńce nadziemia / Kondygnacja 2 w obmiarze inżynierskim = 13,25 m³, kierownik podaje 8,58 m³. Różnica 54% sugeruje że obmiar inżynierski liczy też wieńce balkonów/wewnątrz; wymaga ręcznej weryfikacji.',
  },
  // UWAGA: kierownik w pliku I piętra ma „stropu nad parterem" (nie literówka — strop NAD parterem
  // jest geometrycznie podłogą I piętra i jest wykonywany w fazie I piętra)
  'Zaszalowanie i zazbrojenie stropu nad parterem': {
    matchMode: 'AUTO_OK',
    matchReason: 'Strop nad parterem (= podłoga I piętra) — wykonywany w fazie I piętra. Mapowanie do Stropy nadziemia / Płyta stropowa / Kondygnacja 1.',
    mappingRule: { categoryName: 'Stropy nadziemia', elementType: 'Płyta stropowa', floor: 'Kondygnacja 1' },
    agg: 'areaSum',
  },
  'Zaszalowanie i zazbrojenie stropu nad I Piętrem': {
    matchMode: 'AUTO_OK',
    mappingRule: { categoryName: 'Stropy nadziemia', elementType: 'Płyta stropowa', floor: 'Kondygnacja 2' },
    agg: 'areaSum',
  },
  'Zaszalowanie i zazbrojenie balkonów żelbetowych': {
    matchMode: 'MANUAL_FLOOR_SPLIT',
    matchReason: 'Kierownik dzieli balkony między pliki kondygnacji (parter 23,32 + I piętro 63,80 = 87,12 m²; razem ≈ Stropy nadziemia/Balkony wszystkich pięter 93,27 m², różnica ~7%). Bez identyfikacji konkretnych balkonów per piętro nie można automatycznie wyznaczyć, ile m² należy do tej kondygnacji.',
  },
  'Zaszalowanie i zazbrojenie schodów żelbetowych': {
    matchMode: 'MANUAL_DIFF_UNIT',
    matchReason: 'Kierownik: kpl (klatka schodowa). Inżynier: szt biegów. Konwersja 1:N wymaga potwierdzenia.',
  },
  'Wieńce na windzie nad I Piętrem': {
    matchMode: 'AUTO_OK',
    mappingRule: { categoryName: 'Szyby windowe', elementType: 'Wieniec szybu', floor: 'Kondygnacja 1' },
    agg: 'volumeSum',
  },
  'Murowanie ścian I Piętra': {
    matchMode: 'MANUAL_OUT_OF_SCOPE',
    matchReason: 'Prace murarskie — poza zakresem obmiaru konstrukcji żelbetowej.',
  },
}

const FLOOR_RULES = {
  PARTER: PARTER_RULES,
  I_PIETRO: I_PIETRO_RULES,
}

// ---------- Args ----------
const DEFAULT_FILE = 'C:/Users/Rafał/Documents/obmiary/marzec/Podsumowanie parter - Obmiar.xlsx'
const floorKey = (process.argv[2] || 'PARTER').toUpperCase()
const filePath = process.argv[3] || DEFAULT_FILE
const scopeSlug = process.argv[4] || 'konstrukcja-zelbetowa'

// ---------- Header detection ----------

function normalizeHeader(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Znajdź wiersz nagłówka (zawiera „Jednostka" + „Robocizny" lub podobne)
 * i zwróć { headerIdx, cols: { unit, labor, concrete, rebar } }
 */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] || []
    const cols = {}
    for (let j = 0; j < r.length; j++) {
      const h = normalizeHeader(r[j])
      if (h === 'jednostka') cols.unit = j
      if (h.startsWith('obmiar powykonawczy') || h === 'robocizny') cols.labor = j
      if (h.startsWith('beton c') || h === 'beton c25/30 [m3]' || h === 'beton c25/30') cols.concrete = j
      if (h === 'zbrojenie [kg]' || h === 'zbrojenie') cols.rebar = j
    }
    if (cols.unit != null && cols.labor != null) {
      return { headerIdx: i, cols }
    }
  }
  return null
}

async function main() {
  console.log(`📂 Plik: ${filePath}`)
  console.log(`🏷️  Kondygnacja: ${floorKey} | Zakres: ${scopeSlug}`)

  const scope = await prisma.workScope.findUnique({ where: { slug: scopeSlug } })
  if (!scope) {
    console.error(`❌ Nie znaleziono zakresu „${scopeSlug}". Zaimportuj najpierw obmiar inżynierski.`)
    process.exit(1)
  }

  const wb = XLSX.readFile(filePath)
  const sheetName = wb.SheetNames.find((n) => /podsumowanie/i.test(n)) || wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  const hdr = findHeaderRow(rows)
  if (!hdr) {
    console.error('❌ Nie znaleziono wiersza nagłówka (Jednostka / Robocizny / ...)')
    process.exit(1)
  }
  console.log(`✓ Nagłówek w wierszu ${hdr.headerIdx + 1}, kolumny:`, hdr.cols)

  // Czytamy pozycje TYLKO do pierwszego pustego wiersza / wiersza SUMA.
  // Po nim w arkuszu kierownika idą tabele szczegółowe (ścian, belek itd.)
  // które nie powinny trafić do podsumowania.
  const items = []
  for (let i = hdr.headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || []
    // Stop: pusty wiersz
    const allNull = r.every((c) => c == null || c === '')
    if (allNull) break
    // Stop: wiersz SUMA (kolumna „SUMA" w tytule pozycji LUB w którejś kolumnie tekstowej)
    const hasSuma = r.some((c) => typeof c === 'string' && /^suma\b/i.test(c.trim()))
    if (hasSuma) break

    const name = r[0]
    if (!name || typeof name !== 'string') continue
    // Pozycja podsumowania MUSI mieć jednostkę w kolumnie unit (m3/m2/mb/kpl/T/szt)
    // — tabele szczegółowe ścian/belek mają tam liczby, nie tekst.
    const unit = r[hdr.cols.unit]
    if (typeof unit !== 'string' || !/^(m2|m3|m²|m³|mb|kpl|szt|t|kg)$/i.test(unit.trim())) continue
    if (typeof r[hdr.cols.labor] !== 'number') continue

    items.push({
      position: items.length + 1,
      name: name.trim(),
      unit: unit.trim(),
      laborQty: Number(r[hdr.cols.labor]) || 0,
      concreteVol: hdr.cols.concrete != null ? Number(r[hdr.cols.concrete]) || 0 : 0,
      rebarMass: hdr.cols.rebar != null ? Number(r[hdr.cols.rebar]) || 0 : 0,
    })
  }
  console.log(`✓ Wczytano ${items.length} pozycji z arkusza „${sheetName}"`)

  const rules = FLOOR_RULES[floorKey] || {}

  await prisma.floorSummary.deleteMany({ where: { scopeId: scope.id, floor: floorKey } })

  const summary = await prisma.floorSummary.create({
    data: { scopeId: scope.id, floor: floorKey, source: path.basename(filePath) },
  })

  for (const it of items) {
    const rule = rules[it.name] || {
      matchMode: 'MANUAL_NOT_FOUND',
      matchReason: 'Brak reguły mapowania dla tej pozycji — wpisz wartość ręcznie lub poproś o dodanie reguły.',
    }
    await prisma.floorSummaryItem.create({
      data: {
        summaryId: summary.id,
        position: it.position,
        name: it.name,
        unit: it.unit,
        laborQty: it.laborQty,
        concreteVol: it.concreteVol,
        rebarMass: it.rebarMass,
        matchMode: rule.matchMode,
        matchReason: rule.matchReason || null,
        mappingRule: rule.mappingRule ? JSON.stringify({ ...rule.mappingRule, agg: rule.agg }) : null,
      },
    })
    const tag = rule.matchMode === 'AUTO_OK' ? '✓' : '✋'
    console.log(`  ${tag} ${it.name.substring(0, 60).padEnd(60)} ${it.unit.padEnd(4)} ${it.laborQty.toFixed(2).padStart(10)}`)
  }
  console.log(`\n✅ Zaimportowano ${items.length} pozycji do podsumowania ${floorKey}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
