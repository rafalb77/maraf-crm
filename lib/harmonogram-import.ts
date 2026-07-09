// Import harmonogramu budowy z xlsx (moduł Budowa, Etap 2).
//
// Format źródłowy: arkusz "HARMONOGRAM_*" wygenerowany w szablonie Konrada (Zgierz Staffa).
// Układ (wykryty automatycznie po nagłówku "POCZĄTEK PRAC"):
//   kol. numer (WBS) | nazwa | POCZĄTEK PRAC | KONIEC PRAC | ... | DNI | % WYKONANIA
//   numer bez kropki ("1","2") = ETAP; z kropką ("1.1","2.14") = zadanie pod ostatnim etapem.
//
// Daty: czytamy surowy serial Excela i konwertujemy przez SSF do "południe UTC" —
// stabilny dzień kalendarzowy niezależnie od strefy (bez dryfu ±1 dzień).
//
// Wzorzec preview/commit jak lib/units-import.ts / finanse-import.ts. Commit idempotentny:
// dopasowanie po (investmentId, number). Reimport ZACHOWUJE ręczne edycje terminów/postępu/
// statusu (plannedStart/End, progress, status, actual*) — aktualizuje tylko nazwę/kolejność/
// przypisanie do etapu. Świeży import (zadanie nie istnieje) wnosi wszystkie pola z pliku.

import * as XLSX from 'xlsx'
import { prisma } from './prisma'

export type ParsedStage = {
  number: string
  name: string
  order: number
  plannedStart: Date | null
  plannedEnd: Date | null
}

export type ParsedTask = {
  number: string
  stageNumber: string | null
  name: string
  order: number
  plannedStart: Date | null
  plannedEnd: Date | null
  durationDays: number | null
  progress: number
}

export type ParsedSchedule = {
  sheetName: string
  stages: ParsedStage[]
  tasks: ParsedTask[]
  warnings: string[]
}

function serialToUTCDate(serial: unknown): Date | null {
  if (typeof serial !== 'number' || !isFinite(serial)) return null
  const d = XLSX.SSF.parse_date_code(serial) as { y: number; m: number; d: number } | null
  if (!d || !d.y) return null
  return new Date(Date.UTC(d.y, d.m - 1, d.d, 12, 0, 0))
}

function cellV(ws: XLSX.WorkSheet, r: number, c: number): unknown {
  const o = ws[XLSX.utils.encode_cell({ r, c })]
  return o ? (o as XLSX.CellObject).v : null
}

/** Czysty parser — z bufora xlsx wyciąga etapy + zadania. Rzuca gdy nie rozpozna układu. */
export function parseHarmonogram(buffer: Buffer): ParsedSchedule {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheetName = wb.SheetNames.find((n) => /HARMONOGRAM/i.test(n)) || wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  if (!ws || !ws['!ref']) throw new Error('Pusty arkusz harmonogramu')
  const range = XLSX.utils.decode_range(ws['!ref'])
  const warnings: string[] = []

  // Nagłówek: wiersz zawierający "POCZĄTEK PRAC" (przeszukujemy pierwsze 15 wierszy/kolumn)
  let headerRow = -1
  let colStart = -1
  for (let r = range.s.r; r <= Math.min(range.e.r, 15); r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, 15); c++) {
      const v = cellV(ws, r, c)
      if (typeof v === 'string' && /POCZ[ĄA]TEK\s+PRAC/i.test(v)) {
        headerRow = r
        colStart = c
        break
      }
    }
    if (headerRow >= 0) break
  }
  if (headerRow < 0) {
    throw new Error('Nie rozpoznano układu — brak nagłówka „POCZĄTEK PRAC". To nie jest harmonogram w oczekiwanym formacie.')
  }

  let colEnd = -1
  let colDni = -1
  let colPct = -1
  for (let c = range.s.c; c <= Math.min(range.e.c, 15); c++) {
    const v = cellV(ws, headerRow, c)
    if (typeof v !== 'string') continue
    if (/KONIEC\s+PRAC/i.test(v)) colEnd = c
    else if (/^\s*DNI\s*$/i.test(v)) colDni = c
    else if (/WYKONANIA/i.test(v)) colPct = c
  }
  if (colEnd < 0) throw new Error('Nie znaleziono kolumny „KONIEC PRAC".')
  const colName = colStart - 1
  const colNr = colStart - 2
  if (colNr < range.s.c) throw new Error('Nieoczekiwany układ kolumn (numer/nazwa przed datami).')

  const stages: ParsedStage[] = []
  const tasks: ParsedTask[] = []
  const seenNumbers = new Set<string>()
  let currentStage: string | null = null
  let stageOrder = 0
  let taskOrder = 0

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const nrRaw = cellV(ws, r, colNr)
    const nameRaw = cellV(ws, r, colName)
    const nr = String(nrRaw ?? '').trim()
    const name = String(nameRaw ?? '').trim()
    if (nr === '' && name === '') continue // pusty wiersz

    const start = serialToUTCDate(cellV(ws, r, colStart))
    const end = serialToUTCDate(cellV(ws, r, colEnd))
    const dni = colDni >= 0 ? cellV(ws, r, colDni) : null
    const pct = colPct >= 0 ? cellV(ws, r, colPct) : null

    if (nr === '') {
      warnings.push(`Wiersz ${r + 1}: pominięto — brak numeru pozycji ("${name.slice(0, 40)}").`)
      continue
    }
    if (seenNumbers.has(nr)) {
      warnings.push(`Wiersz ${r + 1}: zduplikowany numer "${nr}" — pominięto.`)
      continue
    }
    seenNumbers.add(nr)

    const isStage = !nr.includes('.')
    if (isStage) {
      stageOrder++
      currentStage = nr
      stages.push({ number: nr, name: name || `Etap ${nr}`, order: stageOrder, plannedStart: start, plannedEnd: end })
    } else {
      if (!start || !end) {
        warnings.push(`Wiersz ${r + 1} (${nr}): brak daty początku/końca — pominięto (zadania wymagają terminów).`)
        continue
      }
      taskOrder++
      tasks.push({
        number: nr,
        stageNumber: currentStage,
        name: name || `Zadanie ${nr}`,
        order: taskOrder,
        plannedStart: start,
        plannedEnd: end,
        durationDays: typeof dni === 'number' ? dni : null,
        progress: typeof pct === 'number' ? Math.max(0, Math.min(100, Math.round(pct * 100))) : 0,
      })
    }
  }

  if (stages.length === 0 && tasks.length === 0) {
    throw new Error('Nie znaleziono żadnych pozycji harmonogramu pod nagłówkiem.')
  }
  return { sheetName, stages, tasks, warnings }
}

export type ImportPreview = {
  sheetName: string
  warnings: string[]
  stages: { number: string; name: string; status: 'nowy' | 'istnieje'; plannedStart: Date | null; plannedEnd: Date | null }[]
  tasks: {
    number: string
    name: string
    stageNumber: string | null
    status: 'nowe' | 'istnieje'
    plannedStart: Date | null
    plannedEnd: Date | null
    progress: number
  }[]
  counts: { stagesNew: number; stagesExisting: number; tasksNew: number; tasksExisting: number }
}

/** Podgląd importu — parsuje plik i porównuje z bazą (nic nie zapisuje). */
export async function previewImport(investmentId: string, buffer: Buffer): Promise<ImportPreview> {
  const parsed = parseHarmonogram(buffer)
  const [existingStages, existingTasks] = await Promise.all([
    prisma.constructionStage.findMany({ where: { investmentId }, select: { name: true } }),
    prisma.constructionTask.findMany({ where: { investmentId }, select: { number: true } }),
  ])
  const stageNames = new Set(existingStages.map((s) => s.name))
  const taskNumbers = new Set(existingTasks.map((t) => t.number).filter(Boolean) as string[])

  const stages = parsed.stages.map((s) => ({
    number: s.number,
    name: s.name,
    status: (stageNames.has(s.name) ? 'istnieje' : 'nowy') as 'nowy' | 'istnieje',
    plannedStart: s.plannedStart,
    plannedEnd: s.plannedEnd,
  }))
  const tasks = parsed.tasks.map((t) => ({
    number: t.number,
    name: t.name,
    stageNumber: t.stageNumber,
    status: (taskNumbers.has(t.number) ? 'istnieje' : 'nowe') as 'nowe' | 'istnieje',
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
    progress: t.progress,
  }))

  return {
    sheetName: parsed.sheetName,
    warnings: parsed.warnings,
    stages,
    tasks,
    counts: {
      stagesNew: stages.filter((s) => s.status === 'nowy').length,
      stagesExisting: stages.filter((s) => s.status === 'istnieje').length,
      tasksNew: tasks.filter((t) => t.status === 'nowe').length,
      tasksExisting: tasks.filter((t) => t.status === 'istnieje').length,
    },
  }
}

export type ImportResult = {
  stagesCreated: number
  stagesUpdated: number
  tasksCreated: number
  tasksUpdated: number
  warnings: string[]
}

/**
 * Zapis importu (idempotentny). Etapy: upsert po (investmentId, name). Zadania: dopasowanie
 * po (investmentId, number). Istniejące zadania — ZACHOWUJEMY ręczne edycje (terminy/postęp/
 * status/actual), aktualizujemy tylko nazwę/kolejność/etap. Nowe — pełne dane z pliku.
 */
export async function commitImport(investmentId: string, buffer: Buffer): Promise<ImportResult> {
  const parsed = parseHarmonogram(buffer)

  return prisma.$transaction(async (tx) => {
    let stagesCreated = 0
    let stagesUpdated = 0
    const stageIdByNumber = new Map<string, string>()

    for (const s of parsed.stages) {
      const existing = await tx.constructionStage.findFirst({
        where: { investmentId, name: s.name },
        select: { id: true },
      })
      if (existing) {
        await tx.constructionStage.update({
          where: { id: existing.id },
          data: { order: s.order }, // terminy etapu wyprowadzamy z zadań / edycji ręcznej — nie nadpisujemy
        })
        stageIdByNumber.set(s.number, existing.id)
        stagesUpdated++
      } else {
        const created = await tx.constructionStage.create({
          data: {
            investmentId,
            name: s.name,
            order: s.order,
            plannedStart: s.plannedStart,
            plannedEnd: s.plannedEnd,
          },
          select: { id: true },
        })
        stageIdByNumber.set(s.number, created.id)
        stagesCreated++
      }
    }

    const existingTasks = await tx.constructionTask.findMany({
      where: { investmentId },
      select: { id: true, number: true },
    })
    const taskIdByNumber = new Map(
      existingTasks.filter((t) => t.number).map((t) => [t.number as string, t.id]),
    )

    let tasksCreated = 0
    let tasksUpdated = 0
    for (const t of parsed.tasks) {
      const stageId = t.stageNumber ? stageIdByNumber.get(t.stageNumber) ?? null : null
      const existingId = taskIdByNumber.get(t.number)
      if (existingId) {
        await tx.constructionTask.update({
          where: { id: existingId },
          data: { name: t.name, orderIndex: t.order, stageId }, // zachowaj terminy/postęp/status
        })
        tasksUpdated++
      } else {
        await tx.constructionTask.create({
          data: {
            investmentId,
            stageId,
            number: t.number,
            name: t.name,
            orderIndex: t.order,
            plannedStart: t.plannedStart as Date,
            plannedEnd: t.plannedEnd as Date,
            progress: t.progress,
            isMilestone: t.plannedStart != null && t.plannedEnd != null && +t.plannedStart === +t.plannedEnd,
          },
        })
        tasksCreated++
      }
    }

    return { stagesCreated, stagesUpdated, tasksCreated, tasksUpdated, warnings: parsed.warnings }
  })
}
