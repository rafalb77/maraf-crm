// Typy payloadów modułu Odbiory (klient + serwer). Daty jako ISO string —
// snapshot jest serializowany do IndexedDB w widoku terenowym (offline).
import type { SheetUnitMarker } from './geometry'
import type { DefectAction } from './constants'

export type SnapshotPhoto = {
  id: string
  url: string
  phase: string // PRZED | PO
  byContractor: boolean
  createdAt: string
}

export type SnapshotDefect = {
  id: string
  inspectionId: string
  sheetId: string
  seq: number
  code: string
  x: number
  y: number
  unitId: string | null
  unitNumber: string | null
  room: string | null
  typeId: string | null
  trade: string | null
  title: string
  description: string | null
  priority: string
  status: string
  subcontractorId: string | null
  dueAt: string | null
  sourceText: string | null
  aiSuggested: boolean
  reportedById: string | null
  reportedByName: string | null
  reportedAt: string
  fixReportedAt: string | null
  fixNote: string | null
  acceptedAt: string | null
  rejectedCount: number
  disputeNote: string | null
  updatedAt: string
  photos: SnapshotPhoto[]
}

export type SnapshotType = {
  id: string
  code: number
  name: string
  trade: string
  defaultSubcontractorId: string | null
  defaultDays: number | null
  defaultPriority: string
  usageCount: number
}

export type SnapshotSubcontractor = {
  id: string
  name: string
  email: string | null
  contactName: string | null
}

export type SnapshotSheet = {
  id: string
  name: string
  kind: string
  building: string | null
  floor: number | null
  markersKey: string | null
  imageUrl: string
  width: number
  height: number
  markers: SheetUnitMarker[]
}

export type SnapshotInspection = {
  id: string
  number: string
  kind: string
  scopeName: string
  stage: string | null
  status: string
  result: string | null
  building: string | null
  staircase: string | null
  floor: number | null
  subcontractorId: string | null
  inspectorId: string | null
  inspectorName: string | null
  startedAt: string
  finishedAt: string | null
  fixDueAt: string | null
  notes: string | null
}

export type Snapshot = {
  inspection: SnapshotInspection
  sheet: SnapshotSheet
  defects: SnapshotDefect[]
  defectTypes: SnapshotType[]
  subcontractors: SnapshotSubcontractor[]
  investment: { id: string; name: string; code: string }
  user: { id: string; name: string }
  fetchedAt: string
}

/** Body PUT /api/odbiory/defects/[id] — upsert po id (id nadaje klient, także offline). */
export type DefectUpsertBody = {
  inspectionId: string
  x: number
  y: number
  seq?: number // propozycja klienta (offline); serwer może przenumerować
  unitId?: string | null
  unitNumber?: string | null
  room?: string | null
  typeId?: string | null
  trade?: string | null
  title?: string
  description?: string | null
  priority?: string
  subcontractorId?: string | null
  dueAt?: string | null
  sourceText?: string | null
  aiSuggested?: boolean
  reportedAt?: string
}

export type DefectActionBody = {
  action: DefectAction
  note?: string
}

/** Odpowiedź upsertu — klient nadpisuje lokalny rekord (seq/code mogły się zmienić). */
export type DefectUpsertResponse = {
  defect: SnapshotDefect
  renumbered: boolean
}

/** Sugestia AI dla tekstu usterki (nigdy nie zmienia statusu). */
export type AiDefectSuggestion = {
  title: string
  description: string | null
  trade: string | null
  typeId: string | null
  typeName: string | null
  room: string | null
  subcontractorId: string | null
  subcontractorName: string | null
  priority: string | null
  dueAt: string | null
  confidence: 'niska' | 'srednia' | 'wysoka'
}
