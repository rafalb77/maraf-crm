'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { compressImage } from '@/lib/compress-image'
import {
  CASE_DIRECTION_LABELS,
  CASE_DIRECTION_ICONS,
  CASE_CHANNEL_LABELS,
  type CaseDirection,
  type CaseChannel,
} from '@/lib/types'

const DIRECTIONS: CaseDirection[] = ['PRZYCHODZACA', 'WYCHODZACA', 'WEWNETRZNA']
const CHANNELS: CaseChannel[] = ['LIST', 'EMAIL', 'TELEFON', 'OSOBISCIE', 'EPUAP', 'INNE']

export function CaseEntryForm({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    direction: 'PRZYCHODZACA' as CaseDirection,
    channel: 'LIST' as CaseChannel,
    occurredAt: '',
    subject: '',
    body: '',
  })
  const fileRef = useRef<HTMLInputElement | null>(null)

  function reset() {
    setForm({ direction: 'PRZYCHODZACA', channel: 'LIST', occurredAt: '', subject: '', body: '' })
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('direction', form.direction)
      fd.append('channel', form.channel)
      if (form.occurredAt) fd.append('occurredAt', new Date(form.occurredAt).toISOString())
      fd.append('subject', form.subject)
      fd.append('body', form.body)

      const files = fileRef.current?.files
      if (files) {
        for (const f of Array.from(files)) {
          const compressed = await compressImage(f)
          fd.append('files', compressed)
        }
      }

      const res = await fetch(`/api/cases/${caseId}/entries`, { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Błąd zapisu (${res.status})`)
      }
      reset()
      setOpen(false)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Błąd zapisu')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Dodaj korespondencję
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
      {/* Kierunek */}
      <div className="flex gap-2 flex-wrap">
        {DIRECTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setForm({ ...form, direction: d })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              form.direction === d ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {CASE_DIRECTION_ICONS[d]} {CASE_DIRECTION_LABELS[d]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Kanał</label>
          <select
            value={form.channel}
            onChange={(e) => setForm({ ...form, channel: e.target.value as CaseChannel })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CASE_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Data zdarzenia</label>
          <input
            type="datetime-local"
            value={form.occurredAt}
            onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
      </div>

      <input
        value={form.subject}
        onChange={(e) => setForm({ ...form, subject: e.target.value })}
        placeholder="Temat / sygnatura pisma..."
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <textarea
        value={form.body}
        onChange={(e) => setForm({ ...form, body: e.target.value })}
        placeholder="Treść / notatka (opcjonalnie)..."
        rows={3}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Skany pisma (opcjonalnie)</label>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
          className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-white file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer"
        />
        <p className="text-[11px] text-gray-400 mt-1">PDF / JPG / PNG, do 25 MB każdy.</p>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          {loading ? 'Zapisywanie...' : 'Zapisz wpis'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-white transition-colors"
        >
          Anuluj
        </button>
      </div>
    </form>
  )
}
