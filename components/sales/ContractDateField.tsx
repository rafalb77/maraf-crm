'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { isSessionExpired, SESSION_EXPIRED_HINT } from '@/lib/api-client'

/**
 * Data umowy edytowana w miejscu (karta umowy → „Dane umowy"):
 *  - plannedSignDate   = termin zawarcia umowy (do DOCX „zawarta w dniu…" do czasu podpisania)
 *  - reservationEndDate = termin zakończenia rezerwacji (DOCX §2, alerty na pulpicie)
 * Zapis przez PATCH /api/contracts/[id] (pusta wartość = wyczyszczenie).
 */
export function ContractDateField({
  contractId,
  field,
  valueISO,
  hint,
}: {
  contractId: string
  field: 'plannedSignDate' | 'reservationEndDate'
  valueISO: string | null
  hint?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(valueISO ? valueISO.slice(0, 10) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      })
      if (!res.ok) {
        if (isSessionExpired(res)) { setError(SESSION_EXPIRED_HINT); return }
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się zapisać daty')
      }
      setEditing(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span>{valueISO ? formatDate(new Date(valueISO)) : <span className="text-gray-400">—</span>}</span>
        <button
          onClick={() => { setValue(valueISO ? valueISO.slice(0, 10) : ''); setEditing(true) }}
          className="text-gray-400 hover:text-blue-600"
          title={valueISO ? 'Zmień datę' : 'Ustaw datę'}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-2">
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={save} disabled={busy}
          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1">
          {busy && <Loader2 className="w-3 h-3 animate-spin" />} Zapisz
        </button>
        <button onClick={() => { setEditing(false); setError(null) }} disabled={busy} className="text-xs text-gray-500 hover:text-gray-700">
          Anuluj
        </button>
      </span>
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
