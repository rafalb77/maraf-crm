'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const TYPES = [
  { value: 'NOTATKA', label: 'Notatka', icon: '📝' },
  { value: 'TELEFON', label: 'Telefon', icon: '📞' },
  { value: 'EMAIL', label: 'Email', icon: '✉️' },
  { value: 'SPOTKANIE', label: 'Spotkanie', icon: '🤝' },
  { value: 'DOKUMENT', label: 'Dokument', icon: '📄' },
]

const GCAL_STORAGE_KEY = 'activityFormGcal'

export function ActivityForm({
  clientId,
  calendarConnected = false,
}: {
  clientId: string
  /** Czy CRM ma aktywne połączenie OAuth z Google Calendar (moduł Kalendarz). */
  calendarConnected?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ type: 'NOTATKA', title: '', content: '', date: '' })
  const [gcal, setGcal] = useState(false)
  const [loading, setLoading] = useState(false)

  // Ostatni wybór checkboxa kalendarza — nawyk usera, nie ustawienie per klient.
  useEffect(() => {
    try {
      if (localStorage.getItem(GCAL_STORAGE_KEY) === '1') setGcal(true)
    } catch {}
  }, [])

  function pickGcal(checked: boolean) {
    setGcal(checked)
    try { localStorage.setItem(GCAL_STORAGE_KEY, checked ? '1' : '0') } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        clientId,
        date: form.date || new Date().toISOString(),
        addToCalendar: calendarConnected && gcal,
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (calendarConnected && gcal && d?.calendarError) {
      alert(`Działanie zapisane, ale nie udało się dodać do Kalendarza Google:\n${d.calendarError}`)
    }
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
      <div className="flex items-center gap-4 flex-wrap">
        <input
          type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        {calendarConnected && (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={gcal}
              onChange={(e) => pickGcal(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            📅 Dodaj do Kalendarza Google
          </label>
        )}
      </div>
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
