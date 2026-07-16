'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CASE_TYPE_LABELS,
  CASE_PRIORITY_LABELS,
  type CaseType,
  type CasePriority,
} from '@/lib/types'

type ClientOpt = { id: string; firstName: string; lastName: string; phone: string | null }
type UnitOpt = { id: string; number: string }
type UserOpt = { id: string; name: string | null; email: string }

const TYPES: CaseType[] = ['REKLAMACJA', 'URZEDOWA', 'INNE']
const PRIORITIES: CasePriority[] = ['NISKA', 'SREDNIA', 'WYSOKA']

export function CaseForm({
  clients,
  units,
  users,
  defaultClientId,
}: {
  clients: ClientOpt[]
  units: UnitOpt[]
  users: UserOpt[]
  defaultClientId?: string
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    type: 'REKLAMACJA' as CaseType,
    title: '',
    description: '',
    clientId: defaultClientId || '',
    counterparty: '',
    unitId: '',
    ownerId: '',
    receivedAt: '',
    deadline: '',
    priority: 'SREDNIA' as CasePriority,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Podpowiedź: reklamacja z datą wpływu → termin +14 dni (rękojmia), jeśli nie podano ręcznie.
  const autoDeadlineHint =
    form.type === 'REKLAMACJA' && form.receivedAt && !form.deadline
      ? (() => {
          const d = new Date(form.receivedAt)
          d.setDate(d.getDate() + 14)
          return d.toLocaleDateString('pl-PL')
        })()
      : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        receivedAt: form.receivedAt ? new Date(form.receivedAt).toISOString() : null,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      }),
    })

    if (res.ok) {
      const data = await res.json()
      router.push(`/cases/${data.id}`)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Błąd zapisu')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      {/* Typ sprawy */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Typ sprawy *</label>
        <div className="flex gap-2 flex-wrap">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm({ ...form, type: t })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                form.type === t
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {CASE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tytuł sprawy *</label>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={form.type === 'URZEDOWA' ? 'np. Pozwolenie na użytkowanie — etap II' : 'np. Reklamacja — pęknięcie płytki w łazience'}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Opis</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Krótki opis czego dotyczy sprawa..."
        />
      </div>

      {/* Strony */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Klient</label>
          <select
            value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">— brak / strona zewnętrzna —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.lastName} {c.firstName} {c.phone ? `(${c.phone})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Strona zewnętrzna</label>
          <input
            value={form.counterparty}
            onChange={(e) => setForm({ ...form, counterparty: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="np. Urząd Miasta Zgierz, PINB..."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lokal</label>
          <select
            value={form.unitId}
            onChange={(e) => setForm({ ...form, unitId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">— brak —</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.number}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prowadzący</label>
          <select
            value={form.ownerId}
            onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">— nieprzypisana —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Terminy */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data wpływu</label>
          <input
            type="date"
            value={form.receivedAt}
            onChange={(e) => setForm({ ...form, receivedAt: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Termin</label>
          <input
            type="date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {autoDeadlineHint && (
            <p className="text-[11px] text-amber-600 mt-1">Auto: {autoDeadlineHint} (rękojmia 14 dni)</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priorytet</label>
          <select
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as CasePriority })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {CASE_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? 'Zapisywanie...' : 'Utwórz sprawę'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="w-full sm:w-auto px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Anuluj
        </button>
      </div>
    </form>
  )
}
