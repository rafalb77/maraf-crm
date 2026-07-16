'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Loader2 } from 'lucide-react'

type ClientOption = { id: string; firstName: string; lastName: string; phone: string | null }

export function ReserveForClientModal({ unitId, unitNumber, clients }: {
  unitId: string
  unitNumber: string
  clients: ClientOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (c.phone || '').includes(q))
  }, [clients, query])

  async function submit() {
    if (!selected) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/clients/${selected}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Błąd rezerwacji')
      setOpen(false); router.refresh()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
      >
        <Clock className="w-4 h-4" />
        Zarezerwuj dla klienta
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Zarezerwuj lokal {unitNumber}</h3>
            <p className="text-sm text-gray-600 mb-4">Rezerwacja miękka — wygaśnie automatycznie po 7 dniach, o ile nie zostanie podpisana umowa.</p>

            <input
              autoFocus
              placeholder="Szukaj klienta (nazwisko / telefon)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {clients.length === 0 ? (
              <p className="py-6 text-sm text-gray-400 text-center">Brak klientów w bazie. Dodaj klienta najpierw.</p>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-sm text-gray-400 text-center">Brak klienta pasującego do „{query}".</p>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
                {filtered.map((c) => (
                  <label key={c.id} className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-gray-50 ${selected === c.id ? 'bg-blue-50' : ''}`}>
                    <input type="radio" name="reserve-client" checked={selected === c.id} onChange={() => setSelected(c.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                      {c.phone && <p className="text-xs text-gray-500">{c.phone}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)} disabled={busy} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Anuluj</button>
              <button onClick={submit} disabled={busy || !selected} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? 'Rezerwuję...' : 'Zarezerwuj'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
