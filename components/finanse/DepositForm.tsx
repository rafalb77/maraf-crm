'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { fmtMoney, fmtDate } from '@/lib/finanse-format'

type Props = {
  invoiceId: string
  amountGross: number
  deposit: number | null
  depositPct: number | null
  buildingCosts: number | null
  electricity: number | null
  depositReturnDate: string | null
  depositReturnedAt: string | null
}

export function DepositForm(p: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pct, setPct] = useState(p.depositPct != null ? String(p.depositPct) : '')
  const [deposit, setDeposit] = useState(p.deposit != null ? String(p.deposit) : '')
  const [kb, setKb] = useState(p.buildingCosts != null ? String(p.buildingCosts) : '')
  const [prad, setPrad] = useState(p.electricity != null ? String(p.electricity) : '')
  const [returnDate, setReturnDate] = useState(p.depositReturnDate ? p.depositReturnDate.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return isFinite(n) ? n : 0 }
  const depFromPct = pct ? Math.round(p.amountGross * (num(pct) / 100) * 100) / 100 : null
  const effectiveDeposit = deposit ? num(deposit) : (depFromPct || 0)
  const payable = Math.round((p.amountGross - effectiveDeposit - num(kb) - num(prad)) * 100) / 100

  async function save(extra: Record<string, any> = {}) {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/finanse/invoices/${p.invoiceId}/deposit`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          depositPct: pct ? num(pct) : null,
          deposit: deposit ? num(deposit) : (depFromPct ?? null),
          buildingCosts: kb ? num(kb) : null,
          electricity: prad ? num(prad) : null,
          depositReturnDate: returnDate || null,
          ...extra,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Blad'); return }
      router.refresh()
      setOpen(false)
    } catch (e: any) {
      setError(e.message || 'Blad sieci')
    } finally {
      setSaving(false)
    }
  }

  const hasDeductions = (p.deposit || 0) + (p.buildingCosts || 0) + (p.electricity || 0) > 0

  // Widok zwiniety (podsumowanie)
  if (!open) {
    if (!hasDeductions) {
      return (
        <button onClick={() => setOpen(true)} className="text-sm text-blue-600 hover:text-blue-800">
          + Dodaj kaucję / potrącenia
        </button>
      )
    }
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-amber-700 uppercase font-semibold">Kaucja i potrącenia</p>
          <button onClick={() => setOpen(true)} className="text-xs text-blue-600 hover:text-blue-800">edytuj</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {p.deposit ? (
            <div>
              <span className="text-gray-500">Kaucja{p.depositPct ? ` (${p.depositPct}%)` : ''}:</span>{' '}
              <strong>{fmtMoney(p.deposit)}</strong>
            </div>
          ) : null}
          {p.buildingCosts ? <div><span className="text-gray-500">Koszty budowy:</span> <strong>{fmtMoney(p.buildingCosts)}</strong></div> : null}
          {p.electricity ? <div><span className="text-gray-500">Prąd:</span> <strong>{fmtMoney(p.electricity)}</strong></div> : null}
          <div><span className="text-gray-500">Do zapłaty:</span> <strong className="text-gray-900">{fmtMoney(payable)}</strong></div>
        </div>
        {p.deposit ? (
          <div className="mt-3 pt-3 border-t border-amber-200 flex items-center justify-between flex-wrap gap-2 text-sm">
            <div>
              <span className="text-gray-500">Zwrot kaucji:</span>{' '}
              {p.depositReturnedAt ? (
                <span className="text-green-700 font-medium">✓ zwrócona {fmtDate(p.depositReturnedAt)}</span>
              ) : (
                <span>termin <strong>{fmtDate(p.depositReturnDate)}</strong></span>
              )}
            </div>
            {!p.depositReturnedAt && (
              <button
                onClick={() => save({ markReturned: true })}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
              >
                Oznacz kaucję jako zwróconą
              </button>
            )}
            {p.depositReturnedAt && (
              <button onClick={() => save({ markReturned: false })} disabled={saving} className="text-xs text-gray-500 hover:text-gray-700">
                cofnij zwrot
              </button>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  // Widok edycji
  return (
    <div className="bg-white border border-gray-300 rounded-lg p-4">
      <p className="text-sm font-semibold text-gray-900 mb-3">Kaucja i potrącenia</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Kaucja %</label>
          <input value={pct} onChange={(e) => { setPct(e.target.value); setDeposit('') }} placeholder="np. 5" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
          {depFromPct != null && !deposit && <p className="text-xs text-gray-400 mt-1">= {fmtMoney(depFromPct)}</p>}
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">lub kwota kaucji</label>
          <input value={deposit} onChange={(e) => { setDeposit(e.target.value); setPct('') }} placeholder="zł" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Data zwrotu kaucji</label>
          <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Koszty budowy (KB)</label>
          <input value={kb} onChange={(e) => setKb(e.target.value)} placeholder="zł" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Prąd</label>
          <input value={prad} onChange={(e) => setPrad(e.target.value)} placeholder="zł" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
        </div>
        <div className="flex flex-col justify-end">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Do zapłaty</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">{fmtMoney(payable)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Do zapłaty = brutto ({fmtMoney(p.amountGross)}) − kaucja − koszty budowy − prąd. Kaucja zwracana osobno po terminie.
      </p>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={() => save()} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? 'Zapisuję...' : 'Zapisz'}
        </button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Anuluj</button>
      </div>
    </div>
  )
}
