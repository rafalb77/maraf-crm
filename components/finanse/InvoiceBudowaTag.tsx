'use client'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

/**
 * Blok „Budowa" w szczegółach faktury kosztowej (moduł Budowa, Etap 3).
 * Przypisanie kosztu do inwestycji → etapu → (opcjonalnie) zadania. Zapis od razu
 * (PATCH /api/finanse/invoices/[id]). FV NIE jest dublowana — to tylko tagi.
 */

type Investment = { id: string; name: string }
type Stage = { id: string; investmentId: string; name: string }
type Task = { id: string; investmentId: string; stageId: string | null; number: string | null; name: string }

export function InvoiceBudowaTag({
  invoiceId,
  investmentId,
  stageId,
  taskId,
  investments,
  stages,
  tasks,
}: {
  invoiceId: string
  investmentId: string | null
  stageId: string | null
  taskId: string | null
  investments: Investment[]
  stages: Stage[]
  tasks: Task[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stageOpts = useMemo(
    () => (investmentId ? stages.filter((s) => s.investmentId === investmentId) : []),
    [stages, investmentId],
  )
  const taskOpts = useMemo(
    () =>
      stageId
        ? tasks.filter((t) => t.stageId === stageId)
        : investmentId
          ? tasks.filter((t) => t.investmentId === investmentId)
          : [],
    [tasks, stageId, investmentId],
  )

  async function patch(body: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/finanse/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(data.error || 'Błąd zapisu')
        return
      }
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally {
      setSaving(false)
    }
  }

  const sel = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white disabled:opacity-50'

  return (
    <div className="bg-white border border-amber-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🏗️</span>
        <p className="text-xs text-gray-500 uppercase font-semibold">Przypisanie do budowy</p>
        {saving && <span className="text-xs text-amber-600">zapis…</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Inwestycja
          <select
            className={sel}
            disabled={saving}
            value={investmentId || ''}
            onChange={(e) => patch({ investmentId: e.target.value || null })}
          >
            <option value="">— nieprzypisana —</option>
            {investments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Etap
          <select
            className={sel}
            disabled={saving || !investmentId}
            value={stageId || ''}
            onChange={(e) => patch({ constructionStageId: e.target.value || null })}
          >
            <option value="">— bez etapu —</option>
            {stageOpts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Zadanie <span className="text-gray-400">(opcjonalnie)</span>
          <select
            className={sel}
            disabled={saving || !investmentId}
            value={taskId || ''}
            onChange={(e) => patch({ constructionTaskId: e.target.value || null })}
          >
            <option value="">— bez zadania —</option>
            {taskOpts.map((t) => (
              <option key={t.id} value={t.id}>
                {t.number ? `${t.number} ` : ''}
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
