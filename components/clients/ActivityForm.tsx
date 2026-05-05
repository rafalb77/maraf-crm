'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TYPES = [
  { value: 'NOTATKA', label: 'Notatka', icon: '📝' },
  { value: 'TELEFON', label: 'Telefon', icon: '📞' },
  { value: 'EMAIL', label: 'Email', icon: '✉️' },
  { value: 'SPOTKANIE', label: 'Spotkanie', icon: '🤝' },
  { value: 'DOKUMENT', label: 'Dokument', icon: '📄' },
]

export function ActivityForm({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ type: 'NOTATKA', title: '', content: '', date: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, clientId, date: form.date || new Date().toISOString() }),
    })
    setForm({ type: 'NOTATKA', title: '', content: '', date: '' })
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors flex items-center justify-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Dodaj działanie
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
      <div className="flex gap-2 flex-wrap">
        {TYPES.map((t) => (
          <button key={t.value} type="button"
            onClick={() => setForm({ ...form, type: t.value })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              form.type === t.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <input
        value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
        required placeholder="Temat / tytuł..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <textarea
        value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
        placeholder="Opis (opcjonalnie)..." rows={3}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      <input
        type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg text-sm font-medium">
          {loading ? '...' : 'Zapisz'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-white transition-colors">
          Anuluj
        </button>
      </div>
    </form>
  )
}
