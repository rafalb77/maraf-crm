'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { CONTRACT_TYPE_LABELS } from '@/lib/types'

type ClientWithReservation = {
  id: string
  firstName: string
  lastName: string
  unitNumbers: string[]
}

/**
 * Wejście „od umów": tworzenie umowy z istniejącej rezerwacji klienta z poziomu
 * listy /sales. Wybierasz klienta (tylko tych z zarezerwowanymi lokalami) i etap
 * startowy — reużywa POST /api/clients/[id]/contract (klient + jego lokale → deal).
 */
export function NewContractFromReservationButton({ clients }: { clients: ClientWithReservation[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [client, setClient] = useState('')
  const [stage, setStage] = useState<'REZERWACYJNA' | 'DEWELOPERSKA'>('REZERWACYJNA')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(
      (c) =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.unitNumbers.some((n) => n.toLowerCase().includes(q)),
    )
  }, [clients, query])

  async function submit() {
    if (!client) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${client}/contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: stage }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Nie udało się utworzyć umowy')
      router.push(`/sales/${d.id}`)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (clients.length === 0) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Nowa z rezerwacji
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Nowa umowa z rezerwacji</h3>
            <p className="text-sm text-gray-600 mb-4">Wybierz klienta — jego zarezerwowane lokale wejdą do umowy.</p>

            <label className="block text-xs font-medium text-gray-600 mb-1">Klient (z rezerwacją)</label>
            <input
              autoFocus
              placeholder="Szukaj po nazwisku lub numerze lokalu…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-100 mb-4">
              {filtered.length === 0 ? (
                <p className="py-4 text-sm text-gray-400 text-center">Brak pasującego klienta.</p>
              ) : (
                filtered.map((c) => (
                  <label key={c.id} className={`flex items-start gap-3 p-2.5 cursor-pointer hover:bg-gray-50 ${client === c.id ? 'bg-emerald-50' : ''}`}>
                    <input type="radio" name="res-contract-client" checked={client === c.id} onChange={() => setClient(c.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                      <p className="text-xs text-gray-500 truncate">{c.unitNumbers.join(', ')}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <label className="block text-xs font-medium text-gray-600 mb-1">Etap startowy</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as 'REZERWACYJNA' | 'DEWELOPERSKA')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="REZERWACYJNA">{CONTRACT_TYPE_LABELS.REZERWACYJNA}</option>
              <option value="DEWELOPERSKA">{CONTRACT_TYPE_LABELS.DEWELOPERSKA}</option>
            </select>

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
              <button onClick={() => setOpen(false)} disabled={busy} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Anuluj</button>
              <button
                onClick={submit}
                disabled={busy || !client}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? 'Tworzę...' : 'Utwórz umowę'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
