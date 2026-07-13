'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Plan = {
  renames: { from: string; to: string; count: number }[]
  ambiguous: { label: string; count: number; names: string[] }[]
  unmatched: { label: string; count: number; why: string }[]
  alreadyOk: number
}

// Przycisk (admin) do hurtowego ujednolicenia etykiet podwykonawcow z importu
// Excela do oficjalnych nazw kontrahentow — bez terminala. Najpierw podglad,
// potem potwierdzenie i zapis.
export function UnifyLabelsButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function preview() {
    setLoading(true); setError(null); setDone(null); setPlan(null)
    try {
      const r = await fetch('/api/finanse/vendors/unify-labels')
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Błąd'); return }
      setPlan(data); setOpen(true)
    } catch (e: any) { setError(e.message || 'Błąd sieci') } finally { setLoading(false) }
  }

  async function apply() {
    setApplying(true); setError(null)
    try {
      const r = await fetch('/api/finanse/vendors/unify-labels', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apply: true }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Błąd zapisu'); return }
      setDone(`Zmieniono ${data.changed} faktur (${data.renames} etykiet).`)
      setPlan(null)
      router.refresh()
    } catch (e: any) { setError(e.message || 'Błąd sieci') } finally { setApplying(false) }
  }

  return (
    <>
      <button
        onClick={preview}
        disabled={loading}
        className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        title="Ujednolica etykiety wykonawców z importu Excela (np. AL-BUD) do oficjalnych nazw kontrahentów"
      >
        {loading ? 'Sprawdzam…' : '🔧 Napraw etykiety podwykonawców'}
      </button>

      {error && !open && <span className="text-sm text-red-600 ml-2">{error}</span>}
      {done && <span className="text-sm text-green-700 ml-2">{done}</span>}

      {open && plan && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Ujednolicenie etykiet podwykonawców</h3>
            <p className="text-sm text-gray-500 mb-4">
              Etykiety wykonawców z importu Excela zostaną zmienione na oficjalne nazwy kontrahentów.
              Dzięki temu karty, liczniki i wyszukiwarki pokażą pełną współpracę.
            </p>

            {plan.renames.length === 0 ? (
              <p className="text-sm text-emerald-700 mb-4">✓ Nic do naprawy — wszystkie etykiety są już zgodne.</p>
            ) : (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-900 mb-2">Do zmiany ({plan.renames.length}):</p>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
                  {plan.renames.map((r) => (
                    <div key={r.from} className="px-3 py-2 flex items-center justify-between gap-3">
                      <span className="text-gray-500 line-through truncate">{r.from}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-medium text-gray-900 truncate flex-1">{r.to}</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{r.count} FV</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.ambiguous.length > 0 && (
              <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="font-medium mb-1">Niejednoznaczne — pomijane (dopasuj ręcznie na fakturze):</p>
                {plan.ambiguous.map((a) => (
                  <p key={a.label}>„{a.label}" ({a.count} FV): pasuje do {a.names.join(' / ')}</p>
                ))}
              </div>
            )}
            {plan.unmatched.length > 0 && (
              <details className="mb-3 text-xs text-gray-500">
                <summary className="cursor-pointer">Bez dopasowania — zostają jak są ({plan.unmatched.length})</summary>
                {plan.unmatched.map((u) => <p key={u.label}>„{u.label}" ({u.count} FV) — {u.why}</p>)}
              </details>
            )}

            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

            <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Anuluj</button>
              {plan.renames.length > 0 && (
                <button
                  onClick={apply}
                  disabled={applying}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {applying ? 'Zapisuję…' : `Zastosuj (${plan.renames.reduce((s, r) => s + r.count, 0)} FV)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
