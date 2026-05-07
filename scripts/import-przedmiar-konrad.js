/* eslint-disable */
/**
 * Import "Przedmiaru" Konrada (kierownika) do FloorSummary.
 *
 * Czyta arkusz "Ściany i słupy żelb." z pliku Konrada i tworzy:
 *   1× FloorSummary per kondygnacja (parter, Ip, IIp, IIIp, ...)
 *   2× FloorSummaryItem per kondygnacja:
 *     - "Ściany żelbetowe" (m²) → laborQty = wartość Konrada
 *     - "Słupy żelbetowe"  (m³) → concreteVol = wartość Konrada
 *
 * mappingRule każdej pozycji wskazuje na odpowiednie kategorie/elementy
 * obmiaru Maraf (WorkItem) — auto-porównanie wyświetli różnicę w UI
 * /przeroby/porownanie/[floor].
 *
 * UWAGA: skrypt zakłada że WorkScope `konstrukcja-zelbetowa` już istnieje
 * (utworzony przez import-obmiar.js). Jeśli nie ma — wyleci z błędem.
 *
 * Uruchomienie:
 *   node scripts/import-przedmiar-konrad.js [ścieżka.xlsx]
 */
const XLSX = require('xlsx')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const DEFAULT_FILE =
  'C:/Users/Rafał/Desktop/Przeroby/Przedmiary/Przedmiar prac - Staffa - Etap I(konrad).xlsx'
const SHEET_NAME = 'Ściany i słupy żelb.'
const SCOPE_SLUG = 'konstrukcja-zelbetowa'
const SOURCE_LABEL = `Przedmiar Konrad — ${SHEET_NAME}`

const filePath = process.argv[2] || DEFAULT_FILE

// ---------- Mapowanie kondygnacji ----------
// Klucz = string z arkusza Konrada (kol B, idx 1)
// Wartość = enum FloorSummary.floor + numer kondygnacji w obmiarze Maraf
const FLOOR_MAP = {
  parter:  { floor: 'PARTER',     marafFloor: 'Kondygnacja 0', label: 'parter' },
  Ip:      { floor: 'I_PIETRO',   marafFloor: 'Kondygnacja 1', label: 'I piętro' },
  IIp:     { floor: 'II_PIETRO',  marafFloor: 'Kondygnacja 2', label: 'II piętro' },
  IIIp:    { floor: 'III_PIETRO', marafFloor: 'Kondygnacja 3', label: 'III piętro' },
  IVp:     { floor: 'IV_PIETRO',  marafFloor: 'Kondygnacja 4', label: 'IV piętro' },
  Vp:      { floor: 'V_PIETRO',   marafFloor: 'Kondygnacja 5', label: 'V piętro' },
}

// ---------- Reguła mapowania na obmiar Maraf ----------
function buildWallsRule(marafFloor, isParter) {
  return {
    categoryName: isParter ? 'Piony 0' : 'Piony nadziemia',
    elementType: isParter ? 'Ściany 0' : 'Ściany nadziemia',
    floor: marafFloor,
    agg: 'areaSum',
  }
}

function buildColumnsRule(marafFloor, isParter) {
  // Konrad nazywa "słupy" sumę wszystkiego pionowego (słupy + trzpienie).
  // Maraf na parterze ma osobno "Słupy 0" i "Trzpienie 0".
  // Maraf na piętrach ma TYLKO "Trzpienie nadziemia" (brak słupów-słupów).
  return {
    categoryName: isParter ? 'Piony 0' : 'Piony nadziemia',
    elementType: isParter ? ['Słupy 0', 'Trzpienie 0'] : 'Trzpienie nadziemia',
    floor: marafFloor,
    agg: 'volumeSum',
  }
}

// ---------- Parser arkusza ----------
function parseSections(rows) {
  // Wzorzec:
  //   wiersz nagłówkowy sekcji ma w kolumnie B (idx 1) string z FLOOR_MAP
  //   ten sam wiersz ma w kol G (idx 6) — wartość ścian m² (suma kondygnacji)
  //   ten sam wiersz ma w kol M (idx 12) — wartość "słupów" m³ (suma)
  // Sekcje: "parter", "Ip", "IIp", "IIIp", ...
  const sections = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const labelRaw = String(r[1] || '').trim()
    if (!FLOOR_MAP[labelRaw]) continue
    // Sprawdź czy w kol C (idx 2) jest string "ściany" — żeby się upewnić że to header sekcji
    const colC = String(r[2] || '').trim().toLowerCase()
    if (colC !== 'ściany') continue

    const wallsArea = typeof r[6] === 'number' ? r[6] : 0
    const colsVol = typeof r[12] === 'number' ? r[12] : 0
    sections.push({
      key: labelRaw,
      meta: FLOOR_MAP[labelRaw],
      wallsArea,
      colsVol,
      sourceRow: i + 1,
    })
  }
  return sections
}

// ---------- Main ----------

async function main() {
  console.log(`📂 Czytanie pliku: ${filePath}`)
  console.log(`📑 Arkusz: ${SHEET_NAME}`)

  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[SHEET_NAME]
  if (!ws) {
    console.error(`❌ Brak arkusza "${SHEET_NAME}" w pliku`)
    process.exit(1)
  }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const sections = parseSections(rows)
  if (sections.length === 0) {
    console.error('❌ Nie znaleziono żadnej sekcji kondygnacji w arkuszu')
    process.exit(1)
  }

  // Sprawdź zakres
  const scope = await prisma.workScope.findUnique({ where: { slug: SCOPE_SLUG } })
  if (!scope) {
    console.error(
      `❌ Brak zakresu "${SCOPE_SLUG}" w bazie. ` +
        `Najpierw odpal: node scripts/import-obmiar.js`,
    )
    process.exit(1)
  }
  console.log(`✓ Zakres: ${scope.name}`)
  console.log(`✓ Znaleziono ${sections.length} sekcji kondygnacji w pliku\n`)

  // Wyczyść poprzedni import Konrada (po source) — idempotencja
  const oldSummaries = await prisma.floorSummary.findMany({
    where: {
      scopeId: scope.id,
      source: { contains: 'Przedmiar Konrad' },
    },
    select: { id: true, floor: true },
  })
  if (oldSummaries.length) {
    await prisma.floorSummary.deleteMany({
      where: { id: { in: oldSummaries.map((s) => s.id) } },
    })
    console.log(`🗑️  Usunięto poprzedni import Konrada: ${oldSummaries.length} kondygnacji\n`)
  }

  let totalCreated = 0
  for (const sec of sections) {
    const isParter = sec.key === 'parter'

    // Używamy standardowych enum kluczy (PARTER, I_PIETRO, ...) — zgodnie z UI.
    // Konrad to "źródło prawdy" tej kondygnacji w istniejącym frameworku.
    // Jeśli kiedyś będzie potrzeba dwóch źródeł (Konrad + inny kierownik) —
    // schema będzie wymagać rozszerzenia.
    const floorKey = sec.meta.floor

    // Usuń istniejący summary dla tej kondygnacji+zakresu (idempotencja)
    await prisma.floorSummary.deleteMany({
      where: { scopeId: scope.id, floor: floorKey },
    })

    const summary = await prisma.floorSummary.create({
      data: {
        scopeId: scope.id,
        floor: floorKey,
        source: SOURCE_LABEL,
      },
    })

    let pos = 1
    if (sec.wallsArea > 0) {
      const rule = buildWallsRule(sec.meta.marafFloor, isParter)
      await prisma.floorSummaryItem.create({
        data: {
          summaryId: summary.id,
          position: pos++,
          name: `Ściany żelbetowe — ${sec.meta.label} (Konrad)`,
          unit: 'm2',
          laborQty: round2(sec.wallsArea),
          concreteVol: 0,
          rebarMass: 0,
          matchMode: 'AUTO_OK',
          mappingRule: JSON.stringify(rule),
        },
      })
      totalCreated++
    }
    if (sec.colsVol > 0) {
      const rule = buildColumnsRule(sec.meta.marafFloor, isParter)
      await prisma.floorSummaryItem.create({
        data: {
          summaryId: summary.id,
          position: pos++,
          name: `Słupy/trzpienie żelbetowe — ${sec.meta.label} (Konrad)`,
          unit: 'm3',
          laborQty: 0,
          concreteVol: round2(sec.colsVol),
          rebarMass: 0,
          matchMode: 'AUTO_OK',
          mappingRule: JSON.stringify(rule),
        },
      })
      totalCreated++
    }

    console.log(
      `  ✓ ${sec.meta.label.padEnd(12)} ` +
        `ściany ${sec.wallsArea.toFixed(2).padStart(8)} m²   ` +
        `słupy/trzpienie ${sec.colsVol.toFixed(2).padStart(8)} m³`,
    )
  }

  console.log('')
  console.log(`✅ Zaimportowano ${totalCreated} pozycji w ${sections.length} kondygnacjach`)
  console.log(`   Otwórz w aplikacji: /przeroby/porownanie`)
}

function round2(n) {
  return Math.round(n * 100) / 100
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
