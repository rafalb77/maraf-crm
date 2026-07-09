// Walidacja i budowa payloadu edycji zadania/etapu harmonogramu (moduł Budowa, Etap 2).
// Współdzielone przez PATCH /api/budowa/tasks/[id] i /stages/[id].

import { CONSTRUCTION_TASK_STATUS_LABELS, ConstructionStageStatus } from './types'

const TASK_STATUSES = Object.keys(CONSTRUCTION_TASK_STATUS_LABELS)
const STAGE_STATUSES: ConstructionStageStatus[] = ['PLANOWANY', 'W_TOKU', 'ZAKONCZONY', 'WSTRZYMANY']

/** Parsuje "yyyy-mm-dd" z <input type=date> do stabilnej daty (południe UTC). null gdy puste/błędne. */
export function parseDateInput(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return isNaN(dt.getTime()) ? null : dt
}

export type TaskEditData = {
  plannedStart?: Date
  plannedEnd?: Date
  progress?: number
  status?: string
  name?: string
  delayReason?: string | null
  subcontractorId?: string | null
}

/** Zwraca { data } albo { error }. Waliduje spójność terminów i zakres postępu. */
export function buildTaskEdit(body: any): { data?: TaskEditData; error?: string } {
  const data: TaskEditData = {}

  if (body.plannedStart !== undefined) {
    const d = parseDateInput(body.plannedStart)
    if (!d) return { error: 'Nieprawidłowa data początku' }
    data.plannedStart = d
  }
  if (body.plannedEnd !== undefined) {
    const d = parseDateInput(body.plannedEnd)
    if (!d) return { error: 'Nieprawidłowa data końca' }
    data.plannedEnd = d
  }
  if (data.plannedStart && data.plannedEnd && data.plannedEnd < data.plannedStart) {
    return { error: 'Koniec nie może być przed początkiem' }
  }
  if (body.progress !== undefined) {
    const p = Number(body.progress)
    if (!Number.isFinite(p) || p < 0 || p > 100) return { error: 'Postęp musi być 0–100' }
    data.progress = Math.round(p)
  }
  if (body.status !== undefined) {
    if (!TASK_STATUSES.includes(body.status)) return { error: 'Nieznany status zadania' }
    data.status = body.status
  }
  if (body.name !== undefined) {
    const n = String(body.name).trim()
    if (n.length < 1) return { error: 'Nazwa nie może być pusta' }
    data.name = n.slice(0, 300)
  }
  if (body.delayReason !== undefined) {
    data.delayReason = body.delayReason ? String(body.delayReason).slice(0, 500) : null
  }
  if (body.subcontractorId !== undefined) {
    data.subcontractorId = body.subcontractorId ? String(body.subcontractorId) : null
  }

  if (Object.keys(data).length === 0) return { error: 'Brak pól do zmiany' }
  return { data }
}

export type StageEditData = {
  name?: string
  plannedStart?: Date | null
  plannedEnd?: Date | null
  status?: string
  order?: number
}

export function buildStageEdit(body: any): { data?: StageEditData; error?: string } {
  const data: StageEditData = {}
  if (body.name !== undefined) {
    const n = String(body.name).trim()
    if (n.length < 1) return { error: 'Nazwa etapu nie może być pusta' }
    data.name = n.slice(0, 200)
  }
  if (body.plannedStart !== undefined) {
    data.plannedStart = body.plannedStart ? parseDateInput(body.plannedStart) : null
    if (body.plannedStart && !data.plannedStart) return { error: 'Nieprawidłowa data początku etapu' }
  }
  if (body.plannedEnd !== undefined) {
    data.plannedEnd = body.plannedEnd ? parseDateInput(body.plannedEnd) : null
    if (body.plannedEnd && !data.plannedEnd) return { error: 'Nieprawidłowa data końca etapu' }
  }
  if (body.status !== undefined) {
    if (!STAGE_STATUSES.includes(body.status)) return { error: 'Nieznany status etapu' }
    data.status = body.status
  }
  if (body.order !== undefined) {
    const o = Number(body.order)
    if (!Number.isFinite(o)) return { error: 'Nieprawidłowa kolejność' }
    data.order = Math.round(o)
  }
  if (Object.keys(data).length === 0) return { error: 'Brak pól do zmiany' }
  return { data }
}
