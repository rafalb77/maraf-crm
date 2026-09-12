'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, List, Wifi, WifiOff, CloudUpload, Repeat, CheckSquare, RefreshCw, Camera, X } from 'lucide-react'
import { compressImage } from '@/lib/compress-image'
import {
  DEFECT_STATUS_BADGE,
  DEFECT_STATUS_LABELS,
  DEFECT_STATUS_RING,
  type DefectAction,
  type DefectStatus,
} from '@/lib/odbiory/constants'
import { addDaysIso, formatDatePl, unitShortLabel } from '@/lib/odbiory/codes'
import { hitTestUnit, unionBox } from '@/lib/odbiory/geometry'
import {
  enqueueAction,
  enqueuePhoto,
  enqueueUpsert,
  listOutbox,
  listPendingPhotoBlobs,
  loadSnapshot,
  newId,
  saveSnapshot,
} from '@/lib/odbiory/offline-store'
import { isOnline, processOutbox } from '@/lib/odbiory/sync'
import type { AiDefectSuggestion, DefectUpsertBody, Snapshot, SnapshotDefect, SnapshotPhoto, SnapshotSubcontractor, SnapshotType } from '@/lib/odbiory/types'
import { PlanCanvas, type PlanCanvasHandle } from './PlanCanvas'
import { DefectEditor, type DefectDraft, type LocalPhoto } from './DefectEditor'
import { DefectCard } from './DefectCard'

type Mode = 'inspect' | 'verify'
type SheetState = { kind: 'new'; id: string } | { kind: 'edit'; id: string } | { kind: 'card'; id: string } | null
type SeriesTemplate = { typeId: string | null; trade: string | null; title: string; subcontractorId: string | null; priority: string; dueDays: number | null; room: string }
type Toast = { id: number; text: string; photoFor?: string }

const FILTERS: { key: string; label: string; statuses: DefectStatus[] | null }[] = [
  { key: 'all', label: 'Wszystkie', statuses: null },
  { key: 'open', label: 'Do poprawy', statuses: ['DO_POPRAWY'] },
  { key: 'pending', label: 'Do odbioru', statuses: ['POPRAWIONA', 'SPORNA'] },
  { key: 'done', label: 'Odebrane', statuses: ['ODEBRANA'] },
]

export function FieldInspection({ inspectionId, initialMode, focusDefectId }: { inspectionId: string; initialMode: Mode; focusDefectId?: string | null }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [defects, setDefects] = useState<SnapshotDefect[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [filter, setFilter] = useState<string>(initialMode === 'verify' ? 'pending' : 'all')
  const [sheet, setSheet] = useState<SheetState>(null)
  const [selectedId, setSelectedId] = useState<string | null>(focusDefectId || null)
  const [series, setSeries] = useState<SeriesTemplate | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)
  const [recentTypeIds, setRecentTypeIds] = useState<string[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({})
  const canvasRef = useRef<PlanCanvasHandle>(null)
  const defectsRef = useRef<SnapshotDefect[]>([])
  const snapshotRef = useRef<Snapshot | null>(null)
  const seriesFileRef = useRef<HTMLInputElement>(null)
  const seriesPhotoTarget = useRef<string | null>(null)
  defectsRef.current = defects
  snapshotRef.current = snapshot

  const readOnly = snapshot?.inspection.status !== 'W_TOKU'

  // ---- toasty --------------------------------------------------------------
  const toast = useCallback((text: string, photoFor?: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, photoFor }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), photoFor ? 6000 : 3500)
  }, [])

  // ---- persystencja lokalna ----------------------------------------------
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persist = useCallback((nextDefects: SnapshotDefect[]) => {
    const s = snapshotRef.current
    if (!s) return
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      // zdjęcia z URL-ami blob: nie zapisujemy adresów (po przeładowaniu odtworzymy z blobów)
      const clean = nextDefects.map((d) => ({ ...d, photos: d.photos.filter((p) => !p.url.startsWith('blob:')) }))
      void saveSnapshot({ ...s, defects: clean })
    }, 300)
  }, [])

  const updateDefects = useCallback(
    (fn: (prev: SnapshotDefect[]) => SnapshotDefect[]) => {
      setDefects((prev) => {
        const next = fn(prev)
        defectsRef.current = next
        persist(next)
        return next
      })
    },
    [persist],
  )

  const refreshPending = useCallback(async () => {
    const ops = await listOutbox(inspectionId)
    setPending(ops.length)
    const failed = ops.find((o) => o.error && o.attempts >= 3)
    setSyncError(failed ? `Nie udało się zapisać: ${failed.error}` : null)
  }, [inspectionId])

  // ---- synchronizacja ------------------------------------------------------
  const applyServerDefect = useCallback(
    (d: SnapshotDefect, renumbered: boolean) => {
      updateDefects((prev) => {
        const idx = prev.findIndex((x) => x.id === d.id)
        const local = idx >= 0 ? prev[idx] : null
        const pendingPhotos = local ? local.photos.filter((p) => (p as LocalPhoto).pending) : []
        const merged: SnapshotDefect = { ...d, photos: [...d.photos.filter((p) => !pendingPhotos.some((pp) => pp.id === p.id)), ...pendingPhotos] }
        if (idx >= 0) {
          const copy = [...prev]
          copy[idx] = merged
          return copy
        }
        return [...prev, merged]
      })
      if (renumbered) toast(`Numer usterki zmieniony na ${d.seq} (kolizja z innym urządzeniem)`)
    },
    [updateDefects, toast],
  )

  const applyServerPhoto = useCallback(
    (defectId: string, photo: SnapshotPhoto) => {
      updateDefects((prev) =>
        prev.map((d) => {
          if (d.id !== defectId) return d
          const photos = d.photos.filter((p) => p.id !== photo.id)
          if (photo.url) photos.push({ ...photo })
          return { ...d, photos }
        }),
      )
      setLocalUrls((m) => {
        if (!m[photo.id]) return m
        try {
          URL.revokeObjectURL(m[photo.id])
        } catch {}
        const { [photo.id]: _, ...rest } = m
        return rest
      })
    },
    [updateDefects],
  )

  const sync = useCallback(async () => {
    if (!isOnline()) {
      setOnline(false)
      return
    }
    setSyncing(true)
    try {
      const res = await processOutbox(inspectionId, {
        onDefect: applyServerDefect,
        onPhoto: applyServerPhoto,
      })
      if (res.error && res.error !== 'offline') setSyncError(res.error)
      else if (res.ok) setSyncError(null)
    } finally {
      setSyncing(false)
      void refreshPending()
    }
  }, [inspectionId, applyServerDefect, applyServerPhoto, refreshPending])

  // ---- ładowanie -----------------------------------------------------------
  const mergeWithLocal = useCallback(async (server: Snapshot): Promise<Snapshot> => {
    const local = await loadSnapshot(server.inspection.id)
    const ops = await listOutbox(server.inspection.id)
    const pendingIds = new Set(ops.filter((o) => o.kind === 'defect.upsert').map((o) => o.defectId))
    const localMap = new Map((local?.defects || []).map((d) => [d.id, d]))
    const merged: SnapshotDefect[] = server.defects.map((d) => (pendingIds.has(d.id) && localMap.has(d.id) ? (localMap.get(d.id) as SnapshotDefect) : d))
    for (const [id, d] of localMap) {
      if (!merged.some((x) => x.id === id) && pendingIds.has(id)) merged.push(d)
    }
    merged.sort((a, b) => a.seq - b.seq)
    return { ...server, defects: merged }
  }, [])

  const attachPendingPhotos = useCallback(async (s: Snapshot): Promise<Snapshot> => {
    const blobs = await listPendingPhotoBlobs(s.inspection.id)
    if (blobs.length === 0) return s
    const urls: Record<string, string> = {}
    const byDefect = new Map<string, LocalPhoto[]>()
    for (const b of blobs) {
      const url = URL.createObjectURL(b.blob)
      urls[b.photoId] = url
      const arr = byDefect.get(b.defectId) || []
      arr.push({ id: b.photoId, url, phase: b.phase, byContractor: false, createdAt: new Date().toISOString(), pending: true })
      byDefect.set(b.defectId, arr)
    }
    setLocalUrls((m) => ({ ...m, ...urls }))
    return {
      ...s,
      defects: s.defects.map((d) => {
        const extra = byDefect.get(d.id)
        if (!extra) return d
        const known = new Set(d.photos.map((p) => p.id))
        return { ...d, photos: [...d.photos, ...extra.filter((p) => !known.has(p.id))] }
      }),
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    let s: Snapshot | null = null
    if (isOnline()) {
      try {
        const res = await fetch(`/api/odbiory/inspections/${inspectionId}/snapshot`, { cache: 'no-store' })
        if (res.status === 401) throw new Error('Sesja wygasła — zaloguj się ponownie')
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Błąd ${res.status}`)
        s = await mergeWithLocal((await res.json()) as Snapshot)
        await saveSnapshot(s)
      } catch (e: any) {
        const local = await loadSnapshot(inspectionId)
        if (local) {
          s = local
          toast('Brak połączenia z serwerem — pracujesz na kopii lokalnej')
        } else setLoadError(e?.message || 'Nie udało się pobrać odbioru')
      }
    } else {
      const local = await loadSnapshot(inspectionId)
      if (local) s = local
      else setLoadError('Brak połączenia i brak kopii offline tego odbioru. Otwórz go raz przy zasięgu.')
    }
    if (s) {
      s = await attachPendingPhotos(s)
      snapshotRef.current = s
      setSnapshot(s)
      defectsRef.current = s.defects
      setDefects(s.defects)
    }
    setLoading(false)
    void refreshPending()
  }, [inspectionId, mergeWithLocal, attachPendingPhotos, refreshPending, toast])

  useEffect(() => {
    setOnline(isOnline())
    void load().then(() => sync())
    const on = () => {
      setOnline(true)
      void sync()
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const iv = setInterval(() => {
      if (isOnline()) void sync()
    }, 20000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId])

  useEffect(() => {
    if (!loading && focusDefectId && defects.some((d) => d.id === focusDefectId)) {
      setSelectedId(focusDefectId)
      setSheet({ kind: 'card', id: focusDefectId })
      setTimeout(() => canvasRef.current?.centerOn(focusDefectId, 3), 300)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // auto-zoom na klatkę po załadowaniu
  useEffect(() => {
    if (loading || !snapshot) return
    const st = snapshot.inspection.staircase
    if (!st) return
    const ms = snapshot.sheet.markers.filter((m) => m.staircase === st)
    const box = unionBox(ms)
    if (box) setTimeout(() => canvasRef.current?.fitBox(box), 200)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // ---- operacje na usterkach ----------------------------------------------
  const toBody = useCallback((d: SnapshotDefect): DefectUpsertBody => {
    return {
      inspectionId: d.inspectionId,
      x: d.x,
      y: d.y,
      seq: d.seq,
      unitId: d.unitId,
      unitNumber: d.unitNumber,
      room: d.room,
      typeId: d.typeId,
      trade: d.trade,
      title: d.title,
      description: d.description,
      priority: d.priority,
      subcontractorId: d.subcontractorId,
      dueAt: d.dueAt,
      sourceText: d.sourceText,
      aiSuggested: d.aiSuggested,
      reportedAt: d.reportedAt,
    }
  }, [])

  const queueUpsert = useCallback(
    async (d: SnapshotDefect) => {
      await enqueueUpsert(inspectionId, d.id, toBody(d))
      void refreshPending()
      if (isOnline()) void sync()
    },
    [inspectionId, toBody, refreshPending, sync],
  )

  const nextSeq = useCallback(() => {
    const max = defectsRef.current.reduce((m, d) => Math.max(m, d.seq), 0)
    return max + 1
  }, [])

  const createDefectAt = useCallback(
    (x: number, y: number, template: SeriesTemplate | null): SnapshotDefect | null => {
      const s = snapshotRef.current
      if (!s) return null
      const hit = hitTestUnit(x, y, s.sheet.markers)
      const seq = nextSeq()
      const st = hit?.staircase || s.inspection.staircase
      const floor = s.sheet.floor
      const code = `${s.investment.code}-${(s.sheet.building || s.inspection.building || 'B1').replace(/\D/g, '').padStart(2, '0') || '01'}-${st || 'X'}-${floor == null ? 'X' : floor}-${String(seq).padStart(3, '0')}`
      const now = new Date().toISOString()
      const d: SnapshotDefect = {
        id: newId('d'),
        inspectionId: s.inspection.id,
        sheetId: s.sheet.id,
        seq,
        code,
        x,
        y,
        unitId: hit?.unitId ?? null,
        unitNumber: hit?.number ?? null,
        room: template?.room || null,
        typeId: template?.typeId ?? null,
        trade: template?.trade ?? null,
        title: template?.title || 'Usterka',
        description: null,
        priority: template?.priority || 'NORMALNY',
        status: 'DO_POPRAWY',
        subcontractorId: template?.subcontractorId ?? null,
        dueAt: template && template.dueDays != null ? addDaysIso(template.dueDays) : null,
        sourceText: null,
        aiSuggested: false,
        reportedById: s.user.id,
        reportedByName: s.user.name,
        reportedAt: now,
        fixReportedAt: null,
        fixNote: null,
        acceptedAt: null,
        rejectedCount: 0,
        disputeNote: null,
        updatedAt: now,
        photos: [],
      }
      updateDefects((prev) => [...prev, d])
      return d
    },
    [nextSeq, updateDefects],
  )

  const handleTap = useCallback(
    (x: number, y: number) => {
      if (readOnly) {
        toast('Odbiór jest zakończony — usterki są zablokowane')
        return
      }
      if (sheet && sheet.kind !== 'card') return // edytor otwarty — najpierw zapisz
      if (series) {
        const d = createDefectAt(x, y, series)
        if (!d) return
        void queueUpsert(d)
        setSelectedId(d.id)
        toast(`${d.seq} dodana · ${series.title}`, d.id)
        return
      }
      const d = createDefectAt(x, y, null)
      if (!d) return
      setSelectedId(d.id)
      setSheet({ kind: 'new', id: d.id })
    },
    [readOnly, sheet, series, createDefectAt, queueUpsert, toast],
  )

  const handlePinTap = useCallback((id: string) => {
    setSelectedId(id)
    setSheet({ kind: 'card', id })
  }, [])

  const saveDraft = useCallback(
    (id: string, draft: DefectDraft, startSeries: boolean) => {
      let saved: SnapshotDefect | null = null
      updateDefects((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d
          saved = {
            ...d,
            title: draft.title,
            description: draft.description.trim() || null,
            sourceText: draft.description.trim() || d.sourceText,
            room: draft.room.trim() || null,
            typeId: draft.typeId,
            trade: draft.trade,
            subcontractorId: draft.subcontractorId,
            priority: draft.priority,
            dueAt: draft.dueAt,
            updatedAt: new Date().toISOString(),
          }
          return saved
        }),
      )
      if (saved) {
        void queueUpsert(saved)
        const s = saved as SnapshotDefect
        if (s.typeId) setRecentTypeIds((r) => [s.typeId as string, ...r.filter((x) => x !== s.typeId)].slice(0, 8))
        if (startSeries) {
          const dueDays = s.dueAt ? Math.max(0, Math.round((new Date(s.dueAt).getTime() - Date.now()) / 86400000)) : null
          setSeries({ typeId: s.typeId, trade: s.trade, title: s.title, subcontractorId: s.subcontractorId, priority: s.priority, dueDays, room: '' })
          toast(`Tryb serii: „${s.title}” — stukaj kolejne miejsca`)
        }
      }
      setSheet(null)
    },
    [updateDefects, queueUpsert, toast],
  )

  const discardNew = useCallback(
    (id: string) => {
      updateDefects((prev) => prev.filter((d) => d.id !== id))
      setSheet(null)
      setSelectedId(null)
    },
    [updateDefects],
  )

  const applyAction = useCallback(
    async (id: string, action: DefectAction, note: string | null) => {
      const map: Record<DefectAction, DefectStatus> = {
        ODEBRANO: 'ODEBRANA',
        NIE_ODEBRANO: 'DO_POPRAWY',
        ANULUJ: 'ANULOWANA',
        SPORNA: 'SPORNA',
        PRZYWROC: 'DO_POPRAWY',
        POPRAWIONA: 'POPRAWIONA',
      }
      const now = new Date().toISOString()
      updateDefects((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d
          return {
            ...d,
            status: map[action],
            acceptedAt: action === 'ODEBRANO' ? now : action === 'PRZYWROC' ? null : d.acceptedAt,
            rejectedCount: action === 'NIE_ODEBRANO' ? d.rejectedCount + 1 : d.rejectedCount,
            disputeNote: action === 'SPORNA' ? note : d.disputeNote,
            fixReportedAt: action === 'POPRAWIONA' ? now : action === 'NIE_ODEBRANO' ? null : d.fixReportedAt,
            fixNote: action === 'POPRAWIONA' ? note : d.fixNote,
            updatedAt: now,
          }
        }),
      )
      await enqueueAction(inspectionId, id, action, note)
      void refreshPending()
      if (isOnline()) void sync()
      if (action === 'ODEBRANO' || action === 'NIE_ODEBRANO') {
        // w trybie weryfikacji przeskocz do następnej oczekującej
        const next = defectsRef.current.find((d) => d.id !== id && (d.status === 'POPRAWIONA' || d.status === 'SPORNA'))
        if (mode === 'verify' && next) {
          setSelectedId(next.id)
          setSheet({ kind: 'card', id: next.id })
          canvasRef.current?.centerOn(next.id)
          return
        }
      }
      if (action === 'ANULUJ') setSheet(null)
    },
    [inspectionId, updateDefects, refreshPending, sync, mode],
  )

  const addPhotos = useCallback(
    async (defectId: string, files: File[], phase: 'PRZED' | 'PO') => {
      for (const file of files) {
        let blob: Blob = file
        try {
          blob = await compressImage(file)
        } catch {}
        const photoId = newId('p')
        const url = URL.createObjectURL(blob)
        setLocalUrls((m) => ({ ...m, [photoId]: url }))
        const local: LocalPhoto = { id: photoId, url, phase, byContractor: false, createdAt: new Date().toISOString(), pending: true }
        updateDefects((prev) => prev.map((d) => (d.id === defectId ? { ...d, photos: [...d.photos, local] } : d)))
        await enqueuePhoto({ inspectionId, defectId, photoId, phase, blob })
      }
      void refreshPending()
      if (isOnline()) void sync()
    },
    [inspectionId, updateDefects, refreshPending, sync],
  )

  const appendDescription = useCallback(
    (id: string, text: string) => {
      let saved: SnapshotDefect | null = null
      updateDefects((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d
          saved = { ...d, description: d.description ? `${d.description} ${text}` : text, updatedAt: new Date().toISOString() }
          return saved
        }),
      )
      if (saved) void queueUpsert(saved)
    },
    [updateDefects, queueUpsert],
  )

  const createType = useCallback(
    async (name: string, trade: string): Promise<SnapshotType | null> => {
      try {
        const res = await fetch('/api/odbiory/types', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, trade }) })
        if (!res.ok) return null
        const t = await res.json()
        const st: SnapshotType = { id: t.id, code: t.code, name: t.name, trade: t.trade, defaultSubcontractorId: t.defaultSubcontractorId, defaultDays: t.defaultDays, defaultPriority: t.defaultPriority, usageCount: 0 }
        setSnapshot((s) => {
          if (!s) return s
          const next = { ...s, defectTypes: [...s.defectTypes, st] }
          snapshotRef.current = next
          void saveSnapshot({ ...next, defects: defectsRef.current })
          return next
        })
        return st
      } catch {
        return null
      }
    },
    [],
  )

  const createSubcontractor = useCallback(async (name: string, email: string): Promise<SnapshotSubcontractor | null> => {
    try {
      const res = await fetch('/api/odbiory/subcontractors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: email || null }) })
      if (!res.ok) return null
      const s = await res.json()
      const sub: SnapshotSubcontractor = { id: s.id, name: s.name, email: s.email, contactName: s.contactName }
      setSnapshot((snap) => {
        if (!snap) return snap
        if (snap.subcontractors.some((x) => x.id === sub.id)) return snap
        const next = { ...snap, subcontractors: [...snap.subcontractors, sub].sort((a, b) => a.name.localeCompare(b.name, 'pl')) }
        snapshotRef.current = next
        return next
      })
      return sub
    } catch {
      return null
    }
  }, [])

  const aiParse = useCallback(
    async (text: string): Promise<AiDefectSuggestion | null> => {
      try {
        const res = await fetch('/api/odbiory/ai/parse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, inspectionId }) })
        if (!res.ok) return null
        return (await res.json()) as AiDefectSuggestion
      } catch {
        return null
      }
    },
    [inspectionId],
  )

  // ---- widok ----------------------------------------------------------------
  const visibleDefects = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)
    if (!f || !f.statuses) return defects
    return defects.filter((d) => (f.statuses as string[]).includes(d.status))
  }, [defects, filter])

  const dimmed = useMemo(() => {
    if (filter === 'all') return null
    const vis = new Set(visibleDefects.map((d) => d.id))
    return new Set(defects.filter((d) => !vis.has(d.id)).map((d) => d.id))
  }, [defects, visibleDefects, filter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { DO_POPRAWY: 0, POPRAWIONA: 0, ODEBRANA: 0, SPORNA: 0, ANULOWANA: 0 }
    for (const d of defects) c[d.status] = (c[d.status] || 0) + 1
    return c
  }, [defects])

  const selected = selectedId ? defects.find((d) => d.id === selectedId) || null : null
  const sheetDefect = sheet ? defects.find((d) => d.id === sheet.id) || null : null

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-gray-600">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Wczytuję odbiór…
      </div>
    )
  }
  if (!snapshot) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center text-gray-700">
        <p>{loadError || 'Nie udało się wczytać odbioru.'}</p>
        <button type="button" onClick={() => load()} className="rounded-lg bg-gray-900 px-4 py-2 text-white">Spróbuj ponownie</button>
        <Link href="/odbiory" className="text-blue-700 underline">Wróć do listy odbiorów</Link>
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-gray-100 text-gray-900">
      {/* Nagłówek */}
      <header className="flex items-center gap-2 border-b border-gray-300 bg-white px-2 py-1.5 sm:px-3">
        <Link href={`/odbiory/${snapshot.inspection.id}`} className="rounded-full p-2 text-gray-600 hover:bg-gray-100" aria-label="Wróć do karty odbioru">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{snapshot.inspection.scopeName}</div>
          <div className="truncate text-[11px] text-gray-500">
            {snapshot.inspection.number} · {snapshot.investment.name}
            {readOnly ? ' · ZAKOŃCZONY (tylko podgląd)' : ''}
          </div>
        </div>
        <div className="hidden items-center gap-1 text-xs sm:flex">
          <Counter color={DEFECT_STATUS_RING.DO_POPRAWY} n={counts.DO_POPRAWY} title="do poprawy" />
          <Counter color={DEFECT_STATUS_RING.POPRAWIONA} n={counts.POPRAWIONA} title="do odbioru" />
          <Counter color={DEFECT_STATUS_RING.ODEBRANA} n={counts.ODEBRANA} title="odebrane" />
          {counts.SPORNA > 0 && <Counter color={DEFECT_STATUS_RING.SPORNA} n={counts.SPORNA} title="sporne" />}
        </div>
        <button
          type="button"
          onClick={() => {
            const next = mode === 'verify' ? 'inspect' : 'verify'
            setMode(next)
            setFilter(next === 'verify' ? 'pending' : 'all')
            setSeries(null)
            toast(next === 'verify' ? 'Tryb ponownego odbioru: tylko pozycje oczekujące' : 'Tryb odbioru')
          }}
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${mode === 'verify' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          title="Ponowny odbiór: tylko pozycje zgłoszone jako poprawione"
        >
          <CheckSquare className="h-4 w-4" /> <span className="hidden sm:inline">Weryfikacja</span>
        </button>
        <button type="button" onClick={() => setLegendOpen((v) => !v)} className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${legendOpen ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
          <List className="h-4 w-4" /> <span className="hidden sm:inline">Legenda</span> <span>{defects.length}</span>
        </button>
        <button
          type="button"
          onClick={() => void sync()}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium ${!online ? 'bg-orange-100 text-orange-800' : pending > 0 ? 'bg-blue-100 text-blue-800' : 'bg-green-50 text-green-700'}`}
          title={!online ? 'Offline — zmiany zapisują się na urządzeniu' : pending > 0 ? `${pending} zmian czeka na wysłanie` : 'Wszystko zsynchronizowane'}
        >
          {!online ? <WifiOff className="h-4 w-4" /> : syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : pending > 0 ? <CloudUpload className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
          {pending > 0 && <span>{pending}</span>}
        </button>
      </header>

      {/* Pasek filtrów / serii */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-200 bg-white px-2 py-1.5 text-xs">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={`shrink-0 rounded-full px-3 py-1 ${filter === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        {series ? (
          <button type="button" onClick={() => { setSeries(null); toast('Tryb serii zakończony') }} className="flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-3 py-1 font-semibold text-white">
            <Repeat className="h-3.5 w-3.5" /> Seria: {series.title} · zakończ
          </button>
        ) : (
          !readOnly && <span className="shrink-0 text-gray-500">Dotknij rzut, żeby dodać usterkę</span>
        )}
        {syncError && <span className="shrink-0 text-red-600">{syncError}</span>}
      </div>

      {/* Główna część: rzut + legenda */}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <PlanCanvas
            ref={canvasRef}
            sheet={snapshot.sheet}
            defects={defects}
            selectedId={selectedId}
            dimmedIds={dimmed}
            onTap={handleTap}
            onPinTap={handlePinTap}
            seriesActive={!!series}
          />
          {/* toasty */}
          <div className="pointer-events-none absolute left-1/2 top-3 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
            {toasts.map((t) => (
              <div key={t.id} className="pointer-events-auto flex items-center gap-2 rounded-full bg-gray-900/90 px-4 py-2 text-sm text-white shadow-lg">
                <span>{t.text}</span>
                {t.photoFor && (
                  <button
                    type="button"
                    onClick={() => {
                      seriesPhotoTarget.current = t.photoFor || null
                      seriesFileRef.current?.click()
                    }}
                    className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs"
                  >
                    <Camera className="h-3.5 w-3.5" /> Zdjęcie
                  </button>
                )}
              </div>
            ))}
          </div>
          <input
            ref={seriesFileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || [])
              const target = seriesPhotoTarget.current
              if (files.length && target) void addPhotos(target, files, 'PRZED')
              e.target.value = ''
            }}
          />
        </div>

        {legendOpen && (
          <aside className="absolute inset-y-0 right-0 z-30 w-full max-w-sm overflow-y-auto border-l border-gray-300 bg-white shadow-xl sm:static sm:w-80 sm:max-w-none">
            <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
              <span className="text-sm font-semibold">Legenda · {visibleDefects.length}</span>
              <button type="button" onClick={() => setLegendOpen(false)} className="rounded-full p-1 text-gray-500 sm:hidden" aria-label="Zamknij">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {visibleDefects.map((d) => {
                const sub = snapshot.subcontractors.find((s) => s.id === d.subcontractorId)
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(d.id)
                        canvasRef.current?.centerOn(d.id)
                        setSheet({ kind: 'card', id: d.id })
                        if (window.innerWidth < 640) setLegendOpen(false)
                      }}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-gray-50 ${selectedId === d.id ? 'bg-yellow-50' : ''}`}
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold" style={{ border: `3px solid ${DEFECT_STATUS_RING[d.status as DefectStatus] || '#dc2626'}` }}>
                        {d.seq}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">{d.title}</span>
                        <span className="block truncate text-xs text-gray-500">
                          {d.unitNumber ? unitShortLabel(d.unitNumber) : 'część wspólna'}
                          {d.room ? ` / ${d.room}` : ''}
                          {sub ? ` · ${sub.name}` : ''}
                          {d.dueAt ? ` · ${formatDatePl(d.dueAt)}` : ''}
                        </span>
                      </span>
                      <span className={`mt-1 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${DEFECT_STATUS_BADGE[d.status as DefectStatus] || ''}`}>
                        {DEFECT_STATUS_LABELS[d.status as DefectStatus]?.split(' ')[0] || d.status}
                      </span>
                    </button>
                  </li>
                )
              })}
              {visibleDefects.length === 0 && <li className="px-3 py-6 text-center text-sm text-gray-500">Brak usterek w tym widoku</li>}
            </ul>
          </aside>
        )}

        {/* Dolny panel: edytor / karta */}
        {sheet && sheetDefect && (
          <div className="absolute inset-x-0 bottom-0 z-40 sm:left-1/2 sm:w-[560px] sm:-translate-x-1/2">
            {sheet.kind === 'card' ? (
              <DefectCard
                defect={sheetDefect}
                photos={sheetDefect.photos as LocalPhoto[]}
                subcontractors={snapshot.subcontractors}
                verifyMode={mode === 'verify'}
                readOnly={readOnly}
                onClose={() => setSheet(null)}
                onEdit={() => setSheet({ kind: 'edit', id: sheetDefect.id })}
                onAddPhotos={(files, phase) => void addPhotos(sheetDefect.id, files, phase)}
                onAction={(action, note) => void applyAction(sheetDefect.id, action, note)}
                onAppendDescription={(text) => appendDescription(sheetDefect.id, text)}
              />
            ) : (
              <DefectEditor
                key={sheetDefect.id}
                defect={sheetDefect}
                isNew={sheet.kind === 'new'}
                types={snapshot.defectTypes}
                subcontractors={snapshot.subcontractors}
                recentTypeIds={recentTypeIds}
                photos={sheetDefect.photos as LocalPhoto[]}
                online={online}
                onSave={(draft, startSeries) => saveDraft(sheetDefect.id, draft, startSeries)}
                onCancel={() => (sheet.kind === 'new' ? discardNew(sheetDefect.id) : setSheet({ kind: 'card', id: sheetDefect.id }))}
                onDelete={() => void applyAction(sheetDefect.id, 'ANULUJ', null)}
                onAddPhotos={(files) => void addPhotos(sheetDefect.id, files, 'PRZED')}
                onCreateType={createType}
                onCreateSubcontractor={createSubcontractor}
                aiParse={aiParse}
              />
            )}
          </div>
        )}
      </div>
      {selected && !sheet && (
        <div className="border-t border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">
          Zaznaczona: <b>{selected.seq}</b> {selected.title} — dotknij pinezkę, żeby otworzyć kartę
        </div>
      )}
    </div>
  )
}

function Counter({ color, n, title }: { color: string; n: number; title: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1" title={title}>
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="font-semibold">{n}</span>
    </span>
  )
}
