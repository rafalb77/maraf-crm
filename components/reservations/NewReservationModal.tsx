'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Loader2, Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { UNIT_TYPE_LABELS, type UnitType } from '@/lib/types'

type ClientOption = { id: string; firstName: string; lastName: string; phone: string | null }
type UnitOption = { id: string; number: string; type: string; priceGross: number }

/**
 * Tworzenie nowej rezerwacji miękkiej z modułu /rezerwacje — wybór klienta i
 * wolnego lokalu + liczba dni. Reużywa POST /api/clients/[id]/units (MIEKKA).
 */
export function NewReservationModal({
  clients,
  units,
}: {
  clients: ClientOption[]
  units: UnitOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [clientQuery, setClientQuery] = useState('')
  const [unitQuery, setUnitQuery] = useState('')
  const [client, setClient] = useState('')
  const [unit, setUnit] = useState('')
  const [days, setDays] = useState('7')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(
      (c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (c.phone || '').includes(q),
    )
  }, [clients, clientQuery])

  const fUnits = useMemo(() => {
    const q = unitQuery.trim().toLowerCase()
    if (!q) return units
    return units.filter((u) => u.number.toLowerCase().includes(q))
  }, [units, unitQuery])

  function close() {
    setOpen(false)
    setClient('')
    setUnit('')
    setClientQuery('')
    setUnitQuery('')
    setDays('7')
    setError(null)
  }

  async function submit() {
    if (!client || !unit) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${client}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId: unit, days: Number(days) || 7 }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Nie udało się utworzyć rezerwacji')
      close()
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Nowa rezerwacja
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && close()}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" /> Nowa rezerwacja miękka
            </h3>
            <p className="text-sm text-gray-600 mb-4">Lokal zostanie zablokowany na wybraną liczbę dni; po wygaśnięciu wraca do „Wolny".</p>

            {/* KLIENT */}
            <label className="block text-xs font-medium text-gray-600 mb-1">Klient</label>
            <input
              autoFocus
              placeholder="Szukaj klienta (nazwisko / telefon)…"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {clients.length === 0 ? (
              <p className="py-4 text-sm text-gray-400 text-center">Brak klientów w bazie.</p>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100 mb-4">
                {noMatch(fClients, clientQuery) ? (
                  <p className="py-4 text-sm text-gray-400 text-center">Brak pasującego klienta.</p>
                ) : (
                  fClients.map((c) => (
                    <label key={c.id} className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-gray-50 ${client === c.id ? 'bg-blue-50' : ''}`}>
                      <input type="radio" name="new-res-client" checked={client === c.id} onChange={() => setClient(c.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                        {c.phone && <p className="text-xs text-gray-500">{c.phone}</p>}
                      </div>
                    </label>
                  ))
                )}
              </div>
            )}

            {/* LOKAL */}
            <label className="block text-xs font-medium text-gray-600 mb-1">Lokal (wolny)</label>
            <input
              placeholder="Szukaj po numerze lokalu…"
              value={unitQuery}
              onChange={(e) => setUnitQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {units.length === 0 ? (
              <p className="py-4 text-sm text-gray-400 text-center">Brak wolnych lokali.</p>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100 mb-4">
                {noMatch(fUnits, unitQuery) ? (
                  <p className="py-4 text-sm text-gray-400 text-center">Brak pasującego lokalu.</p>
                ) : (
                  fUnits.map((u) => (
                    <label key={u.id} className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-gray-50 ${unit === u.id ? 'bg-blue-50' : ''}`}>
                      <input type="radio" name="new-res-unit" checked={unit === u.id} onChange={() => setUnit(u.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{u.number}</p>
                        <p className="text-xs text-gray-500">{UNIT_TYPE_LABELS[u.type as UnitType] ?? u.type} · {formatCurrency(u.priceGross)}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            )}

            {/* DNI */}
            <label className="block text-xs font-medium text-gray-600 mb-1">Czas rezerwacji (dni)</label>
            <input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
              <button onClick={close} disabled={busy} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Anuluj</button>
              <button
                onClick={submit}
                disabled={busy || !client || !unit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? 'Rezerwuję...' : 'Utwórz rezerwację'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function noMatch<T>(arr: T[], query: string): boolean {
  return arr.length === 0 && query.trim().length > 0
}
