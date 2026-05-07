import * as XLSX from 'xlsx'
import { prisma } from './prisma'

// =====================================================================
// STRATEGIA PORÓWNANIA Maraf vs Konrad
// =====================================================================
// Konrad podaje ŚCIANY w m² (powierzchnia jednej strony szalunku, netto otworów).
// Maraf w bazie ma:
//   - areaM2 = footprint (rzut poziomy ściany) — BEZSENSOWNE do porównania
//   - volumeM3 = objętość ściany — TO PORÓWNUJEMY
// Konwersja: Konrad m² × grubość (zwykle 0.18 m) = m³ → porównujemy z Maraf volumeM3.
//
// W xlsx Konrada arkusz "Ściany i słupy żelb." ma sekcje per kondygnacja
// z header'em + suma m² ścian (kol G, idx 6) i suma m³ słupów (kol M, idx 12).
// Pod headerem są sub-wiersze z grubością (kolumna "gr", idx 4) — czytamy
// żeby przelicznik m² → m³ był dokładny per kondygnacja.
//
// Dla pozycji których Konrad NIE PODAJE w detalu (stropy, belki, fundamenty,
// szyby, biegi, atyki dachu) — tworzymy pozycje z matchMode=MANUAL_NOT_FOUND
// i Maraf wyliczonym z reguły. Kierownik wpisze wartość ręcznie w UI
// (pole `manualValue` — istniejący feature).
//
// Idempotency: przy reimporcie zachowujemy manualValue/manualNote/accepted
// z istniejących pozycji (po normalizacji name).
// =====================================================================

const SHEET_NAME = 'Ściany i słupy żelb.'
const SCOPE_SLUG = 'konstrukcja-zelbetowa'
const SOURCE_LABEL = `Przedmiar Konrad — ${SHEET_NAME}`

const DEFAULT_WALL_THICKNESS_M = 0.18

// Kolumny w xlsx Konrada (arkusz "Ściany i słupy żelb.")
const COL = {
  floorLabel: 1,    // B: "parter"/"Ip"/"IIp"/...
  category: 2,      // C: "ściany" (sygnatura header sekcji)
  wallsArea: 6,     // G: suma m² ścian
  thickness: 4,     // E: grubość ścian (cm) — w wierszu sub-headera
  colsLabel: 8,     // I: "parter"/"Ip"/...
  colsType: 9,      // J: "słupy"
  colsVol: 12,      // M: suma m³ słupów/trzpieni
} as const

// Mapowanie label kondygnacji w xlsx Konrada → enum FloorSummary.floor
type FloorMeta = {
  floor: string
  marafFloor: string
  label: string
  order: number
}
const FLOOR_MAP: Record<string, FloorMeta> = {
  parter: { floor: 'PARTER',     marafFloor: 'Kondygnacja 0',     label: 'parter',     order: 1 },
  Ip:     { floor: 'I_PIETRO',   marafFloor: 'Kondygnacja 1',     label: 'I piętro',   order: 2 },
  IIp:    { floor: 'II_PIETRO',  marafFloor: 'Kondygnacja 2',     label: 'II piętro',  order: 3 },
  IIIp:   { floor: 'III_PIETRO', marafFloor: 'Kondygnacja 3',     label: 'III piętro', order: 4 },
  IVp:    { floor: 'IV_PIETRO',  marafFloor: 'Kondygnacja 4',     label: 'IV piętro',  order: 5 },
}

// Sztywne kondygnacje które są w obmiarze Maraf, ale nie ma ich w xlsx Konrada
// (zawsze MANUAL_NOT_FOUND, ale chcemy je widzieć w UI):
const FLOOR_DACH: FloorMeta = {
  floor: 'DACH',
  marafFloor: 'Kondygnacja Dachu',
  label: 'dach',
  order: 6,
}

const FLOOR_DISPLAY: Record<string, string> = {
  PARTER: 'Parter',
  I_PIETRO: 'I piętro',
  II_PIETRO: 'II piętro',
  III_PIETRO: 'III piętro',
  IV_PIETRO: 'IV piętro',
  V_PIETRO: 'V piętro',
  DACH: 'Dach',
}

// =====================================================================
// Definicje pozycji per kondygnacja
// =====================================================================

type MappingRule = {
  categoryName: string | string[]
  elementType?: string | string[]
  floor?: string
  agg: 'volumeSum' | 'areaSum'
}

type FromKonrad = 'walls_to_volume' | 'cols_volume' | null

type PositionDef = {
  name: string
  unit: 'm2' | 'm3'
  fromKonrad: FromKonrad // null → MANUAL_NOT_FOUND
  rule: MappingRule
  matchMode: 'AUTO_OK' | 'MANUAL_NOT_FOUND' | 'MANUAL_FLOOR_SPLIT'
  matchReason?: string
}

function buildPositionsForFloor(meta: FloorMeta): PositionDef[] {
  const isParter = meta.floor === 'PARTER'
  const isDach = meta.floor === 'DACH'
  const m = meta.marafFloor

  if (isDach) {
    return [
      {
        name: 'Atyki dachu',
        unit: 'm3',
        fromKonrad: null,
        rule: { categoryName: 'Belki nadziemia', floor: m, agg: 'volumeSum' },
        matchMode: 'MANUAL_NOT_FOUND',
        matchReason: 'Konrad nie wyodrębnia atyk dachu — uzupełnij ręcznie z innego źródła.',
      },
      {
        name: 'Płyta stropowa dachu',
        unit: 'm2',
        fromKonrad: null,
        rule: { categoryName: 'Stropy nadziemia', elementType: 'Płyta stropowa', floor: m, agg: 'areaSum' },
        matchMode: 'MANUAL_NOT_FOUND',
        matchReason: 'Konrad nie wyodrębnia płyty dachu — uzupełnij ręcznie.',
      },
    ]
  }

  if (isParter) {
    return [
      {
        name: 'Fundamenty (ławy + stopy + płyty)',
        unit: 'm3',
        fromKonrad: null,
        rule: { categoryName: 'Fundamenty', agg: 'volumeSum' },
        matchMode: 'MANUAL_NOT_FOUND',
        matchReason: 'Konrad nie podaje detalu fundamentów per kondygnacja — uzupełnij ręcznie.',
      },
      {
        name: 'Ściany żelbetowe parteru',
        unit: 'm3',
        fromKonrad: 'walls_to_volume',
        rule: { categoryName: 'Piony 0', elementType: ['Ściany 0', 'Ścianki fund.'], floor: m, agg: 'volumeSum' },
        matchMode: 'AUTO_OK',
      },
      {
        name: 'Słupy/trzpienie parteru',
        unit: 'm3',
        fromKonrad: 'cols_volume',
        rule: { categoryName: 'Piony 0', elementType: ['Słupy 0', 'Trzpienie 0'], floor: m, agg: 'volumeSum' },
        matchMode: 'AUTO_OK',
      },
      {
        name: 'Strop nad parterem',
        unit: 'm2',
        fromKonrad: null,
        rule: { categoryName: 'Strop nad 0', elementType: 'Płyta stropowa', agg: 'areaSum' },
        matchMode: 'MANUAL_NOT_FOUND',
        matchReason: 'Konrad nie podaje detalu stropu per kondygnacja — uzupełnij m² stropu nad parterem.',
      },
      {
        name: 'Belki nad parterem',
        unit: 'm3',
        fromKonrad: null,
        rule: { categoryName: 'Belki nad 0', agg: 'volumeSum' },
        matchMode: 'MANUAL_NOT_FOUND',
        matchReason: 'Konrad nie podaje detalu belek/wieńców/nadproży nad parterem — uzupełnij m³ łącznie.',
      },
      {
        name: 'Biegi schodowe (parter → I piętro)',
        unit: 'm3',
        fromKonrad: null,
        rule: { categoryName: 'Biegi schodowe', floor: m, agg: 'volumeSum' },
        matchMode: 'MANUAL_NOT_FOUND',
        matchReason: 'Konrad nie podaje biegów schodowych — uzupełnij m³ biegów na poziom I piętra.',
      },
      {
        name: 'Szyby windowe (cała konstrukcja)',
        unit: 'm3',
        fromKonrad: null,
        rule: { categoryName: 'Szyby windowe', agg: 'volumeSum' },
        matchMode: 'MANUAL_FLOOR_SPLIT',
        matchReason: 'Maraf liczy szyby zbiorczo (cała wysokość). Konrad nie wyodrębnia — uzupełnij m³ łącznie albo podziel ręcznie per kondygnacja.',
      },
    ]
  }

  // Kondygnacje I-IV piętro
  return [
    {
      name: `Ściany żelbetowe ${meta.label}`,
      unit: 'm3',
      fromKonrad: 'walls_to_volume',
      rule: { categoryName: 'Piony nadziemia', elementType: 'Ściany nadziemia', floor: m, agg: 'volumeSum' },
      matchMode: 'AUTO_OK',
    },
    {
      name: `Trzpienie żelbetowe ${meta.label}`,
      unit: 'm3',
      fromKonrad: 'cols_volume',
      rule: { categoryName: 'Piony nadziemia', elementType: 'Trzpienie nadziemia', floor: m, agg: 'volumeSum' },
      matchMode: 'AUTO_OK',
    },
    {
      name: `Strop nad ${meta.label}`,
      unit: 'm2',
      fromKonrad: null,
      rule: { categoryName: 'Stropy nadziemia', elementType: 'Płyta stropowa', floor: m, agg: 'areaSum' },
      matchMode: 'MANUAL_NOT_FOUND',
      matchReason: `Konrad nie podaje detalu stropu — uzupełnij m² stropu nad ${meta.label}.`,
    },
    {
      name: `Belki nad ${meta.label}`,
      unit: 'm3',
      fromKonrad: null,
      rule: { categoryName: 'Belki nadziemia', floor: m, agg: 'volumeSum' },
      matchMode: 'MANUAL_NOT_FOUND',
      matchReason: `Konrad nie podaje detalu belek — uzupełnij m³ belek/wieńców/nadproży nad ${meta.label}.`,
    },
    {
      name: `Biegi schodowe (${meta.label} → wyżej)`,
      unit: 'm3',
      fromKonrad: null,
      rule: { categoryName: 'Biegi schodowe', floor: m, agg: 'volumeSum' },
      matchMode: 'MANUAL_NOT_FOUND',
      matchReason: 'Konrad nie podaje biegów schodowych — uzupełnij m³ biegów.',
    },
  ]
}

// =====================================================================
// Typy publiczne (zwracane do API/UI)
// =====================================================================

export type SectionParsed = {
  key: string
  meta: FloorMeta
  wallsArea: number // m² ścian z xlsx (suma kondygnacji)
  wallsThicknessM: number // grubość ścian (m), z xlsx lub default 0.18
  colsVol: number // m³ słupów/trzpieni z xlsx
  sourceRow: number
  fromXlsx: boolean // czy sekcja pochodzi z xlsx, czy jest "wymyślona" (DACH, brakujące piętra)
}

export type PreviewItem = {
  position: number
  name: string
  unit: string
  matchMode: string
  konradValue: number | null // wartość kierownika (m² lub m³) lub null jeśli manual
  konradNote: string | null
  existingManualValue: number | null // jeśli istnieje w bazie (zostanie zachowane)
  willBeReplaced: boolean
}

export type PreviewFloor = {
  floor: string
  floorLabel: string
  fromXlsx: boolean
  isNew: boolean // brak FloorSummary w bazie
  items: PreviewItem[]
}

export type PreviewResult = {
  floors: PreviewFloor[]
  unmappedSheets: string[]
  workScopeMissing: boolean
  totalItemsInPlan: number
  totalManualValuesPreserved: number
}

export type CommitResult = PreviewResult & {
  applied: {
    summariesCreated: number
    summariesReplaced: number
    itemsCreated: number
    manualValuesPreserved: number
  }
}

// =====================================================================
// Parser xlsx Konrada
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
    const labelRaw = String(r[COL.floorLabel] || '').trim()
    if (!FLOOR_MAP[labelRaw]) continue
    const colC = String(r[COL.category] || '').trim().toLowerCase()
    if (colC !== 'ściany') continue

    const meta = FLOOR_MAP[labelRaw]
    const wallsArea = typeof r[COL.wallsArea] === 'number' ? round2(r[COL.wallsArea] as number) : 0
    const colsVol = typeof r[COL.colsVol] === 'number' ? round2(r[COL.colsVol] as number) : 0

    // Grubość — szukamy w wierszach pod headerem (zwykle wiersz +2 do +5)
    let thicknessCm = 0
    for (let j = i + 1; j < Math.min(i + 8, rows.length); j++) {
      const sub = rows[j]
      if (!sub) continue
      const t = sub[COL.thickness]
      if (typeof t === 'number' && t > 0 && t < 100) {
        thicknessCm = t
        break
      }
    }
    const wallsThicknessM = thicknessCm > 0 ? thicknessCm / 100 : DEFAULT_WALL_THICKNESS_M

    sections.push({
      key: labelRaw,
      meta,
      wallsArea,
      wallsThicknessM: round3(wallsThicknessM),
      colsVol,
      sourceRow: i + 1,
      fromXlsx: true,
    })
  }

  // Pozostałe arkusze (info)
  const unmappedSheets = wb.SheetNames.filter((n) => n !== SHEET_NAME)

  return { sections, unmappedSheets }
}

// =====================================================================
// Pełna lista sekcji do zaimportowania (xlsx + brakujące + DACH)
// =====================================================================

function buildAllSections(parsed: SectionParsed[]): SectionParsed[] {
  // Zbierz wszystkie kondygnacje od PARTER do max(IVp, max-z-xlsx)
  const fromXlsxByFloor = new Map(parsed.map((p) => [p.meta.floor, p]))
  const allMetas: FloorMeta[] = [
    FLOOR_MAP.parter,
    FLOOR_MAP.Ip,
    FLOOR_MAP.IIp,
    FLOOR_MAP.IIIp,
    FLOOR_MAP.IVp,
  ]
  const result: SectionParsed[] = allMetas.map((meta) => {
    const p = fromXlsxByFloor.get(meta.floor)
    if (p) return p
    return {
      key: meta.label,
      meta,
      wallsArea: 0,
      wallsThicknessM: DEFAULT_WALL_THICKNESS_M,
      colsVol: 0,
      sourceRow: 0,
      fromXlsx: false,
    }
  })
  // Plus DACH
  result.push({
    key: 'dach',
    meta: FLOOR_DACH,
    wallsArea: 0,
    wallsThicknessM: DEFAULT_WALL_THICKNESS_M,
    colsVol: 0,
    sourceRow: 0,
    fromXlsx: false,
  })
  return result
}

// =====================================================================
// Wyliczanie wartości Konrada per pozycja
// =====================================================================

function computeKonradValue(
  pos: PositionDef,
  sec: SectionParsed,
): { value: number; note: string | null } {
  if (pos.fromKonrad === 'walls_to_volume') {
    if (sec.wallsArea === 0) return { value: 0, note: null }
    const m3 = round2(sec.wallsArea * sec.wallsThicknessM)
    return {
      value: m3,
      note: `Konrad: ${sec.wallsArea.toLocaleString('pl-PL')} m² × ${sec.wallsThicknessM} m grubości = ${m3} m³`,
    }
  }
  if (pos.fromKonrad === 'cols_volume') {
    return { value: sec.colsVol, note: null }
  }
  return { value: 0, note: null }
}

// =====================================================================
// Preview
// =====================================================================

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

export async function buildPreview(buffer: Buffer): Promise<PreviewResult> {
  const { sections: parsed, unmappedSheets } = parseSheet(buffer)

  const scope = await prisma.workScope.findUnique({ where: { slug: SCOPE_SLUG } })
  if (!scope) {
    return {
      floors: [],
      unmappedSheets,
      workScopeMissing: true,
      totalItemsInPlan: 0,
      totalManualValuesPreserved: 0,
    }
  }

  const allSections = buildAllSections(parsed)

  // Pobierz istniejące summaries + items (dla zachowania manualValue)
  const existingSummaries = await prisma.floorSummary.findMany({
    where: { scopeId: scope.id },
    include: { items: true },
  })
  const existingByFloor = new Map(existingSummaries.map((s) => [s.floor, s]))

  // Mapa: floor + normalizedName → manualValue
  const existingManualMap = new Map<string, number>()
  let totalManualPreserved = 0
  for (const s of existingSummaries) {
    for (const it of s.items) {
      if (it.manualValue != null) {
        const key = `${s.floor}||${normalizeName(it.name)}`
        existingManualMap.set(key, it.manualValue)
        totalManualPreserved++
      }
    }
  }

  let totalItems = 0
  const floors: PreviewFloor[] = allSections.map((sec) => {
    const positions = buildPositionsForFloor(sec.meta)
    const exist = existingByFloor.get(sec.meta.floor)
    const items: PreviewItem[] = positions.map((pos, idx) => {
      const { value: konradValue, note: konradNote } = computeKonradValue(pos, sec)
      const manualKey = `${sec.meta.floor}||${normalizeName(pos.name)}`
      const existingManualValue = existingManualMap.get(manualKey) ?? null
      return {
        position: idx + 1,
        name: pos.name,
        unit: pos.unit,
        matchMode: pos.matchMode,
        konradValue: pos.fromKonrad ? konradValue : null,
        konradNote,
        existingManualValue,
        willBeReplaced: !!exist,
      }
    })
    totalItems += items.length
    return {
      floor: sec.meta.floor,
      floorLabel: FLOOR_DISPLAY[sec.meta.floor] || sec.meta.label,
      fromXlsx: sec.fromXlsx,
      isNew: !exist,
      items,
    }
  })

  return {
    floors,
    unmappedSheets,
    workScopeMissing: false,
    totalItemsInPlan: totalItems,
    totalManualValuesPreserved: totalManualPreserved,
  }
}

// =====================================================================
// Commit
// =====================================================================

export async function commitImport(buffer: Buffer, userEmail: string | null = null): Promise<CommitResult> {
  const preview = await buildPreview(buffer)
  if (preview.workScopeMissing) {
    throw new Error(
      `Brak zakresu "${SCOPE_SLUG}" w bazie. Najpierw zaimportuj obmiar Maraf przez skrypt CLI.`,
    )
  }

  const scope = await prisma.workScope.findUnique({ where: { slug: SCOPE_SLUG } })
  if (!scope) throw new Error(`Zakres "${SCOPE_SLUG}" zniknął w trakcie operacji`)

  const { sections: parsedSections } = parseSheet(buffer)
  const allSections = buildAllSections(parsedSections)

  // Mapa do zachowania manualValue/note/accepted + poprzednia wartość Konrada
  // (do log REIMPORT) + historia (do odtworzenia po cascade delete)
  type PreservedItem = {
    manualValue: number | null
    manualNote: string | null
    accepted: boolean
    acceptedAt: Date | null
    acceptedNote: string | null
    prevKonradValue: number // poprzednia wartość Konrada (m² lub m³, w zależności od unit)
    prevUnit: string
    history: Array<{
      action: string
      oldValue: string | null
      newValue: string | null
      note: string | null
      userEmail: string | null
      createdAt: Date
    }>
  }
  const preserveMap = new Map<string, PreservedItem>()
  const existingForPreserve = await prisma.floorSummary.findMany({
    where: { scopeId: scope.id },
    include: {
      items: {
        include: {
          history: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  })
  for (const s of existingForPreserve) {
    for (const it of s.items) {
      const key = `${s.floor}||${normalizeName(it.name)}`
      // Poprzednia wartość Konrada — zależy od jednostki
      const prevKonrad = it.unit === 'm2' ? it.laborQty : it.concreteVol
      preserveMap.set(key, {
        manualValue: it.manualValue,
        manualNote: it.manualNote,
        accepted: it.accepted,
        acceptedAt: it.acceptedAt,
        acceptedNote: it.acceptedNote,
        prevKonradValue: prevKonrad,
        prevUnit: it.unit,
        history: it.history.map((h) => ({
          action: h.action,
          oldValue: h.oldValue,
          newValue: h.newValue,
          note: h.note,
          userEmail: h.userEmail,
          createdAt: h.createdAt,
        })),
      })
    }
  }

  let summariesCreated = 0
  let summariesReplaced = 0
  let itemsCreated = 0
  let manualValuesPreserved = 0

  await prisma.$transaction(async (tx) => {
    for (const sec of allSections) {
      const positions = buildPositionsForFloor(sec.meta)

      const existing = await tx.floorSummary.findFirst({
        where: { scopeId: scope.id, floor: sec.meta.floor },
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
          floor: sec.meta.floor,
          source: SOURCE_LABEL,
        },
      })

      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i]
        const { value: konradValue } = computeKonradValue(pos, sec)

        // Zachowanie manualValue/note/accepted z poprzedniego importu
        const preserveKey = `${sec.meta.floor}||${normalizeName(pos.name)}`
        const preserved = preserveMap.get(preserveKey)
        if (preserved && (preserved.manualValue != null || preserved.accepted)) {
          manualValuesPreserved++
        }

        const isM2 = pos.unit === 'm2'
        const data: any = {
          summaryId: summary.id,
          position: i + 1,
          name: pos.name,
          unit: pos.unit,
          laborQty: isM2 ? konradValue : 0,
          concreteVol: !isM2 ? konradValue : 0,
          rebarMass: 0,
          matchMode: pos.matchMode,
          matchReason: pos.matchReason || null,
          mappingRule: JSON.stringify(pos.rule),
          manualValue: preserved?.manualValue ?? null,
          manualNote: preserved?.manualNote ?? null,
          accepted: preserved?.accepted ?? false,
          acceptedAt: preserved?.acceptedAt ?? null,
          acceptedNote: preserved?.acceptedNote ?? null,
        }

        const created = await tx.floorSummaryItem.create({ data })
        itemsCreated++

        // Odtwórz historię z poprzedniego itemu (cascade delete by ją skasował)
        if (preserved && preserved.history.length > 0) {
          await tx.floorSummaryItemHistory.createMany({
            data: preserved.history.map((h) => ({
              itemId: created.id,
              action: h.action,
              oldValue: h.oldValue,
              newValue: h.newValue,
              note: h.note,
              userEmail: h.userEmail,
              createdAt: h.createdAt,
            })),
          })
        }

        // Wpis REIMPORT — jeśli wartość Konrada się zmieniła w stosunku do poprzedniej
        if (preserved) {
          const prev = preserved.prevKonradValue
          const curr = konradValue
          if (Math.abs(prev - curr) > 0.01 || preserved.prevUnit !== pos.unit) {
            await tx.floorSummaryItemHistory.create({
              data: {
                itemId: created.id,
                action: 'REIMPORT',
                oldValue: JSON.stringify({ value: prev, unit: preserved.prevUnit }),
                newValue: JSON.stringify({ value: curr, unit: pos.unit }),
                note: 'Reimport pliku Konrada — wartość zaktualizowana',
                userEmail,
              },
            })
          }
        }
      }
    }
  })

  return {
    ...preview,
    applied: {
      summariesCreated,
      summariesReplaced,
      itemsCreated,
      manualValuesPreserved,
    },
  }
}

// =====================================================================
// Helpers
// =====================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export const FLOOR_LABELS = FLOOR_DISPLAY
