import * as XLSX from 'xlsx'
import { prisma } from './prisma'

// =====================================================================
// Format pliku xlsx Konrada (arkusz "Ściany i słupy żelb."):
//   Kolumna B (idx 1): label kondygnacji ("parter", "Ip", "IIp", ...)
//                      tylko w nagłówkowych wierszach sekcji
//   Kolumna C (idx 2): "ściany" (sygnatura że to nagłówek sekcji)
//   Kolumna G (idx 6): suma m² ścian dla tej kondygnacji
//   Kolumna I (idx 8): label kondygnacji (drugi raz, sekcja słupów)
//   Kolumna J (idx 9): "słupy"
//   Kolumna M (idx 12): suma m³ słupów dla tej kondygnacji
// =====================================================================

const SHEET_NAME = 'Ściany i słupy żelb.'
const SCOPE_SLUG = 'konstrukcja-zelbetowa'
const SOURCE_LABEL = `Przedmiar Konrad — ${SHEET_NAME}`

// Mapowanie kondygnacji: klucz w xlsx → enum FloorSummary.floor + nazwa kondygnacji w Maraf
const FLOOR_MAP: Record<
  string,
  { floor: string; marafFloor: string; label: string }
> = {
  parter:  { floor: 'PARTER',     marafFloor: 'Kondygnacja 0', label: 'parter' },
  Ip:      { floor: 'I_PIETRO',   marafFloor: 'Kondygnacja 1', label: 'I piętro' },
  IIp:     { floor: 'II_PIETRO',  marafFloor: 'Kondygnacja 2', label: 'II piętro' },
  IIIp:    { floor: 'III_PIETRO', marafFloor: 'Kondygnacja 3', label: 'III piętro' },
  IVp:     { floor: 'IV_PIETRO',  marafFloor: 'Kondygnacja 4', label: 'IV piętro' },
  Vp:      { floor: 'V_PIETRO',   marafFloor: 'Kondygnacja 5', label: 'V piętro' },
}

const FLOOR_DISPLAY: Record<string, string> = {
  PARTER: 'Parter',
  I_PIETRO: 'I piętro',
  II_PIETRO: 'II piętro',
  III_PIETRO: 'III piętro',
  IV_PIETRO: 'IV piętro',
  V_PIETRO: 'V piętro',
}

// =====================================================================
// Typy publiczne (zwracane do API/UI)
// =====================================================================

export type SectionParsed = {
  key: string // klucz w xlsx (parter, Ip, ...)
  floor: string // enum FloorSummary.floor (PARTER, I_PIETRO, ...)
  floorLabel: string // ładna etykieta ("parter", "I piętro", ...)
  marafFloor: string // klucz Maraf ("Kondygnacja 0", ...)
  wallsArea: number // m² ścian (suma kondygnacji z xlsx)
  colsVol: number // m³ słupów/trzpieni
  sourceRow: number // numer wiersza w xlsx (debug)
}

export type SectionDiff = SectionParsed & {
  existing: {
    wallsArea: number | null
    colsVol: number | null
  } | null // null = nic w bazie dla tej kondygnacji
  isNew: boolean
  changes: {
    wallsArea?: { old: number; new: number }
    colsVol?: { old: number; new: number }
  }
}

export type PreviewResult = {
  sections: SectionDiff[]
  unmappedSheets: string[] // arkusze które nie pasują do oczekiwanego formatu
  workScopeMissing: boolean // true = brak konstrukcja-zelbetowa w bazie
}

export type CommitResult = PreviewResult & {
  applied: {
    summariesCreated: number
    summariesReplaced: number
    itemsCreated: number
  }
}

// =====================================================================
// Parser
// =====================================================================

function parseSheet(buffer: Buffer): {
  sections: SectionParsed[]
  unmappedSheets: string[]
} {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[SHEET_NAME]
  if (!ws) {
    throw new Error(
      `W pliku nie ma wymaganego arkusza "${SHEET_NAME}". Znalezione arkusze: ${wb.SheetNames.join(', ')}`,
    )
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  const sections: SectionParsed[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const labelRaw = String(r[1] || '').trim()
    if (!FLOOR_MAP[labelRaw]) continue
    // Sprawdź czy to nagłówek sekcji (kol C ma "ściany")
    const colC = String(r[2] || '').trim().toLowerCase()
    if (colC !== 'ściany') continue

    const meta = FLOOR_MAP[labelRaw]
    const wallsArea = typeof r[6] === 'number' ? round2(r[6] as number) : 0
    const colsVol = typeof r[12] === 'number' ? round2(r[12] as number) : 0

    sections.push({
      key: labelRaw,
      floor: meta.floor,
      floorLabel: meta.label,
      marafFloor: meta.marafFloor,
      wallsArea,
      colsVol,
      sourceRow: i + 1,
    })
  }

  // Sprawdź pozostałe arkusze (informacyjnie — nie ważne, ale powiemy w UI)
  const unmappedSheets = wb.SheetNames.filter((n) => n !== SHEET_NAME)

  return { sections, unmappedSheets }
}

// =====================================================================
// Diff i commit
// =====================================================================

export async function buildPreview(buffer: Buffer): Promise<PreviewResult> {
  const { sections, unmappedSheets } = parseSheet(buffer)

  // Czy zakres istnieje?
  const scope = await prisma.workScope.findUnique({ where: { slug: SCOPE_SLUG } })
  if (!scope) {
    return {
      sections: sections.map((s) => ({
        ...s,
        existing: null,
        isNew: true,
        changes: {},
      })),
      unmappedSheets,
      workScopeMissing: true,
    }
  }

  // Pobierz istniejące FloorSummary dla tego zakresu
  const existing = await prisma.floorSummary.findMany({
    where: { scopeId: scope.id },
    select: {
      floor: true,
      items: { select: { unit: true, laborQty: true, concreteVol: true } },
    },
  })

  // Mapa floor → { wallsArea, colsVol } (z istniejących pozycji)
  const existingMap = new Map<string, { wallsArea: number; colsVol: number }>()
  for (const e of existing) {
    let walls = 0
    let cols = 0
    for (const it of e.items) {
      if (it.unit === 'm2') walls += it.laborQty
      if (it.unit === 'm3') cols += it.concreteVol
    }
    existingMap.set(e.floor, { wallsArea: round2(walls), colsVol: round2(cols) })
  }

  const sectionDiffs: SectionDiff[] = sections.map((s) => {
    const ex = existingMap.get(s.floor)
    const changes: SectionDiff['changes'] = {}
    if (ex) {
      if (Math.abs(ex.wallsArea - s.wallsArea) > 0.01) {
        changes.wallsArea = { old: ex.wallsArea, new: s.wallsArea }
      }
      if (Math.abs(ex.colsVol - s.colsVol) > 0.01) {
        changes.colsVol = { old: ex.colsVol, new: s.colsVol }
      }
    }
    return {
      ...s,
      existing: ex
        ? { wallsArea: ex.wallsArea, colsVol: ex.colsVol }
        : null,
      isNew: !ex,
      changes,
    }
  })

  return {
    sections: sectionDiffs,
    unmappedSheets,
    workScopeMissing: false,
  }
}

function buildWallsRule(marafFloor: string, isParter: boolean) {
  return {
    categoryName: isParter ? 'Piony 0' : 'Piony nadziemia',
    elementType: isParter ? 'Ściany 0' : 'Ściany nadziemia',
    floor: marafFloor,
    agg: 'areaSum',
  }
}

function buildColumnsRule(marafFloor: string, isParter: boolean) {
  return {
    categoryName: isParter ? 'Piony 0' : 'Piony nadziemia',
    elementType: isParter ? ['Słupy 0', 'Trzpienie 0'] : 'Trzpienie nadziemia',
    floor: marafFloor,
    agg: 'volumeSum',
  }
}

export async function commitImport(buffer: Buffer): Promise<CommitResult> {
  const preview = await buildPreview(buffer)
  if (preview.workScopeMissing) {
    throw new Error(
      `Brak zakresu "${SCOPE_SLUG}" w bazie. Najpierw zaimportuj obmiar Maraf przez skrypt CLI.`,
    )
  }

  const scope = await prisma.workScope.findUnique({ where: { slug: SCOPE_SLUG } })
  if (!scope) throw new Error(`Zakres "${SCOPE_SLUG}" zniknął w trakcie operacji`)

  let summariesCreated = 0
  let summariesReplaced = 0
  let itemsCreated = 0

  await prisma.$transaction(async (tx) => {
    for (const sec of preview.sections) {
      const isParter = sec.key === 'parter'

      // Sprawdź czy istnieje już FloorSummary
      const existing = await tx.floorSummary.findFirst({
        where: { scopeId: scope.id, floor: sec.floor },
      })
      if (existing) {
        await tx.floorSummary.delete({ where: { id: existing.id } })
        summariesReplaced++
      } else {
        summariesCreated++
      }

      const summary = await tx.floorSummary.create({
        data: {
          scopeId: scope.id,
          floor: sec.floor,
          source: SOURCE_LABEL,
        },
      })

      let pos = 1
      if (sec.wallsArea > 0) {
        await tx.floorSummaryItem.create({
          data: {
            summaryId: summary.id,
            position: pos++,
            name: `Ściany żelbetowe — ${sec.floorLabel} (Konrad)`,
            unit: 'm2',
            laborQty: sec.wallsArea,
            concreteVol: 0,
            rebarMass: 0,
            matchMode: 'AUTO_OK',
            mappingRule: JSON.stringify(buildWallsRule(sec.marafFloor, isParter)),
          },
        })
        itemsCreated++
      }
      if (sec.colsVol > 0) {
        await tx.floorSummaryItem.create({
          data: {
            summaryId: summary.id,
            position: pos++,
            name: `Słupy/trzpienie żelbetowe — ${sec.floorLabel} (Konrad)`,
            unit: 'm3',
            laborQty: 0,
            concreteVol: sec.colsVol,
            rebarMass: 0,
            matchMode: 'AUTO_OK',
            mappingRule: JSON.stringify(buildColumnsRule(sec.marafFloor, isParter)),
          },
        })
        itemsCreated++
      }
    }
  })

  return {
    ...preview,
    applied: { summariesCreated, summariesReplaced, itemsCreated },
  }
}

// =====================================================================
// Helpers
// =====================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export const FLOOR_LABELS = FLOOR_DISPLAY
