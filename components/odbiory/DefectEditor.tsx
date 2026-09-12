'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Mic, MicOff, Sparkles, X, Repeat, Trash2, Check, Plus, Search } from 'lucide-react'
import {
  DEFECT_PRIORITY_LABELS,
  ROOM_SUGGESTIONS,
  TRADES,
  TRADE_LABELS,
  type DefectPriority,
} from '@/lib/odbiory/constants'
import { addDaysIso, formatDatePl, nextFridayIso, unitShortLabel } from '@/lib/odbiory/codes'
import type { AiDefectSuggestion, SnapshotDefect, SnapshotSubcontractor, SnapshotType } from '@/lib/odbiory/types'
import { useSpeech } from './useSpeech'

export type DefectDraft = {
  title: string
  description: string
  room: string
  typeId: string | null
  trade: string | null
  subcontractorId: string | null
  priority: DefectPriority
  dueAt: string | null
}

export type LocalPhoto = SnapshotDefect['photos'][number] & { pending?: boolean }

type Props = {
  defect: SnapshotDefect
  isNew: boolean
  types: SnapshotType[]
  subcontractors: SnapshotSubcontractor[]
  recentTypeIds: string[]
  photos: LocalPhoto[]
  online: boolean
  onSave: (draft: DefectDraft, startSeries: boolean) => void
  onCancel: () => void
  onDelete: () => void
  onAddPhotos: (files: File[]) => void
  onCreateType: (name: string, trade: string) => Promise<SnapshotType | null>
  onCreateSubcontractor: (name: string, email: string) => Promise<SnapshotSubcontractor | null>
  aiParse: (text: string) => Promise<AiDefectSuggestion | null>
}

function toDraft(d: SnapshotDefect): DefectDraft {
  return {
    title: d.title === 'Usterka' && !d.typeId ? '' : d.title,
    description: d.description || '',
    room: d.room || '',
    typeId: d.typeId,
    trade: d.trade,
    subcontractorId: d.subcontractorId,
    priority: (d.priority as DefectPriority) || 'NORMALNY',
    dueAt: d.dueAt,
  }
}

export function DefectEditor({
  defect,
  isNew,
  types,
  subcontractors,
  recentTypeIds,
  photos,
  online,
  onSave,
  onCancel,
  onDelete,
  onAddPhotos,
  onCreateType,
  onCreateSubcontractor,
  aiParse,
}: Props) {
  const [draft, setDraft] = useState<DefectDraft>(() => toDraft(defect))
  const [showAllTypes, setShowAllTypes] = useState(false)
  const [typeQuery, setTypeQuery] = useState('')
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeTrade, setNewTypeTrade] = useState<string>('OGOLNE')
  const [newSubName, setNewSubName] = useState('')
  const [newSubEmail, setNewSubEmail] = useState('')
  const [showNewSub, setShowNewSub] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(toDraft(defect))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defect.id])

  const speech = useSpeech((text) => {
    setDraft((d) => ({ ...d, description: d.description ? `${d.description} ${text}` : text }))
  })

  const recentTypes = useMemo(() => {
    const byId = new Map(types.map((t) => [t.id, t]))
    const out: SnapshotType[] = []
    for (const id of recentTypeIds) {
      const t = byId.get(id)
      if (t && !out.includes(t)) out.push(t)
    }
    for (const t of types) {
      if (out.length >= 8) break
      if (!out.includes(t)) out.push(t)
    }
    return out
  }, [types, recentTypeIds])

  const filteredTypes = useMemo(() => {
    const q = typeQuery.trim().toLowerCase()
    if (!q) return types
    return types.filter((t) => t.name.toLowerCase().includes(q) || String(t.code) === q || (TRADE_LABELS[t.trade as keyof typeof TRADE_LABELS] || '').toLowerCase().includes(q))
  }, [types, typeQuery])

  function applyType(t: SnapshotType) {
    setDraft((d) => ({
      ...d,
      typeId: t.id,
      trade: t.trade,
      title: d.title.trim() && d.typeId !== t.id && d.title !== types.find((x) => x.id === d.typeId)?.name ? d.title : t.name,
      subcontractorId: d.subcontractorId || t.defaultSubcontractorId || null,
      priority: (t.defaultPriority as DefectPriority) || d.priority,
      dueAt: d.dueAt || (t.defaultDays != null ? addDaysIso(t.defaultDays) : null),
    }))
    setShowAllTypes(false)
  }

  async function createType() {
    const name = newTypeName.trim()
    if (!name) return
    const t = await onCreateType(name, newTypeTrade)
    if (t) {
      applyType(t)
      setNewTypeName('')
    } else setError('Nie udało się dodać typu (offline? — wpisz opis, typ dodasz później)')
  }

  async function createSub() {
    const name = newSubName.trim()
    if (!name) return
    const s = await onCreateSubcontractor(name, newSubEmail.trim())
    if (s) {
      setDraft((d) => ({ ...d, subcontractorId: s.id }))
      setShowNewSub(false)
      setNewSubName('')
      setNewSubEmail('')
    } else setError('Nie udało się dodać wykonawcy (wymaga połączenia)')
  }

  async function runAi() {
    const text = [draft.description, draft.title].filter(Boolean).join('. ').trim()
    if (!text) {
      setAiNote('Najpierw podyktuj albo wpisz opis usterki')
      return
    }
    setAiBusy(true)
    setAiNote(null)
    try {
      const s = await aiParse(text)
      if (!s) {
        setAiNote(online ? 'AI nie odpowiedziało — wybierz pola ręcznie' : 'AI wymaga połączenia z internetem')
        return
      }
      setDraft((d) => ({
        ...d,
        title: s.title || d.title,
        description: s.description ?? d.description,
        room: s.room || d.room,
        typeId: s.typeId || d.typeId,
        trade: s.trade || d.trade,
        subcontractorId: s.subcontractorId || d.subcontractorId,
        priority: (s.priority as DefectPriority) || d.priority,
        dueAt: s.dueAt || d.dueAt,
      }))
      const parts = [
        s.typeName ? `typ: ${s.typeName}` : null,
        s.subcontractorName ? `wykonawca: ${s.subcontractorName}` : null,
        s.dueAt ? `termin: ${formatDatePl(s.dueAt)}` : null,
        s.room ? `pomieszczenie: ${s.room}` : null,
      ].filter(Boolean)
      setAiNote(`AI zaproponowało (${s.confidence}): ${parts.join(' · ') || 'opis'} — sprawdź i zapisz`)
    } finally {
      setAiBusy(false)
    }
  }

  function save(startSeries: boolean) {
    const title = draft.title.trim() || types.find((t) => t.id === draft.typeId)?.name || draft.description.trim().slice(0, 80)
    if (!title) {
      setError('Wybierz typ z legendy albo wpisz, co jest nie tak')
      return
    }
    onSave({ ...draft, title }, startSeries)
  }

  const selectedType = types.find((t) => t.id === draft.typeId) || null
  const dueLabel = draft.dueAt ? formatDatePl(draft.dueAt) : 'bez terminu'

  return (
    <div className="flex max-h-[78vh] flex-col rounded-t-2xl bg-white shadow-2xl">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-red-600 bg-white text-lg font-bold text-gray-900">
          {defect.seq}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900">{isNew ? 'Nowa usterka' : `Edycja usterki ${defect.code}`}</div>
          <div className="truncate text-xs text-gray-500">
            {defect.unitNumber ? `Lokal ${unitShortLabel(defect.unitNumber)}` : 'Poza lokalem (część wspólna)'} {draft.room ? `/ ${draft.room}` : ''}
          </div>
        </div>
        <button type="button" onClick={onCancel} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Zamknij">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {/* Typ z legendy */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Typ z legendy</span>
            <button type="button" onClick={() => setShowAllTypes((v) => !v)} className="text-xs font-medium text-blue-700">
              {showAllTypes ? 'Zwiń' : 'Wszystkie / nowy…'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyType(t)}
                className={`rounded-full border px-3 py-2 text-sm ${draft.typeId === t.id ? 'border-red-600 bg-red-50 text-red-800' : 'border-gray-300 bg-white text-gray-800'}`}
              >
                <span className="mr-1 font-bold">{t.code}</span>
                {t.name}
              </button>
            ))}
            {recentTypes.length === 0 && <span className="text-sm text-gray-500">Słownik jest pusty — dodaj pierwszy typ poniżej.</span>}
          </div>
          {showAllTypes && (
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
              <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-2">
                <Search className="h-4 w-4 text-gray-400" />
                <input value={typeQuery} onChange={(e) => setTypeQuery(e.target.value)} placeholder="Szukaj w słowniku…" className="w-full py-2 text-sm outline-none" />
              </div>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {filteredTypes.map((t) => (
                  <button key={t.id} type="button" onClick={() => applyType(t)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white">
                    <span className="w-8 font-bold text-gray-700">{t.code}</span>
                    <span className="flex-1">{t.name}</span>
                    <span className="text-xs text-gray-400">{TRADE_LABELS[t.trade as keyof typeof TRADE_LABELS] || t.trade}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-2">
                <input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="Nowy typ, np. Brak kąta przy otworze" className="min-w-[180px] flex-1 rounded-md border border-gray-300 px-2 py-2 text-sm" />
                <select value={newTypeTrade} onChange={(e) => setNewTypeTrade(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm">
                  {TRADES.map((tr) => (
                    <option key={tr} value={tr}>
                      {TRADE_LABELS[tr]}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={createType} disabled={!newTypeName.trim() || !online} className="flex items-center gap-1 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
                  <Plus className="h-4 w-4" /> Dodaj
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Opis: mów albo pisz */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Co jest nie tak (mów albo pisz)</span>
            <div className="flex items-center gap-2">
              {speech.supported && (
                <button
                  type="button"
                  onClick={speech.listening ? speech.stop : speech.start}
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${speech.listening ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'}`}
                >
                  {speech.listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {speech.listening ? 'Stop' : 'Dyktuj'}
                </button>
              )}
              <button
                type="button"
                onClick={runAi}
                disabled={aiBusy || !online}
                title={online ? 'AI uporządkuje opis: typ, pomieszczenie, wykonawca, termin' : 'AI wymaga internetu'}
                className="flex items-center gap-1 rounded-full bg-purple-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5" /> {aiBusy ? 'AI…' : 'Uporządkuj (AI)'}
              </button>
            </div>
          </div>
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder={selectedType ? selectedType.name : 'Krótka nazwa usterki (np. Brak kąta przy otworze drzwiowym)'}
            className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
          />
          <textarea
            ref={descRef}
            value={draft.description + (speech.interim ? ` ${speech.interim}` : '')}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            rows={2}
            placeholder="np. „pęknięcie tynku nad oknem w salonie, do poprawy przez tynkarzy, do piątku”"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {speech.error && <p className="mt-1 text-xs text-red-600">{speech.error}</p>}
          {aiNote && <p className="mt-1 text-xs text-purple-700">{aiNote}</p>}
        </div>

        {/* Pomieszczenie */}
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Pomieszczenie</span>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ROOM_SUGGESTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, room: d.room === r ? '' : r }))}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${draft.room === r ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
              >
                {r}
              </button>
            ))}
          </div>
          <input value={draft.room} onChange={(e) => setDraft((d) => ({ ...d, room: e.target.value }))} placeholder="albo wpisz (np. pokój 2, szacht)" className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>

        {/* Wykonawca + branża */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Wykonawca</span>
            <div className="flex gap-2">
              <select value={draft.subcontractorId || ''} onChange={(e) => setDraft((d) => ({ ...d, subcontractorId: e.target.value || null }))} className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm">
                <option value="">— nieprzypisany —</option>
                {subcontractors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setShowNewSub((v) => !v)} className="rounded-md border border-gray-300 px-2 text-gray-700" title="Nowy wykonawca">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {showNewSub && (
              <div className="mt-2 flex flex-wrap gap-2">
                <input value={newSubName} onChange={(e) => setNewSubName(e.target.value)} placeholder="Nazwa firmy" className="min-w-[140px] flex-1 rounded-md border border-gray-300 px-2 py-2 text-sm" />
                <input value={newSubEmail} onChange={(e) => setNewSubEmail(e.target.value)} placeholder="e-mail (opcjonalnie)" className="min-w-[140px] flex-1 rounded-md border border-gray-300 px-2 py-2 text-sm" />
                <button type="button" onClick={createSub} disabled={!newSubName.trim() || !online} className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-40">
                  Dodaj
                </button>
              </div>
            )}
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Branża</span>
            <select value={draft.trade || ''} onChange={(e) => setDraft((d) => ({ ...d, trade: e.target.value || null }))} className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm">
              <option value="">— z typu —</option>
              {TRADES.map((tr) => (
                <option key={tr} value={tr}>
                  {TRADE_LABELS[tr]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Termin + priorytet */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Termin usunięcia · {dueLabel}</span>
            <div className="flex flex-wrap gap-2">
              {[
                { l: '3 dni', v: addDaysIso(3) },
                { l: '7 dni', v: addDaysIso(7) },
                { l: 'piątek', v: nextFridayIso() },
                { l: '14 dni', v: addDaysIso(14) },
              ].map((o) => (
                <button key={o.l} type="button" onClick={() => setDraft((d) => ({ ...d, dueAt: o.v }))} className={`rounded-full border px-3 py-1.5 text-sm ${draft.dueAt && draft.dueAt.slice(0, 10) === o.v.slice(0, 10) ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>
                  {o.l}
                </button>
              ))}
              <input
                type="date"
                value={draft.dueAt ? draft.dueAt.slice(0, 10) : ''}
                onChange={(e) => setDraft((d) => ({ ...d, dueAt: e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null }))}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Priorytet</span>
            <div className="flex gap-2">
              {(['NORMALNY', 'PILNY', 'NISKI'] as DefectPriority[]).map((p) => (
                <button key={p} type="button" onClick={() => setDraft((d) => ({ ...d, priority: p }))} className={`rounded-full border px-3 py-1.5 text-sm ${draft.priority === p ? (p === 'PILNY' ? 'border-red-600 bg-red-600 text-white' : 'border-gray-900 bg-gray-900 text-white') : 'border-gray-300 bg-white text-gray-700'}`}>
                  {DEFECT_PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Zdjęcia */}
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Zdjęcia ({photos.length})</span>
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.url} alt="" className={`h-16 w-16 rounded-md border object-cover ${p.pending ? 'border-orange-400 opacity-80' : 'border-gray-200'}`} />
            ))}
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-16 w-16 flex-col items-center justify-center rounded-md border-2 border-dashed border-gray-400 text-gray-600">
              <Camera className="h-5 w-5" />
              <span className="text-[10px]">Zdjęcie</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (files.length) onAddPhotos(files)
                e.target.value = ''
              }}
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex items-center gap-2 border-t border-gray-200 px-4 py-3">
        <button type="button" onClick={isNew ? onCancel : onDelete} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-3 text-sm text-gray-700" title={isNew ? 'Odrzuć' : 'Anuluj usterkę'}>
          <Trash2 className="h-4 w-4" /> {isNew ? 'Odrzuć' : 'Anuluj'}
        </button>
        <button type="button" onClick={() => save(true)} className="flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm font-medium text-red-800" title="Zapisz i powtarzaj ten typ/wykonawcę przy kolejnych dotknięciach">
          <Repeat className="h-4 w-4" /> Seria
        </button>
        <button type="button" onClick={() => save(false)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3 text-base font-semibold text-white">
          <Check className="h-5 w-5" /> Zapisz
        </button>
      </div>
    </div>
  )
}
