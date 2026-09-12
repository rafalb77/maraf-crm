// Synchronizacja kolejki offline z serwerem (TYLKO przeglądarka).
// Operacje idą po kolei (createdAt). Błąd sieci = stop i próba później; błąd walidacji
// (4xx) = operacja oznaczona błędem, ale kolejka idzie dalej. 401 = sesja wygasła (stop).
import { deleteBlob, getBlob, listOutbox, removeOp, updateOp, type OutboxOp } from './offline-store'
import type { DefectUpsertResponse, SnapshotDefect, SnapshotPhoto } from './types'

export type SyncCallbacks = {
  onDefect?: (defect: SnapshotDefect, renumbered: boolean) => void
  onPhoto?: (defectId: string, photo: SnapshotPhoto) => void
  onOpError?: (op: OutboxOp, message: string) => void
}

export type SyncResult = { ok: boolean; processed: number; remaining: number; error: string | null; sessionExpired: boolean }

let running: Promise<SyncResult> | null = null

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

export function processOutbox(inspectionId: string, cb: SyncCallbacks = {}): Promise<SyncResult> {
  if (running) return running
  running = run(inspectionId, cb).finally(() => {
    running = null
  })
  return running
}

async function run(inspectionId: string, cb: SyncCallbacks): Promise<SyncResult> {
  const ops = await listOutbox(inspectionId)
  let processed = 0
  for (const op of ops) {
    if (!isOnline()) return { ok: false, processed, remaining: ops.length - processed, error: 'offline', sessionExpired: false }
    let res: Response
    try {
      res = await send(op)
    } catch (e: any) {
      // błąd sieci — zostaw w kolejce, spróbujemy później
      return { ok: false, processed, remaining: ops.length - processed, error: e?.message || 'Brak połączenia', sessionExpired: false }
    }
    if (res.status === 401) {
      return { ok: false, processed, remaining: ops.length - processed, error: 'Sesja wygasła — zaloguj się ponownie w nowej karcie', sessionExpired: true }
    }
    if (!res.ok) {
      let message = `Błąd ${res.status}`
      try {
        const j = await res.json()
        if (j?.error) message = String(j.error)
      } catch {}
      // 404 dla zdjęcia/akcji = usterka jeszcze nie istnieje na serwerze (kolejność) — zostaw
      const attempts = op.attempts + 1
      await updateOp({ ...op, attempts, error: message })
      cb.onOpError?.(op, message)
      if (res.status >= 500) {
        return { ok: false, processed, remaining: ops.length - processed, error: message, sessionExpired: false }
      }
      continue
    }
    try {
      if (op.kind === 'defect.upsert') {
        const data = (await res.json()) as DefectUpsertResponse
        cb.onDefect?.(data.defect, data.renumbered)
      } else if (op.kind === 'defect.action') {
        const data = (await res.json()) as { defect: SnapshotDefect }
        cb.onDefect?.(data.defect, false)
      } else if (op.kind === 'photo.upload') {
        const photo = (await res.json()) as SnapshotPhoto
        cb.onPhoto?.(op.defectId, photo)
        await deleteBlob(op.blobId)
      }
    } catch {}
    await removeOp(op.id)
    processed++
  }
  return { ok: true, processed, remaining: 0, error: null, sessionExpired: false }
}

async function send(op: OutboxOp): Promise<Response> {
  if (op.kind === 'defect.upsert') {
    return fetch(`/api/odbiory/defects/${encodeURIComponent(op.defectId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(op.body),
    })
  }
  if (op.kind === 'defect.action') {
    return fetch(`/api/odbiory/defects/${encodeURIComponent(op.defectId)}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: op.action, note: op.note }),
    })
  }
  const blob = await getBlob(op.blobId)
  if (!blob) {
    // blob zniknął (np. wyczyszczone dane przeglądarki) — zdejmij operację, zwracając „ok"
    await removeOp(op.id)
    return new Response(JSON.stringify({ id: op.photoId, url: '', phase: op.phase, byContractor: false, createdAt: new Date().toISOString() }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const form = new FormData()
  form.append('file', new File([blob], `${op.photoId}.jpg`, { type: blob.type || 'image/jpeg' }))
  form.append('phase', op.phase)
  form.append('photoId', op.photoId)
  return fetch(`/api/odbiory/defects/${encodeURIComponent(op.defectId)}/photos`, { method: 'POST', body: form })
}
