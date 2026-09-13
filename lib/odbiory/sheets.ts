// Arkusze rzutów dla modułu Odbiory (SERWER: fs + Prisma).
// Dwa źródła:
//  1. PROJEKT WYKONAWCZY — public/rzuty/pw/sheets.json + *.webp (pipeline
//     scripts/extract-pw-sheets.mjs): wycinki rzutów kondygnacji 1:50 z lokalami,
//     pomieszczeniami (kod lokalu, nazwa, powierzchnia) i kotwicami klatek. DOMYŚLNE.
//  2. Rzuty marketingowe — public/rzuty/markers.json + PNG (moduł Rzuty); ręczne obrysy
//     z edytora /rzuty (Settings 'rzuty.shapes') nadpisują obwiednie, jak na /rzuty.
// Współrzędne pinezek = układ arkusza (PlanSheet.width × height, pt); obraz może mieć inną
// rozdzielczość (PW: ×1.5), klient i PDF skalują proporcjonalnie.

import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { staircaseOf } from '@/lib/floorplan'
import type { SheetMarker, SheetRoom, SheetUnitMarker } from './geometry'
import { buildingName, floorName } from './codes'

export type MarkersFloor = { file: string; image: string; width: number; height: number; markers: SheetMarker[] }
export type MarkersFile = { generatedAt?: string; floors: Record<string, MarkersFloor> }

export type PwSheet = {
  key: string
  kind: string
  name: string
  building: string
  floor: number | null
  image: string
  imageScale: number
  width: number
  height: number
  stairs: { letter: string; x: number; y: number }[]
  markers: (SheetMarker & { staircase: string | null; rooms: number })[]
  rooms: SheetRoom[]
}
export type PwManifest = { generatedAt?: string; imageScale?: number; sheets: PwSheet[] }

type Cached<T> = { mtimeMs: number; data: T }
let markersCache: Cached<MarkersFile> | null = null
let pwCache: Cached<PwManifest> | null = null

function readJsonCached<T>(file: string, cache: Cached<T> | null, set: (c: Cached<T>) => void): T | null {
  try {
    const stat = fs.statSync(file)
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.data
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as T
    set({ mtimeMs: stat.mtimeMs, data })
    return data
  } catch {
    return null
  }
}

export function markersPath(): string {
  return path.join(process.cwd(), 'public', 'rzuty', 'markers.json')
}
export function pwManifestPath(): string {
  return path.join(process.cwd(), 'public', 'rzuty', 'pw', 'sheets.json')
}

export function loadMarkers(): MarkersFile | null {
  return readJsonCached<MarkersFile>(markersPath(), markersCache, (c) => (markersCache = c))
}
export function loadPwManifest(): PwManifest | null {
  return readJsonCached<PwManifest>(pwManifestPath(), pwCache, (c) => (pwCache = c))
}
export function isPwKey(key: string | null | undefined): boolean {
  return !!key && key.startsWith('pw-')
}
export function getPwSheet(key: string | null | undefined): PwSheet | null {
  if (!isPwKey(key)) return null
  return loadPwManifest()?.sheets.find((s) => s.key === key) || null
}

export type FloorEntry = {
  key: string
  floor: number | null
  label: string
  image: string
  width: number
  height: number
  kind: string
  source: 'PW' | 'MARKETING'
  unitCount: number
}

/** Arkusze do wyboru w kreatorze: najpierw projekt wykonawczy, potem rzuty marketingowe. */
export function floorEntries(): FloorEntry[] {
  const out: FloorEntry[] = []
  const pw = loadPwManifest()
  if (pw) {
    for (const s of pw.sheets) {
      out.push({
        key: s.key,
        floor: s.floor,
        label: `${s.floor == null ? s.name : floorName(s.floor)} · projekt wykonawczy`,
        image: s.image,
        width: s.width,
        height: s.height,
        kind: s.kind || 'FLOOR',
        source: 'PW',
        unitCount: s.markers.length,
      })
    }
  }
  const data = loadMarkers()
  if (data) {
    const keys = Object.keys(data.floors)
    const numeric = keys.filter((k) => /^-?\d+$/.test(k)).sort((a, b) => Number(a) - Number(b))
    const other = keys.filter((k) => !/^-?\d+$/.test(k))
    for (const key of [...numeric, ...other]) {
      const f = data.floors[key]
      const floor = /^-?\d+$/.test(key) ? Number(key) : null
      out.push({
        key,
        floor,
        label: `${floorName(floor, key)} · rzut marketingowy`,
        image: `/rzuty/${f.image}`,
        width: f.width,
        height: f.height,
        kind: key === 'pzt' ? 'PZT' : 'FLOOR',
        source: 'MARKETING',
        unitCount: f.markers.length,
      })
    }
  }
  return out
}

/** Upsert arkusza dla klucza (PW albo markers.json) — jeden arkusz per inwestycja i klucz. */
export async function ensureSheet(investmentId: string, markersKey: string, building: string | null) {
  const entry = floorEntries().find((e) => e.key === markersKey)
  if (!entry) throw new Error(`Brak arkusza „${markersKey}" (public/rzuty)`)
  const existing = await prisma.planSheet.findUnique({ where: { investmentId_markersKey: { investmentId, markersKey } } })
  if (existing) {
    // odśwież rozmiar/obraz, gdyby podkład został przegenerowany
    if (existing.width !== entry.width || existing.height !== entry.height || existing.imageUrl !== entry.image) {
      return prisma.planSheet.update({
        where: { id: existing.id },
        data: { width: entry.width, height: entry.height, imageUrl: entry.image },
      })
    }
    return existing
  }
  return prisma.planSheet.create({
    data: {
      investmentId,
      kind: entry.kind,
      name: entry.source === 'PW' ? entry.label.replace(' · projekt wykonawczy', ' (PW)') : entry.label.replace(' · rzut marketingowy', ''),
      building: entry.kind === 'PZT' ? null : buildingName(building),
      floor: entry.floor,
      markersKey,
      imageUrl: entry.image,
      width: entry.width,
      height: entry.height,
    },
  })
}

/** Znaczniki lokali na arkuszu wzbogacone o id lokalu i klatkę (do hit-testu pinezek). */
export async function getSheetMarkers(markersKey: string | null): Promise<SheetUnitMarker[]> {
  if (!markersKey) return []
  let markers: (SheetMarker & { staircase?: string | null })[] = []
  const pw = getPwSheet(markersKey)
  if (pw) {
    markers = pw.markers.map((m) => ({ number: m.number, kind: m.kind, x: m.x, y: m.y, box: m.box, staircase: m.staircase }))
  } else {
    const data = loadMarkers()
    const floor = data?.floors[markersKey]
    if (!floor) return []
    markers = floor.markers.map((m) => ({ ...m, poly: m.poly ? [...m.poly] : undefined }))
    const shapesRow = await prisma.settings.findUnique({ where: { key: 'rzuty.shapes' } })
    if (shapesRow) {
      try {
        const shapes = JSON.parse(shapesRow.value) as Record<string, Record<string, [number, number][]>>
        const floorShapes = shapes[markersKey]
        if (floorShapes) {
          for (const m of markers) {
            const pts = floorShapes[m.number]
            if (pts && pts.length >= 3) m.poly = pts
          }
        }
      } catch {}
    }
  }

  const numbers = markers.map((m) => m.number)
  const units = await prisma.unit.findMany({
    where: { number: { in: numbers } },
    select: { id: true, number: true, building: true },
  })
  const byNumber = new Map(units.map((u) => [u.number, u]))
  return markers.map((m) => {
    const u = byNumber.get(m.number)
    const { staircase, ...rest } = m
    return { ...rest, unitId: u?.id ?? null, staircase: (u ? staircaseOf(u.building) : null) ?? staircase ?? null }
  })
}

/** Pomieszczenia z projektu wykonawczego (puste dla rzutów marketingowych). */
export function getSheetRooms(markersKey: string | null): SheetRoom[] {
  const pw = getPwSheet(markersKey)
  return pw ? pw.rooms : []
}

export type InvestmentStructure = {
  id: string
  name: string
  code: string | null
  buildings: {
    name: string
    staircases: string[]
    floors: { key: string; floor: number | null; label: string; unitCount: number; source: 'PW' | 'MARKETING' }[]
  }[]
}

/** Struktura do kreatora: Projekt → Budynek → Klatka → Kondygnacja (Unit + manifesty rzutów). */
export async function getInvestmentStructure(investmentId: string): Promise<InvestmentStructure | null> {
  const inv = await prisma.investment.findUnique({ where: { id: investmentId }, select: { id: true, name: true } })
  if (!inv) return null
  const units = await prisma.unit.findMany({ select: { number: true, building: true, floor: true, type: true } })
  const entries = floorEntries()

  const buildings = new Map<string, Set<string>>()
  for (const u of units) {
    const b = buildingName(u.building)
    let rec = buildings.get(b)
    if (!rec) {
      rec = new Set()
      buildings.set(b, rec)
    }
    const st = staircaseOf(u.building)
    if (st) rec.add(st)
  }
  if (buildings.size === 0) buildings.set('B1', new Set())
  // klatki z projektu wykonawczego (kotwice B1.<p>.K.<litera>), gdy lokale w bazie ich nie mają
  const pw = loadPwManifest()
  if (pw) {
    const letters = new Set<string>()
    for (const s of pw.sheets) for (const st of s.stairs) letters.add(st.letter)
    for (const [name, rec] of buildings) {
      if (rec.size === 0 && name === 'B1') for (const l of letters) rec.add(l)
    }
  }

  return {
    id: inv.id,
    name: inv.name,
    code: null,
    buildings: [...buildings.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'pl', { numeric: true }))
      .map(([name, rec]) => ({
        name,
        staircases: [...rec].sort(),
        floors: entries.map((e) => ({ key: e.key, floor: e.floor, label: e.label, unitCount: e.unitCount, source: e.source })),
      })),
  }
}
