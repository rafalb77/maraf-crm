'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDateTime } from '@/lib/utils'
import { TASK_TYPE_LABELS, TASK_TYPE_ICONS, type TaskType } from '@/lib/types'
import { isSessionExpired, SESSION_EXPIRED_HINT } from '@/lib/api-client'

export type ClientTaskRow = {
  id: string
  title: string
  description: string | null
  type: string
  dueAtISO: string | null
  pinned: boolean
  source: string
}

const MANUAL_TYPES: TaskType[] = ['TELEFON', 'EMAIL', 'SPOTKANIE', 'INNE']

/**
 * Zaplanowane działania klienta — otwarte zadania (ręczne + z silnika
 * przypomnień: raty, rezerwacje, koniec rezerwacji umownej) z odhaczaniem
 * i dodawaniem nowych. Ten sam model Task co widget „Do zrobienia" na pulpicie.
 */
export function ClientTasksPanel({ clientId, tasks }: { clientId: string; tasks: ClientTaskRow[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ type: 'TELEFON', title: '', dueAt: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function complete(taskId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      })
      if (!res.ok) {
        if (isSessionExpired(res)) { setError(SESSION_EXPIRED_HINT); return }
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się odhaczyć zadania')
      }
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          type: form.type,
          dueAt: form.dueAt || undefined,
          clientId,
        }),
      })
      if (!res.ok) {
        if (isSessionExpired(res)) { setError(SESSION_EXPIRED_HINT); return }
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się dodać zadania')
      }
      setForm({ type: 'TELEFON', title: '', dueAt: '' })
      setAdding(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const now = Date.now()

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="font-semibold text-gray-900">
          Zaplanowane{tasks.length > 0 && <span className="ml-1.5 text-sm font-normal text-gray-400">({tasks.length})</span>}
        </h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            + Dodaj
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={add} className="mb-4 border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {MANUAL_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  form.type === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}>
                {TASK_TYPE_ICONS[t]} {TASK_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            placeholder="Co jest do zrobienia?"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="datetime-local"
            value={form.dueAt}
            onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium">
              {busy ? '...' : 'Zapisz'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(null) }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-white transition-colors">
              Anuluj
            </button>
          </div>
          <p className="text-[11px] text-gray-400">Bez terminu zadanie trafi „na dziś". Pojawi się też w „Do zrobienia" na pulpicie.</p>
        </form>
      )}

      {tasks.length === 0 && !adding ? (
        <p className="text-gray-400 text-sm">Brak zaplanowanych działań</p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((t) => {
            const due = t.dueAtISO ? new Date(t.dueAtISO) : null
            const overdue = due != null && due.getTime() < now
            return (
              <li key={t.id} className="flex items-start gap-2.5 py-1">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => complete(t.id)}
                  disabled={busy}
                  title="Oznacz jako zrobione"
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-gray-900 leading-snug">
                    <span className="mr-1">{TASK_TYPE_ICONS[t.type as TaskType] ?? '📌'}</span>
                    {t.title}
                    {t.pinned && <span className="ml-1" title="Przypięte">📍</span>}
                  </p>
                  <p className="text-[11px] mt-0.5">
                    {due ? (
                      <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-400'}>
                        {overdue ? 'po terminie · ' : ''}{formatDateTime(due)}
                      </span>
                    ) : (
                      <span className="text-gray-400">bez terminu</span>
                    )}
                    {t.source === 'RULE' && <span className="text-gray-300"> · auto</span>}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
