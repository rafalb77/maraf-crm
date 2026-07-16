'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, X, Undo2, Loader2, ArrowLeftRight, Bell, BellOff } from 'lucide-react'
import { UNIT_TYPE_LABELS, type UnitType } from '@/lib/types'

/**
 * Przełącznik automatycznych powiadomień dla konkretnej rezerwacji miękkiej
 * (e-mail/SMS do klienta + zadanie „Zadzwoń" — patrz lib/reservation-alerts.ts).
 * Wyciszona rezerwacja jest pomijana przez cron powiadomień.
 */
export function MuteAlertsButton({ unitId, muted }: { unitId: string; muted: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    try {
      const res = await fetch(`/api/reservations/${unitId}/alerts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted: !muted }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Błąd zmiany powiadomień')
        return
      }
      router.refresh()
    } catch (e: any) {
      alert(e.message)
    } finally {
      // setBusy(false) MUSI być też na ścieżce sukcesu — router.refresh()
      // odświeża server components, ale zachowuje stan klienta (busy=true
      // zostawiłoby spinner na zawsze).
      setBusy(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={muted
        ? 'Powiadomienia automatyczne WYŁĄCZONE dla tej rezerwacji — kliknij, aby włączyć'
        : 'Powiadomienia automatyczne włączone (e-mail/SMS/zadanie przed wygaśnięciem) — kliknij, aby wyłączyć'}
      className={`px-2.5 py-1 text-xs font-medium border rounded inline-flex items-center gap-1 disabled:opacity-50 ${
        muted
          ? 'text-gray-500 border-gray-300 bg-gray-100 hover:bg-gray-200'
          : 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
      }`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : muted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
      {muted ? 'Wyciszone' : 'Powiadomienia'}
    </button>
  )
}

export function ExtendButton({ unitId, defaultDays = 7 }: { unitId: string; defaultDays?: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState(defaultDays)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/reservations/${unitId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd przedłużenia')
      setOpen(false); router.refresh()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded hover:bg-blue-50 inline-flex items-center gap-1"
      >
        <Clock className="w-3.5 h-3.5" />
        Przedłuż
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Przedłuż rezerwację</h3>
            <p className="text-sm text-gray-600 mb-4">Nowa data wygaśnięcia liczona od <strong>teraz</strong> (nie od poprzedniej daty).</p>
            <label className="block text-xs text-gray-600 mb-1">Liczba dni</label>
            <input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)} disabled={busy} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Anuluj</button>
              <button onClick={submit} disabled={busy} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? 'Zapisuję...' : `Przedłuż o ${days} dni`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

type FreeUnit = { id: string; number: string; type: string; area: number; priceGross: number }

export function SwapButton({ unitId, unitNumber, unitType }: { unitId: string; unitNumber: string; unitType: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [units, setUnits] = useState<FreeUnit[]>([])
  const [loading, setLoading] = useState(false)
  const [sameTypeOnly, setSameTypeOnly] = useState(true)
  const [selected, setSelected] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openDialog() {
    setOpen(true); setLoading(true); setError(null); setSelected('')
    try {
      const res = await fetch('/api/units?status=WOLNY')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Błąd pobierania lokali')
      setUnits((Array.isArray(data) ? data : []).map((u: any) => ({
        id: u.id, number: u.number, type: u.type, area: u.area, priceGross: u.priceGross,
      })))
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  async function submit() {
    if (!selected) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/reservations/${unitId}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUnitId: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd zamiany')
      setOpen(false); router.refresh()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const visible = sameTypeOnly ? units.filter((u) => u.type === unitType) : units

  return (
    <>
      <button
        onClick={openDialog}
        className="px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-300 rounded hover:bg-amber-50 inline-flex items-center gap-1"
      >
        <ArrowLeftRight className="w-3.5 h-3.5" />
        Zamień
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Zamień lokal {unitNumber}</h3>
            <p className="text-sm text-gray-600 mb-4">
              Obecny lokal wróci do „Wolny", a wybrany przejmie rezerwację (ten sam klient i data wygaśnięcia).
            </p>

            <label className="flex items-center gap-2 mb-3 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={sameTypeOnly} onChange={(e) => setSameTypeOnly(e.target.checked)} className="rounded border-gray-300" />
              Tylko ten sam typ ({UNIT_TYPE_LABELS[unitType as UnitType] || unitType})
            </label>

            {loading ? (
              <div className="py-8 text-center text-sm text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Ładuję wolne lokale…</div>
            ) : visible.length === 0 ? (
              <p className="py-6 text-sm text-gray-400 text-center">Brak wolnych lokali {sameTypeOnly ? 'tego typu' : ''}.</p>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto divide-y divide-gray-100">
                {visible.map((u) => (
                  <label key={u.id} className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-gray-50 ${selected === u.id ? 'bg-blue-50' : ''}`}>
                    <input type="radio" name="swap-unit" checked={selected === u.id} onChange={() => setSelected(u.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{u.number}</p>
                      <p className="text-xs text-gray-500">
                        {UNIT_TYPE_LABELS[u.type as UnitType] || u.type} · {u.area} m² · {u.priceGross.toLocaleString('pl-PL')} zł
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)} disabled={busy} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Anuluj</button>
              <button onClick={submit} disabled={busy || !selected} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? 'Zamieniam...' : 'Zamień'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function ReleaseButton({ unitId, unitNumber }: { unitId: string; unitNumber: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function release() {
    setBusy(true)
    try {
      const res = await fetch(`/api/reservations/${unitId}/release`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Błąd zwalniania')
        setBusy(false); return
      }
      setConfirm(false); router.refresh()
    } catch (e: any) { alert(e.message); setBusy(false) }
  }

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className="px-2.5 py-1 text-xs font-medium text-red-700 border border-red-300 rounded hover:bg-red-50 inline-flex items-center gap-1"
      >
        <X className="w-3.5 h-3.5" />
        Zwolnij
      </button>
      {confirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && setConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Zwolnić rezerwację?</h3>
            <p className="text-sm text-gray-700">Lokal <strong>{unitNumber}</strong> wróci do statusu „Wolny", powiązanie z klientem zostanie usunięte. Tej operacji nie można cofnąć.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirm(false)} disabled={busy} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Anuluj</button>
              <button onClick={release} disabled={busy} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? 'Zwalniam...' : 'Tak, zwolnij'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function RestoreFromUnavailableButton({ unitId, unitNumber }: { unitId: string; unitNumber: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function restore() {
    if (!confirm(`Przywrócić lokal ${unitNumber} do sprzedaży?`)) return
    setBusy(true)
    try {
      // PUT /api/units/[id] przyjmuje wszystkie pola — wysyłamy minimalnie ze status WOLNY.
      // Pobieramy aktualne pola lokalu i nadpisujemy tylko status, żeby nie zerować ceny/numeru.
      const fetchRes = await fetch(`/api/units/${unitId}`)
      const unit = await fetchRes.json()
      if (!fetchRes.ok) throw new Error(unit?.error || 'Błąd pobierania lokalu')
      const res = await fetch(`/api/units/${unitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...unit, status: 'WOLNY' }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Błąd przywracania') }
      router.refresh()
    } catch (e: any) { alert(e.message) } finally { setBusy(false) }
  }

  return (
    <button onClick={restore} disabled={busy} className="px-2.5 py-1 text-xs font-medium text-green-700 border border-green-300 rounded hover:bg-green-50 inline-flex items-center gap-1 disabled:opacity-50">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
      Przywróć do sprzedaży
    </button>
  )
}
