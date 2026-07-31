'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { UNIT_TYPE_LABELS, type UnitType } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'

type AvailableUnit = { id: string; number: string; type: string; priceGross: number }
type AnnexUnitRow = { number: string; type: string; priceGross: number }
type AnnexRow = {
  id: string
  number: string | null
  signedAt: string | null // ISO
  valueGrossDelta: number
  units: AnnexUnitRow[]
}

export function ContractAnnexPanel({
  contractId,
  status,
  availableUnits,
  annexes,
}: {
  contractId: string
  status: string
  availableUnits: AvailableUnit[]
  annexes: AnnexRow[]
}) {
  const router = useRouter()
  const canAdd = status === 'PODPISANA'
  const [open, setOpen] = useState(false)

  if (!canAdd && annexes.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Aneksy</h2>
        {canAdd && (
          <button onClick={() => setOpen(true)} className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> Dodaj aneks
          </button>
        )}
      </div>

      {annexes.length === 0 ? (
        <p className="text-gray-400 text-sm">Brak aneksów. Aneks dokłada lokal (np. garaż) do podpisanej umowy.</p>
      ) : (
        <div className="space-y-2">
          {annexes.map((a) => (
            <div key={a.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    Aneks {a.number || '(bez numeru)'}
                    {a.signedAt && <span className="text-gray-400 font-normal"> · {formatDate(new Date(a.signedAt))}</span>}
                  </p>
                  <ul className="mt-1 text-xs text-gray-600 space-y-0.5">
                    {a.units.map((u, i) => (
                      <li key={i}>
                        {u.number} · {UNIT_TYPE_LABELS[u.type as UnitType] ?? u.type} · {formatCurrency(u.priceGross)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-emerald-700">+ {formatCurrency(a.valueGrossDelta)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <AnnexDialog contractId={contractId} availableUnits={availableUnits} onClose={() => setOpen(false)} onDone={() => { setOpen(false); router.refresh() }} />
      )}
    </div>
  )
}

function AnnexDialog({
  contractId,
  availableUnits,
  onClose,
  onDone,
}: {
  contractId: string
  availableUnits: AvailableUnit[]
  onClose: () => void
  onDone: () => void
}) {
  const [query, setQuery] = useState('')
  const [prices, setPrices] = useState<Record<string, string>>({}) // unitId -> cena brutto (zaznaczone)
  const [number, setNumber] = useState('')
  const [signedAt, setSignedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return availableUnits
    return availableUnits.filter((u) => u.number.toLowerCase().includes(q))
  }, [availableUnits, query])

  const selectedIds = Object.keys(prices)
  const total = selectedIds.reduce((s, id) => s + (parseFloat(prices[id]) || 0), 0)

  function toggle(u: AvailableUnit) {
    setPrices((prev) => {
      const next = { ...prev }
      if (next[u.id] !== undefined) delete next[u.id]
      else next[u.id] = String(u.priceGross)
      return next
    })
  }

  async function submit() {
    if (selectedIds.length === 0) {
      setError('Wybierz co najmniej jeden lokal.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/annex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: number || undefined,
          signedAt: signedAt || undefined,
          notes: notes || undefined,
          units: selectedIds.map((id) => ({ unitId: id, priceGross: parseFloat(prices[id]) || 0 })),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się dodać aneksu')
      }
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-gray-900">Dodaj aneks</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Dokłada lokal(e) do umowy. Cena domyślnie z cennika — zmień, aby udzielić rabatu.</p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Numer aktu aneksu</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="np. Rep. A 555/2026"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Data aneksu</label>
            <input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <label className="block text-xs text-gray-600 mb-1">Lokale do dołożenia</label>
        <input placeholder="Szukaj po numerze…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {availableUnits.length === 0 ? (
          <p className="py-4 text-sm text-gray-400 text-center">Brak dostępnych lokali.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg max-h-52 overflow-y-auto divide-y divide-gray-100 mb-3">
            {filtered.map((u) => {
              const sel = prices[u.id] !== undefined
              return (
                <div key={u.id} className={`flex items-center gap-3 p-2.5 ${sel ? 'bg-blue-50' : ''}`}>
                  <input type="checkbox" checked={sel} onChange={() => toggle(u)} />
                  <div className="flex-1 min-w-0" onClick={() => toggle(u)} role="button">
                    <p className="text-sm font-medium text-gray-900">{u.number}</p>
                    <p className="text-xs text-gray-500">{UNIT_TYPE_LABELS[u.type as UnitType] ?? u.type} · cennik {formatCurrency(u.priceGross)}</p>
                  </div>
                  {sel && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <input type="number" step="0.01" min={0} value={prices[u.id]}
                        onChange={(e) => setPrices((p) => ({ ...p, [u.id]: e.target.value }))}
                        className="w-32 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <span className="text-xs text-gray-500">zł</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-600 mb-1">Notatka (opcjonalnie)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {selectedIds.length > 0 && (
          <div className="flex justify-between items-center mt-3 text-sm">
            <span className="text-gray-600">Wartość aneksu (brutto)</span>
            <span className="font-semibold text-gray-900">{formatCurrency(total)}</span>
          </div>
        )}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Anuluj</button>
          <button onClick={submit} disabled={busy || selectedIds.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Zapisuję...' : 'Dodaj aneks'}
          </button>
        </div>
      </div>
    </div>
  )
}
