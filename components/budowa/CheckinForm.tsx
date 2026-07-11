'use client'

import { useEffect, useRef, useState } from 'react'
import { compressImage } from '@/lib/compress-image'

/**
 * Formularz check-in kierownika budowy — mobile-first, cel: 2 minuty.
 *
 * Odporność na słaby LTE (warunek adopcji — patrz docs/budowa-rozpoczecie.md):
 *  1. tekst raportu idzie PIERWSZY, osobnym szybkim requestem → od razu potwierdzenie
 *  2. zdjęcia dosyłane pojedynczo, każde z własnym statusem i retry
 *  3. padnięte zdjęcie NIE unieważnia raportu
 *  4. szkic pól tekstowych w localStorage — wygaśnięcie sesji nie traci treści
 */

const DRAFT_KEY = 'budowa.checkin.draft'

type Sub = { id: string; name: string }
type PhotoStatus = 'czeka' | 'wysyłanie' | 'ok' | 'błąd'
type PhotoItem = { file: File; status: PhotoStatus; error?: string }
type CheckTask = {
  id: string
  number: string | null
  name: string
  status: string
  progress: number
  plannedEnd: string
  acceptanceResult: string | null
  acceptanceNote: string | null
}
type TaskUpdate = { progress?: number; ready: boolean; note: string }

const PROGRESS_STEPS = [25, 50, 75, 100]

type Draft = {
  workDone: string
  hasIssue: boolean
  issueNote: string
  needsDecision: boolean
  decisionNote: string
  needsContractor: boolean
  contractorNote: string
  contractorId: string
}

const EMPTY_DRAFT: Draft = {
  workDone: '',
  hasIssue: false,
  issueNote: '',
  needsDecision: false,
  decisionNote: '',
  needsContractor: false,
  contractorNote: '',
  contractorId: '',
}

export function CheckinForm({
  investmentName,
  subcontractors,
  tasks = [],
}: {
  investmentName: string
  subcontractors: Sub[]
  tasks?: CheckTask[]
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [taskUpdates, setTaskUpdates] = useState<Record<string, TaskUpdate>>({})
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [showAllTasks, setShowAllTasks] = useState(false)
  const [phase, setPhase] = useState<'form' | 'saving' | 'photos' | 'done'>('form')
  const [reportId, setReportId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Szkic: wczytaj przy starcie, zapisuj przy każdej zmianie pól tekstowych.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (raw) setDraft({ ...EMPTY_DRAFT, ...JSON.parse(raw) })
    } catch {}
  }, [])
  useEffect(() => {
    if (phase !== 'form') return
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {}
  }, [draft, phase])

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function addFiles(list: FileList | null) {
    if (!list) return
    const items: PhotoItem[] = Array.from(list).map((file) => ({ file, status: 'czeka' }))
    setPhotos((p) => [...p, ...items])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadPhoto(idx: number, repId: string) {
    setPhotos((p) => p.map((it, i) => (i === idx ? { ...it, status: 'wysyłanie', error: undefined } : it)))
    try {
      const compressed = await compressImage(photos[idx].file)
      const form = new FormData()
      form.append('reportId', repId)
      form.append('file', compressed)
      const res = await fetch('/api/budowa/checkin/photos', { method: 'POST', body: form })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Błąd wysyłki (${res.status})`)
      }
      setPhotos((p) => p.map((it, i) => (i === idx ? { ...it, status: 'ok' } : it)))
    } catch (e: any) {
      setPhotos((p) =>
        p.map((it, i) =>
          i === idx ? { ...it, status: 'błąd', error: e?.message || 'Błąd wysyłki' } : it,
        ),
      )
    }
  }

  async function handleSubmit() {
    setError(null)
    if (draft.workDone.trim().length < 3) {
      setError('Wpisz krótko, co zostało dziś zrobione.')
      return
    }
    setPhase('saving')
    try {
      const res = await fetch('/api/budowa/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDone: draft.workDone,
          hasIssue: draft.hasIssue,
          issueNote: draft.issueNote,
          needsDecision: draft.needsDecision,
          decisionNote: draft.decisionNote,
          needsContractorAction: draft.needsContractor,
          contractorActionNote: draft.contractorNote,
          contractorSubcontractorId: draft.contractorId || null,
          taskUpdates: Object.entries(taskUpdates)
            .filter(([, u]) => u.progress !== undefined || u.ready || u.note.trim())
            .map(([taskId, u]) => ({
              taskId,
              progress: u.progress,
              readyForAcceptance: u.ready,
              note: u.note.trim() || null,
            })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Błąd zapisu (${res.status})`)

      // Raport zapisany — szkic można skasować, zdjęcia dosyłamy w tle.
      try {
        window.localStorage.removeItem(DRAFT_KEY)
      } catch {}
      setReportId(data.id)

      if (photos.length === 0) {
        setPhase('done')
        return
      }
      setPhase('photos')
      for (let i = 0; i < photos.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        await uploadPhoto(i, data.id)
      }
      setPhase('done')
    } catch (e: any) {
      setPhase('form')
      setError(e?.message || 'Nie udało się zapisać raportu. Spróbuj ponownie.')
    }
  }

  function resetForm() {
    setDraft(EMPTY_DRAFT)
    setPhotos([])
    setTaskUpdates({})
    setOpenTaskId(null)
    setReportId(null)
    setError(null)
    setPhase('form')
  }

  function setTaskUpdate(id: string, patch: Partial<TaskUpdate>) {
    setTaskUpdates((m) => {
      const prev: TaskUpdate = m[id] ?? { ready: false, note: '' }
      return { ...m, [id]: { ...prev, ...patch } }
    })
  }

  const failedCount = photos.filter((p) => p.status === 'błąd').length
  const okCount = photos.filter((p) => p.status === 'ok').length

  // ---------------------------------------------------------------- ekran „gotowe"
  if (phase === 'done') {
    return (
      <div className="max-w-md mx-auto p-6 pt-16 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold mb-2">Dziękuję, raport zapisany</h1>
        <p className="text-gray-500 mb-6">
          {okCount > 0 && `Zdjęcia wysłane: ${okCount}. `}
          Rafał zobaczy go w dzienniku budowy.
        </p>
        {failedCount > 0 && reportId && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-left">
            <div className="font-semibold mb-2">
              Nie wysłano {failedCount} {failedCount === 1 ? 'zdjęcia' : 'zdjęć'} (słaby zasięg?)
            </div>
            {photos.map((p, i) =>
              p.status === 'błąd' ? (
                <button
                  key={i}
                  onClick={async () => {
                    await uploadPhoto(i, reportId)
                  }}
                  className="block w-full text-left px-3 py-2 mb-1 rounded-lg bg-white border border-red-200 text-sm"
                >
                  🔄 Wyślij ponownie: {p.file.name}
                </button>
              ) : null,
            )}
          </div>
        )}
        <button
          onClick={resetForm}
          className="w-full py-4 rounded-xl text-lg font-semibold text-white"
          style={{ background: 'var(--gradient-brand, #C9A37A)' }}
        >
          Nowy raport
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------- formularz
  const busy = phase === 'saving' || phase === 'photos'
  const inputCls =
    'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-amber-400'
  const toggleRow = (
    label: string,
    value: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border text-left text-base font-medium transition-colors ${
        value ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-gray-300 bg-white'
      }`}
    >
      <span>{label}</span>
      <span
        className={`w-12 h-7 rounded-full relative transition-colors ${value ? 'bg-amber-500' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${value ? 'left-5' : 'left-0.5'}`}
        />
      </span>
    </button>
  )

  return (
    <div className="max-w-md mx-auto p-4 pb-12">
      <div className="pt-4 pb-5">
        <h1 className="text-2xl font-bold">Raport z budowy</h1>
        <p className="text-gray-500">{investmentName} • {new Date().toLocaleDateString('pl-PL')}</p>
      </div>

      <div className="space-y-4">
        {/* 1. Co zrobiono */}
        <div>
          <label className="block text-sm font-semibold mb-1.5">Co zrobiono dziś?</label>
          <textarea
            className={inputCls}
            rows={4}
            placeholder="Np. zbrojenie stropu nad parterem, dokończono murowanie klatki B…"
            value={draft.workDone}
            onChange={(e) => set('workDone', e.target.value)}
            disabled={busy}
          />
        </div>

        {/* 2. Zadania z harmonogramu (Etap 2) — opcjonalne, tapnięcie rozwija szczegóły */}
        {tasks.length > 0 && (
          <div>
            <label className="block text-sm font-semibold mb-1.5">
              Zadania — przy czym dziś pracowano? <span className="font-normal text-gray-400">(opcjonalnie)</span>
            </label>
            <div className="space-y-2">
              {(showAllTasks ? tasks : tasks.slice(0, 7)).map((t) => {
                const u = taskUpdates[t.id]
                const open = openTaskId === t.id
                const touched = u && (u.progress !== undefined || u.ready || u.note.trim())
                const shownProgress = u?.progress ?? t.progress
                return (
                  <div
                    key={t.id}
                    className={`rounded-xl border transition-colors ${
                      touched ? 'border-amber-400 bg-amber-50' : 'border-gray-300 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left"
                      onClick={() => setOpenTaskId(open ? null : t.id)}
                      disabled={busy}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {t.number && <span className="text-gray-400 mr-1">{t.number}</span>}
                          {t.name}
                        </span>
                        <span className="shrink-0 text-xs text-gray-500">
                          {t.status === 'DO_ODBIORU' ? '📋 czeka na odbiór' : `${shownProgress}%`}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        do {t.plannedEnd.split('-').reverse().join('.')}
                        {touched && ' • zmienione ✓'}
                      </div>
                      {t.acceptanceResult === 'ODRZUCONY' && t.acceptanceNote && (
                        <div className="mt-1 text-xs text-red-700 bg-red-50 rounded-lg px-2 py-1">
                          ↩ Uwagi z odbioru: {t.acceptanceNote}
                        </div>
                      )}
                    </button>
                    {open && (
                      <div className="px-4 pb-3 space-y-2">
                        <div className="flex gap-2">
                          {PROGRESS_STEPS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setTaskUpdate(t.id, { progress: u?.progress === p ? undefined : p })
                              }
                              className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${
                                u?.progress === p
                                  ? 'bg-amber-500 border-amber-500 text-white'
                                  : 'border-gray-300 bg-white'
                              }`}
                            >
                              {p}%
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={busy || t.status === 'DO_ODBIORU'}
                          onClick={() => setTaskUpdate(t.id, { ready: !u?.ready })}
                          className={`w-full py-2.5 rounded-lg text-sm font-semibold border ${
                            u?.ready
                              ? 'bg-green-600 border-green-600 text-white'
                              : t.status === 'DO_ODBIORU'
                                ? 'border-gray-200 text-gray-400'
                                : 'border-gray-300 bg-white'
                          }`}
                        >
                          {t.status === 'DO_ODBIORU'
                            ? '📋 już zgłoszone do odbioru'
                            : u?.ready
                              ? '✓ Gotowe do odbioru'
                              : 'Zgłoś do odbioru'}
                        </button>
                        <input
                          className={inputCls}
                          placeholder="Notatka: uwaga jakościowa / obmiar (opcjonalnie)"
                          value={u?.note || ''}
                          onChange={(e) => setTaskUpdate(t.id, { note: e.target.value })}
                          disabled={busy}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
              {tasks.length > 7 && !showAllTasks && (
                <button
                  type="button"
                  onClick={() => setShowAllTasks(true)}
                  className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500"
                >
                  Pokaż wszystkie ({tasks.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* 3. Problem */}
        {toggleRow('⚠️ Jest problem / opóźnienie?', draft.hasIssue, (v) => set('hasIssue', v))}
        {draft.hasIssue && (
          <textarea
            className={inputCls}
            rows={3}
            placeholder="Co się dzieje? Jaka przyczyna opóźnienia?"
            value={draft.issueNote}
            onChange={(e) => set('issueNote', e.target.value)}
            disabled={busy}
          />
        )}

        {/* 3. Decyzja Rafała */}
        {toggleRow('🟡 Potrzebna decyzja Rafała?', draft.needsDecision, (v) => set('needsDecision', v))}
        {draft.needsDecision && (
          <textarea
            className={inputCls}
            rows={3}
            placeholder="Co trzeba zdecydować?"
            value={draft.decisionNote}
            onChange={(e) => set('decisionNote', e.target.value)}
            disabled={busy}
          />
        )}

        {/* 4. Reakcja wykonawcy */}
        {toggleRow('🔧 Wykonawca musi zareagować?', draft.needsContractor, (v) => set('needsContractor', v))}
        {draft.needsContractor && (
          <div className="space-y-2">
            <select
              className={inputCls}
              value={draft.contractorId}
              onChange={(e) => set('contractorId', e.target.value)}
              disabled={busy}
            >
              <option value="">— który wykonawca? (opcjonalnie) —</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <textarea
              className={inputCls}
              rows={3}
              placeholder="Co ma poprawić / zrobić?"
              value={draft.contractorNote}
              onChange={(e) => set('contractorNote', e.target.value)}
              disabled={busy}
            />
          </div>
        )}

        {/* 5. Zdjęcia */}
        <div>
          <label className="block text-sm font-semibold mb-1.5">Zdjęcia</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="hidden"
            id="checkin-photos"
            onChange={(e) => addFiles(e.target.files)}
            disabled={busy}
          />
          <label
            htmlFor="checkin-photos"
            className="block w-full text-center px-4 py-4 rounded-xl border-2 border-dashed border-gray-300 text-base text-gray-600 cursor-pointer"
          >
            📷 Dodaj zdjęcia
          </label>
          {photos.length > 0 && (
            <ul className="mt-2 space-y-1">
              {photos.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm"
                >
                  <span className="truncate mr-2">{p.file.name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {p.status === 'czeka' && phase === 'form' && (
                      <button
                        type="button"
                        className="text-red-500"
                        onClick={() => setPhotos((arr) => arr.filter((_, j) => j !== i))}
                      >
                        Usuń
                      </button>
                    )}
                    {p.status === 'wysyłanie' && <span className="text-amber-600">wysyłanie…</span>}
                    {p.status === 'ok' && <span className="text-green-600">✓</span>}
                    {p.status === 'błąd' && <span className="text-red-600">błąd</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="w-full py-4 rounded-xl text-lg font-semibold text-white disabled:opacity-60"
          style={{ background: '#1F2D3F' }}
        >
          {phase === 'saving' && 'Zapisywanie raportu…'}
          {phase === 'photos' && `Wysyłanie zdjęć… (${okCount}/${photos.length})`}
          {phase === 'form' && 'Wyślij raport'}
        </button>
        <p className="text-xs text-center text-gray-400">
          Tekst zapisuje się najpierw, zdjęcia dosyłają się po kolei — raport nie
          przepadnie przez słaby zasięg.
        </p>
      </div>
    </div>
  )
}
