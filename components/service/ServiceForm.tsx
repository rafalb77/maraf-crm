'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Client, Unit } from '@prisma/client'

const PRIORITIES = [
  { value: 'NISKA', label: 'Niska' },
  { value: 'SREDNIA', label: 'Średnia' },
  { value: 'WYSOKA', label: 'Wysoka' },
]

export function ServiceForm({
  clients,
  units,
  defaultClientId,
}: {
  clients: Client[]
  units: Unit[]
  defaultClientId?: string
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    clientId: defaultClientId || '',
    unitId: '',
    title: '',
    description: '',
    priority: 'SREDNIA',
    status: 'ZGLOSZONO',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/service', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      const data = await res.json()
      router.push(`/service/${data.id}`)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error || 'Błąd zapisu')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Klient *</label>
        <select
          value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}
          required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Wybierz klienta...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.lastName} {c.firstName} {c.phone ? `(${c.phone})` : ''}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Lokal</label>
        <select
          value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Brak / nieznany</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.number}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tytuł / opis usterki *</label>
        <input
          value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="np. Nieszczelność w łazience"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Szczegóły</label>
        <textarea
          value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Dokładny opis problemu..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priorytet</label>
          <select
            value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
          {loading ? 'Zapisywanie...' : 'Utwórz zgłoszenie'}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          Anuluj
        </button>
      </div>
    </form>
  )
}
