// Magazyn offline widoku terenowego (IndexedDB przez `idb`). TYLKO przeglądarka.
//
// - snapshots: pełny pakiet odbioru (rzut, usterki, słownik, wykonawcy) — praca bez sieci
// - outbox: kolejka operacji do wysłania (upsert usterki, akcja, zdjęcie) — po odzyskaniu
//   zasięgu lib/odbiory/sync.ts odtwarza je po kolei; operacje są idempotentne (id od klienta)
// - blobs: zdjęcia czekające na wysyłkę (Blob), klucz = photoId
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { DefectAction } from './constants'
import type { DefectUpsertBody, Snapshot } from './types'

export type OutboxOp =
  | {
      id: string
      kind: 'defect.upsert'
      inspectionId: string
      defectId: string
      body: DefectUpsertBody
      createdAt: number
      attempts: number
      error: string | null
    }
  | {
      id: string
      kind: 'defect.action'
      inspectionId: string
      defectId: string
      action: DefectAction
      note: string | null
      createdAt: number
      attempts: number
      error: string | null
    }
  | {
      id: string
      kind: 'photo.upload'
      inspectionId: string
      defectId: string
      photoId: string
      phase: 'PRZED' | 'PO'
      blobId: string
      createdAt: number
      attempts: number
      error: string | null
    }

interface OdbioryDB extends DBSchema {
  snapshots: { key: string; value: Snapshot }
  outbox: { key: string; value: OutboxOp; indexes: { byInspection: string } }
  blobs: { key: string; value: { id: string; blob: Blob; type: string; createdAt: number } }
}

let dbPromise: Promise<IDBPDatabase<OdbioryDB>> | null = null

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function getDb(): Promise<IDBPDatabase<OdbioryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OdbioryDB>('maraf-odbiory', 1, {
      upgrade(db) {
        db.createObjectStore('snapshots', { keyPath: 'inspection.id' })
        const outbox = db.createObjectStore('outbox', { keyPath: 'id' })
        outbox.createIndex('byInspection', 'inspectionId')
        db.createObjectStore('blobs', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

/** Identyfikator nadawany po stronie klienta (działa też bez HTTPS, gdzie brak crypto.randomUUID). */
export function newId(prefix = 'c'): string {
  let raw = ''
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    raw = crypto.randomUUID().replace(/-/g, '')
  } else {
    raw = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
  }
  return `${prefix}_${raw.slice(0, 24)}`
}

export async function saveSnapshot(s: Snapshot): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await getDb()
  await db.put('snapshots', s)
}

export async function loadSnapshot(inspectionId: string): Promise<Snapshot | undefined> {
  if (!hasIndexedDb()) return undefined
  const db = await getDb()
  return db.get('snapshots', inspectionId)
}

export async function listOutbox(inspectionId: string): Promise<OutboxOp[]> {
  if (!hasIndexedDb()) return []
  const db = await getDb()
  const ops = await db.getAllFromIndex('outbox', 'byInspection', inspectionId)
  return ops.sort((a, b) => a.createdAt - b.createdAt)
}

export async function countOutbox(inspectionId: string): Promise<number> {
  if (!hasIndexedDb()) return 0
  const db = await getDb()
  return db.countFromIndex('outbox', 'byInspection', inspectionId)
}

/**
 * Upsert usterki w kolejce: jedna operacja per usterka — kolejne edycje offline
 * nadpisują treść, ale zachowują createdAt pierwszej (żeby zdjęcia usterki
 * zawsze szły PO jej utworzeniu).
 */
export async function enqueueUpsert(inspectionId: string, defectId: string, body: DefectUpsertBody): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await getDb()
  const existing = (await db.getAllFromIndex('outbox', 'byInspection', inspectionId)).find(
    (o) => o.kind === 'defect.upsert' && o.defectId === defectId,
  )
  if (existing && existing.kind === 'defect.upsert') {
    await db.put('outbox', { ...existing, body, error: null })
    return
  }
  await db.put('outbox', {
    id: newId('op'),
    kind: 'defect.upsert',
    inspectionId,
    defectId,
    body,
    createdAt: Date.now(),
    attempts: 0,
    error: null,
  })
}

export async function enqueueAction(inspectionId: string, defectId: string, action: DefectAction, note: string | null): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await getDb()
  await db.put('outbox', {
    id: newId('op'),
    kind: 'defect.action',
    inspectionId,
    defectId,
    action,
    note,
    createdAt: Date.now(),
    attempts: 0,
    error: null,
  })
}

export async function enqueuePhoto(opts: {
  inspectionId: string
  defectId: string
  photoId: string
  phase: 'PRZED' | 'PO'
  blob: Blob
}): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await getDb()
  await db.put('blobs', { id: opts.photoId, blob: opts.blob, type: opts.blob.type, createdAt: Date.now() })
  await db.put('outbox', {
    id: newId('op'),
    kind: 'photo.upload',
    inspectionId: opts.inspectionId,
    defectId: opts.defectId,
    photoId: opts.photoId,
    phase: opts.phase,
    blobId: opts.photoId,
    createdAt: Date.now(),
    attempts: 0,
    error: null,
  })
}

export async function removeOp(id: string): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await getDb()
  await db.delete('outbox', id)
}

export async function updateOp(op: OutboxOp): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await getDb()
  await db.put('outbox', op)
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  if (!hasIndexedDb()) return undefined
  const db = await getDb()
  const rec = await db.get('blobs', id)
  return rec?.blob
}

export async function deleteBlob(id: string): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await getDb()
  await db.delete('blobs', id)
}

/** Zdjęcia czekające na wysyłkę (do podglądu w UI po przeładowaniu strony). */
export async function listPendingPhotoBlobs(inspectionId: string): Promise<{ photoId: string; defectId: string; phase: 'PRZED' | 'PO'; blob: Blob }[]> {
  if (!hasIndexedDb()) return []
  const db = await getDb()
  const ops = await db.getAllFromIndex('outbox', 'byInspection', inspectionId)
  const out: { photoId: string; defectId: string; phase: 'PRZED' | 'PO'; blob: Blob }[] = []
  for (const op of ops) {
    if (op.kind !== 'photo.upload') continue
    const rec = await db.get('blobs', op.blobId)
    if (rec) out.push({ photoId: op.photoId, defectId: op.defectId, phase: op.phase, blob: rec.blob })
  }
  return out
}
