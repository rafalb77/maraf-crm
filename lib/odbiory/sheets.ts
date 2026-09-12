// Arkusze rzutów dla modułu Odbiory (SERWER: fs + Prisma).
// Źródło arkuszy kondygnacji: public/rzuty/markers.json + PNG (pipeline modułu Rzuty,
// scripts/extract-floorplan-markers.mjs). Ręczne obrysy z edytora /rzuty
// (Settings 'rzuty.shapes') nadpisują przybliżone obwiednie — tak jak na /rzuty.

import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { staircaseOf } from '@/lib/floorplan'
import type { SheetMarker, SheetUnitMarker } from './geometry'
import { buildingName, floorName } from './codes'

export type MarkersFloor = { file: string; image: string; width: number; height: number; markers: SheetMarker[] }
export type MarkersFile = { generatedAt?: string; floors: Record<string, MarkersFloor> }

let cache: { mtimeMs: number; data: MarkersFile } | null = null

export function markersPath(): string {
  return path.join(process.cwd(), 'public', 'rzuty', 'markers.json')
}

export function loadMarkers(): MarkersFile | null {
  try {
    const file = markersPath()
    const stat = fs.statSync(file)
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.data
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as MarkersFile
    cache = { mtimeMs: stat.mtimeMs, data }
    return data
  } catch {
    return null
  }
}

/** Kolejność i etykiety arkuszy kondygnacji z markers.json. */
export function floorEntries(): { key: string; floor: number | null; label: string; image: string; width: number; height: number }[] {
  const data = loadMarkers()
  if (!data) return []
  const keys = Object.keys(data.floors)
  const numeric = keys.filter((k) => /^-?\d+$/.test(k)).sort((a, b) => Number(a) - Number(b))
  const other = keys.filter((k) => !/^-?\d+$/.test(k))
  return [...numeric, ...other].map((key) => {
    const f = data.floors[key]
    const floor = /^-?\d+$/.test(key) ? Number(key) : null
    return { key, floor, label: floorName(floor, key), image: `/rzuty/${f.image}`, width: f.width, height: f.height }
  })
}

/** Upsert arkusza dla klucza z markers.json (jeden arkusz per inwestycja i klucz). */
export async function ensureSheet(investmentId: string, markersKey: string, building: string | null) {
  const entry = floorEntries().find((e) => e.key === markersKey)
  if (!entry) throw new Error(`Brak arkusza „${markersKey}" w markers.json`)
  const existing = await prisma.planSheet.findUnique({ where: { investmentId_markersKey: { investmentId, markersKey } } })
  if (existing) {
    // odśwież rozmiar/obraz gdyby PDF został podmieniony (PNG cache)
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
      kind: markersKey === 'pzt' ? 'PZT' : 'FLOOR',
      name: entry.label,
      building: markersKey === 'pzt' ? null : buildingName(building),
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
  const data = loadMarkers()
  const floor = data?.floors[markersKey]
  if (!floor) return []
  const markers: SheetMarker[] = floor.markers.map((m) => ({ ...m, poly: m.poly ? [...m.poly] : undefined }))

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

  const numbers = markers.map((m) => m.number)
  const units = await prisma.unit.findMany({
    where: { number: { in: numbers } },
    select: { id: true, number: true, building: true },
  })
  const byNumber = new Map(units.map((u) => [u.number, u]))
  return markers.map((m) => {
    const u = byNumber.get(m.number)
    return { ...m, unitId: u?.id ?? null, staircase: u ? staircaseOf(u.building) : null }
  })
}

export type InvestmentStructure = {
  id: string
  name: string
  code: string | null
  buildings: {
    name: string
    staircases: string[]
    floors: { key: string; floor: number | null; label: string; unitCount: number }[]
  }[]
}

/** Struktura do kreatora: Projekt → Budynek → Klatka → Kondygnacja (z Unit + markers.json). */
export async function getInvestmentStructure(investmentId: string): Promise<InvestmentStructure | null> {
  const inv = await prisma.investment.findUnique({ where: { id: investmentId }, select: { id: true, name: true } })
  if (!inv) return null
  const units = await prisma.unit.findMany({ select: { number: true, building: true, floor: true, type: true } })
  const entries = floorEntries()
  const data = loadMarkers()

  const buildings = new Map<string, { staircases: Set<string>; floorsUnits: Map<string, number> }>()
  for (const u of units) {
    const b = buildingName(u.building)
    let rec = buildings.get(b)
    if (!rec) {
      rec = { staircases: new Set(), floorsUnits: new Map() }
      buildings.set(b, rec)
    }
    const st = staircaseOf(u.building)
    if (st) rec.staircases.add(st)
  }
  if (buildings.size === 0) buildings.set('B1', { staircases: new Set(), floorsUnits: new Map() })

  // liczba lokali per arkusz (z markers.json — to co realnie jest na rzucie)
  for (const e of entries) {
    const count = data?.floors[e.key]?.markers.length ?? 0
    for (const rec of buildings.values()) rec.floorsUnits.set(e.key, count)
  }

  return {
    id: inv.id,
    name: inv.name,
    code: null,
    buildings: [...buildings.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'pl', { numeric: true }))
      .map(([name, rec]) => ({
        name,
        staircases: [...rec.staircases].sort(),
        floors: entries.map((e) => ({ key: e.key, floor: e.floor, label: e.label, unitCount: rec.floorsUnits.get(e.key) ?? 0 })),
      })),
  }
}
