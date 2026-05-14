'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Kafelek "% kontraktu" w widoku protokołu — edytowalny.
 *
 * Procent liczony względem `agreedValueNet` (umowna wartość netto całego zakresu
 * robót, wpisywana ręcznie). NIE względem `valueNet` (wyliczana z protokołów —
 * obejmuje tylko zafakturowany zakres, więc zawyżałaby %).
 *
 * Gdy `agreedValueNet` nie jest ustawione → kafelek pokazuje "—" + zachętę do
 * wpisania kwoty (z podpowiedzią ile wynosi suma zafakturowanych pozycji).
 *
 * Klik → edycja inline → PATCH /api/przeroby/contracts/[id] → router.refresh().
 */

function fmtMoney(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function KontraktStat({
  contractId,
  agreedValueNet,
  computedValueNet,
  cumulativeTotal,
}: {
  contractId: string
  agreedValueNet: number | null
  computedValueNet: number | null
  cumulativeTotal: number
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(agreedValueNet != null ? String(agreedValueNet) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(clear: boolean) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/przeroby/contracts/${contractId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreedValueNet: clear ? null : val }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Błąd zapisu (${res.status})`)
      }
      setEditing(false)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Błąd zapisu')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setEditing(false)
    setError(null)
    setVal(agreedValueNet != null ? String(agreedValueNet) : '')
  }

  const pct =
    agreedValueNet && agreedValueNet > 0 ? (cumulativeTotal / agreedValueNet) * 100 : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">% kontraktu</p>

      {editing ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save(false)
                if (e.key === 'Escape') cancel()
              }}
              placeholder="np. 2 800 000"
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded tabular-nums"
            />
            <span className="text-xs text-gray-500">zł</span>
          </div>
          <p className="text-[10px] text-gray-400 leading-tight">
            Wartość netto całej umowy (cały zakres robót — wszystkie kondygnacje + dach)
          </p>
          {error && <p className="text-[10px] text-red-500">{error}</p>}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving}
              className="px-2 py-0.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '…' : 'Zapisz'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Anuluj
            </button>
            {agreedValueNet != null && (
              <button
                type="button"
                onClick={() => save(true)}
                disabled={saving}
                title="Wyczyść wartość umowy"
                className="px-1.5 py-0.5 text-xs rounded text-red-500 hover:bg-red-50"
              >
                Wyczyść
              </button>
            )}
          </div>
        </div>
      ) : pct != null ? (
        <>
          <p className="text-2xl font-bold tabular-nums text-gray-900">{pct.toFixed(1)}%</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] text-gray-500 hover:text-gray-700 underline mt-0.5"
            title="Kliknij aby zmienić wartość umowy"
          >
            wg umowy {fmtMoney(agreedValueNet!)} zł
          </button>
        </>
      ) : (
        <>
          <p className="text-2xl font-bold tabular-nums text-gray-300">—</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] text-blue-600 hover:text-blue-700 underline mt-0.5"
          >
            Ustaw wartość umowy
          </button>
          {computedValueNet != null && computedValueNet > 0 && (
            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
              suma zafakturowanych pozycji: {fmtMoney(computedValueNet)} zł
            </p>
          )}
        </>
      )}
    </div>
  )
}
