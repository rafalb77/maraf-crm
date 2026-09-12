'use client'
import { useRef, useState } from 'react'
import { Camera, Mic, MicOff, Check, X, MoreHorizontal, Pencil, Ban, AlertTriangle, RotateCcw, ThumbsUp, ThumbsDown, Wrench } from 'lucide-react'
import {
  DEFECT_STATUS_BADGE,
  DEFECT_STATUS_LABELS,
  DEFECT_STATUS_RING,
  DEFECT_PRIORITY_LABELS,
  TRADE_LABELS,
  type DefectAction,
  type DefectStatus,
} from '@/lib/odbiory/constants'
import { formatDatePl, formatDateTimePl, unitShortLabel } from '@/lib/odbiory/codes'
import type { SnapshotDefect, SnapshotSubcontractor } from '@/lib/odbiory/types'
import { useSpeech } from './useSpeech'
import type { LocalPhoto } from './DefectEditor'

type Props = {
  defect: SnapshotDefect
  photos: LocalPhoto[]
  subcontractors: SnapshotSubcontractor[]
  verifyMode: boolean
  readOnly: boolean
  onClose: () => void
  onEdit: () => void
  onAddPhotos: (files: File[], phase: 'PRZED' | 'PO') => void
  onAction: (action: DefectAction, note: string | null) => void
  onAppendDescription: (text: string) => void
}

export function DefectCard({ defect, photos, subcontractors, verifyMode, readOnly, onClose, onEdit, onAddPhotos, onAction, onAppendDescription }: Props) {
  const [menu, setMenu] = useState(false)
  const [notePrompt, setNotePrompt] = useState<{ action: DefectAction; label: string } | null>(null)
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const speech = useSpeech((text) => onAppendDescription(text))

  const status = defect.status as DefectStatus
  const ring = DEFECT_STATUS_RING[status] || '#dc2626'
  const sub = subcontractors.find((s) => s.id === defect.subcontractorId)
  const overdue = defect.dueAt && status === 'DO_POPRAWY' && new Date(defect.dueAt).getTime() < Date.now() - 12 * 3600 * 1000
  const before = photos.filter((p) => p.phase !== 'PO')
  const after = photos.filter((p) => p.phase === 'PO')
  const canVerify = !readOnly && (status === 'POPRAWIONA' || status === 'SPORNA' || (verifyMode && status === 'DO_POPRAWY'))
  const photoPhase: 'PRZED' | 'PO' = status === 'POPRAWIONA' || status === 'ODEBRANA' ? 'PO' : 'PRZED'

  function act(action: DefectAction, needsNote: boolean, label: string) {
    setMenu(false)
    if (needsNote) {
      setNotePrompt({ action, label })
      setNote('')
      return
    }
    onAction(action, null)
  }

  return (
    <div className="flex max-h-[78vh] flex-col rounded-t-2xl bg-white shadow-2xl">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-gray-900" style={{ border: `4px solid ${ring}` }}>
          {defect.seq}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-gray-900">{defect.code}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${DEFECT_STATUS_BADGE[status] || ''}`}>{DEFECT_STATUS_LABELS[status] || status}</span>
            {defect.priority === 'PILNY' && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold uppercase text-white">Pilne</span>}
          </div>
          <div className="truncate text-xs text-gray-500">
            {defect.unitNumber ? `Lokal ${unitShortLabel(defect.unitNumber)}` : 'Część wspólna'}
            {defect.room ? ` / ${defect.room}` : ''}
            {defect.trade ? ` · ${TRADE_LABELS[defect.trade as keyof typeof TRADE_LABELS] || defect.trade}` : ''}
          </div>
        </div>
        {!readOnly && (
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} className="rounded-full p-2 text-gray-600 hover:bg-gray-100" aria-label="Więcej">
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menu && (
              <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg">
                <MenuItem icon={<Pencil className="h-4 w-4" />} label="Edytuj opis, typ, wykonawcę" onClick={() => { setMenu(false); onEdit() }} />
                {(status === 'DO_POPRAWY' || status === 'SPORNA') && <MenuItem icon={<Wrench className="h-4 w-4" />} label="Oznacz jako poprawioną (w imieniu wykonawcy)" onClick={() => act('POPRAWIONA', false, '')} />}
                {(status === 'DO_POPRAWY' || status === 'POPRAWIONA') && <MenuItem icon={<AlertTriangle className="h-4 w-4" />} label="Oznacz jako sporną" onClick={() => act('SPORNA', true, 'Dlaczego sporna?')} />}
                {status !== 'ANULOWANA' && status !== 'ODEBRANA' && <MenuItem icon={<Ban className="h-4 w-4" />} label="Anuluj usterkę (pomyłka)" onClick={() => act('ANULUJ', false, '')} />}
                {(status === 'ANULOWANA' || status === 'ODEBRANA' || status === 'SPORNA') && <MenuItem icon={<RotateCcw className="h-4 w-4" />} label="Przywróć do poprawy" onClick={() => act('PRZYWROC', false, '')} />}
              </div>
            )}
          </div>
        )}
        <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Zamknij">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        <div>
          <div className="text-base font-semibold text-gray-900">{defect.title}</div>
          {defect.description && <p className="mt-1 whitespace-pre-wrap text-gray-700">{defect.description}</p>}
          {speech.interim && <p className="mt-1 text-gray-400">{speech.interim}…</p>}
          {speech.error && <p className="mt-1 text-xs text-red-600">{speech.error}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">Wykonawca</dt>
          <dd className="font-medium text-gray-900">{sub?.name || '— nieprzypisany —'}</dd>
          <dt className="text-gray-500">Termin</dt>
          <dd className={`font-medium ${overdue ? 'text-red-600' : 'text-gray-900'}`}>{defect.dueAt ? formatDatePl(defect.dueAt) : '—'}{overdue ? ' · po terminie' : ''}</dd>
          <dt className="text-gray-500">Priorytet</dt>
          <dd className="text-gray-900">{DEFECT_PRIORITY_LABELS[defect.priority as keyof typeof DEFECT_PRIORITY_LABELS] || defect.priority}</dd>
          <dt className="text-gray-500">Zgłosił</dt>
          <dd className="text-gray-900">{defect.reportedByName || '—'} · {formatDateTimePl(defect.reportedAt)}</dd>
          {defect.fixReportedAt && (
            <>
              <dt className="text-gray-500">Poprawiona (wykonawca)</dt>
              <dd className="text-gray-900">{formatDateTimePl(defect.fixReportedAt)}{defect.fixNote ? ` · ${defect.fixNote}` : ''}</dd>
            </>
          )}
          {defect.acceptedAt && (
            <>
              <dt className="text-gray-500">Odebrana</dt>
              <dd className="text-gray-900">{formatDateTimePl(defect.acceptedAt)}</dd>
            </>
          )}
          {defect.rejectedCount > 0 && (
            <>
              <dt className="text-gray-500">Nie odebrana</dt>
              <dd className="text-red-700">{defect.rejectedCount} ×</dd>
            </>
          )}
          {defect.disputeNote && (
            <>
              <dt className="text-gray-500">Spór</dt>
              <dd className="text-purple-700">{defect.disputeNote}</dd>
            </>
          )}
        </dl>

        <PhotoRow label="Zdjęcia przed" photos={before} />
        <PhotoRow label="Zdjęcia po naprawie" photos={after} />

        {notePrompt && (
          <div className="rounded-lg border border-gray-300 bg-gray-50 p-3">
            <div className="mb-2 text-sm font-medium text-gray-800">{notePrompt.label}</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Krótka uwaga dla wykonawcy" />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setNotePrompt(null)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">Anuluj</button>
              <button
                type="button"
                disabled={!note.trim()}
                onClick={() => {
                  onAction(notePrompt.action, note.trim())
                  setNotePrompt(null)
                }}
                className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Zatwierdź
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-gray-200 px-4 py-3">
        {canVerify && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => act('ODEBRANO', false, '')} className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-3 text-base font-semibold text-white">
              <ThumbsUp className="h-5 w-5" /> Odebrano
            </button>
            <button type="button" onClick={() => act('NIE_ODEBRANO', true, 'Dlaczego nie odebrano? (trafi do wykonawcy)')} className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-3 text-base font-semibold text-white">
              <ThumbsDown className="h-5 w-5" /> Nie odebrano
            </button>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <button type="button" disabled={readOnly} onClick={() => fileRef.current?.click()} className="flex flex-col items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-800 disabled:opacity-40">
            <Camera className="h-5 w-5" /> Zdjęcie{photoPhase === 'PO' ? ' „po”' : ''}
          </button>
          <button
            type="button"
            disabled={readOnly || !speech.supported}
            onClick={speech.listening ? speech.stop : speech.start}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg border py-2.5 text-sm font-medium disabled:opacity-40 ${speech.listening ? 'border-red-600 bg-red-600 text-white' : 'border-gray-300 bg-white text-gray-800'}`}
            title={speech.supported ? 'Dyktuj uzupełnienie opisu' : 'Dyktowanie niedostępne w tej przeglądarce'}
          >
            {speech.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />} {speech.listening ? 'Stop' : 'Głos'}
          </button>
          <button type="button" onClick={onClose} className="flex flex-col items-center justify-center gap-1 rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white">
            <Check className="h-5 w-5" /> Gotowe
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || [])
            if (files.length) onAddPhotos(files, photoPhase)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-800 hover:bg-gray-100">
      {icon}
      <span>{label}</span>
    </button>
  )
}

function PhotoRow({ label, photos }: { label: string; photos: LocalPhoto[] }) {
  if (photos.length === 0) return null
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className={`h-20 w-20 rounded-md border object-cover ${p.pending ? 'border-orange-400' : 'border-gray-200'}`} />
          </a>
        ))}
      </div>
    </div>
  )
}
