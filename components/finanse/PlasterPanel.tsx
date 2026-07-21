'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { fmtMoney } from '@/lib/finanse-format'
import {
  SALES_INVOICE_CATEGORIES,
  SALES_INVOICE_CATEGORY_LABELS,
  type SalesInvoiceCategory,
} from '@/lib/types'

type Props = {
  invoiceId: string
  category: string | null
  amountNet: number
  plasterRate: number | null
  plasterArea: number | null
  laborRate: number | null
  laborCost: number | null
  // Podpowiedz stawek "z umowy": ostatnia przeliczona FV TYNKI tego odbiorcy.
  suggestedRates?: { plasterRate: number | null; laborRate: number | null } | null
}

const fmtM2 = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Kategoria przychodu (Tynki/Inwestycja) + panel przeliczenia tynkow:
//   m2 = netto / stawka umowna;  robocizna = m2 * stawka robocizny;
//   marza = netto - robocizna. Zapis w DB (PATCH), zeby widok /finanse/tynki
// mial gotowe liczby.
export function PlasterPanel(p: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [rate, setRate] = useState(p.plasterRate != null ? String(p.plasterRate) : '')
  const [area, setArea] = useState(p.plasterArea != null ? String(p.plasterArea) : '')
  const [areaTouched, setAreaTouched] = useState(false)
  const [labor, setLabor] = useState(p.laborRate != null ? String(p.laborRate) : '')

  const num = (s: string) => { const n = parseFloat(s.replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0 }
  const r2 = (n: number) => Math.round(n * 100) / 100

  // Podglad na zywo: m2 z netto/stawki (chyba ze user zmienil m2 recznie).
  const autoArea = num(rate) > 0 ? r2(p.amountNet / num(rate)) : null
  const effArea = areaTouched && area !== '' ? num(area) : (autoArea ?? (area !== '' ? num(area) : null))
  const effLaborCost = effArea != null && labor !== '' ? r2(effArea * num(labor)) : null
  const margin = effLaborCost != null ? r2(p.amountNet - effLaborCost) : null
  const marginPct = margin != null && p.amountNet > 0 ? Math.round((margin / p.amountNet) * 1000) / 10 : null

  async function setCategory(next: string) {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/finanse/sales-invoices/${p.invoiceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category: next || null }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Błąd zapisu'); return }
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally {
      setSaving(false)
    }
  }

  async function savePlaster() {
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, any> = {
        plasterRate: rate !== '' ? num(rate) : null,
        laborRate: labor !== '' ? num(labor) : null,
      }
      // m2 wysylamy jawnie tylko przy recznej korekcie — inaczej serwer
      // przelicza sam z netto/stawki (zrodlo prawdy po stronie API).
      if (areaTouched && area !== '') body.plasterArea = num(area)
      else body.plasterArea = null
      const r = await fetch(`/api/finanse/sales-invoices/${p.invoiceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Błąd zapisu'); return }
      setEditing(false)
      setAreaTouched(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally {
      setSaving(false)
    }
  }

  function openEditor() {
    // Prefill: wartosci z FV, a gdy pusto — stawki z ostatniej FV tego odbiorcy.
    if (p.plasterRate == null && p.suggestedRates?.plasterRate != null) setRate(String(p.suggestedRates.plasterRate))
    if (p.laborRate == null && p.suggestedRates?.laborRate != null) setLabor(String(p.suggestedRates.laborRate))
    setAreaTouched(false)
    setArea(p.plasterArea != null ? String(p.plasterArea) : '')
    setError(null)
    setEditing(true)
  }

  const isTynki = p.category === 'TYNKI'
  const hasCalc = p.plasterRate != null || p.plasterArea != null

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Kategoria przychodu */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Kategoria przychodu</p>
          <div className="flex gap-2 flex-wrap">
            {SALES_INVOICE_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(p.category === c ? '' : c)}
                disabled={saving}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                  p.category === c
                    ? c === 'TYNKI' ? 'bg-amber-500 text-white border-amber-500' : 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                title={c === 'TYNKI' ? 'My jako podwykonawca prac tynkarskich (rozliczenie m²)' : 'My jako generalny wykonawca / deweloper (własna budowa)'}
              >
                {SALES_INVOICE_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Tynki = podwykonawstwo (rozliczenie m²) • Inwestycja = nasza budowa (GW/deweloper). Ponowny klik czyści.
          </p>
        </div>

        {/* Przeliczenie tynkow — tylko dla kategorii TYNKI */}
        {isTynki && !editing && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-amber-700 uppercase font-semibold">Tynki — przeliczenie m²</p>
              <button onClick={openEditor} className="text-xs text-blue-600 hover:text-blue-800">
                {hasCalc ? 'edytuj' : '+ przelicz m²'}
              </button>
            </div>
            {hasCalc ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-gray-500">Stawka umowna:</span>
                <span className="tabular-nums text-right font-medium">{p.plasterRate != null ? `${fmtMoney(p.plasterRate)}/m²` : '—'}</span>
                <span className="text-gray-500">Powierzchnia:</span>
                <span className="tabular-nums text-right font-semibold">{p.plasterArea != null ? `${fmtM2(p.plasterArea)} m²` : '—'}</span>
                <span className="text-gray-500">Robocizna{p.laborRate != null ? ` (${fmtMoney(p.laborRate)}/m²)` : ''}:</span>
                <span className="tabular-nums text-right font-medium">{p.laborCost != null ? fmtMoney(p.laborCost) : '—'}</span>
                {p.laborCost != null && (
                  <>
                    <span className="text-gray-500">Marża (netto − robocizna):</span>
                    <span className={`tabular-nums text-right font-semibold ${p.amountNet - p.laborCost >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmtMoney(r2(p.amountNet - p.laborCost))}
                      {p.amountNet > 0 && ` (${Math.round(((p.amountNet - p.laborCost) / p.amountNet) * 1000) / 10}%)`}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Podaj stawkę z umowy, a wyliczę m² z kwoty netto ({fmtMoney(p.amountNet)}) i robociznę.
              </p>
            )}
          </div>
        )}

        {isTynki && editing && (
          <div className="bg-white border border-amber-300 rounded-lg p-4">
            <p className="text-xs text-amber-700 uppercase font-semibold mb-3">Tynki — przeliczenie m²</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Stawka umowna zł/m²</label>
                <input
                  autoFocus
                  value={rate}
                  onChange={(e) => { setRate(e.target.value); setAreaTouched(false) }}
                  placeholder="np. 52,50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
                />
                {p.suggestedRates?.plasterRate != null && rate === '' && (
                  <p className="text-[11px] text-gray-400 mt-1">ostatnio u tego odbiorcy: {fmtMoney(p.suggestedRates.plasterRate)}/m²</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">
                  m² {!areaTouched && autoArea != null && <span className="text-gray-400 normal-case">(auto: netto ÷ stawka)</span>}
                </label>
                <input
                  value={areaTouched ? area : (autoArea != null ? String(autoArea) : area)}
                  onChange={(e) => { setArea(e.target.value); setAreaTouched(true) }}
                  placeholder="—"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
                  title="Auto z netto ÷ stawka. Możesz ręcznie skorygować wg protokołu odbioru."
                />
                {areaTouched && autoArea != null && (
                  <button type="button" onClick={() => { setAreaTouched(false); setArea('') }} className="text-[11px] text-blue-600 hover:text-blue-800 mt-1">
                    ↺ przelicz z netto ({fmtM2(autoArea)} m²)
                  </button>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Robocizna zł/m²</label>
                <input
                  value={labor}
                  onChange={(e) => setLabor(e.target.value)}
                  placeholder="np. 30"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
                />
                {p.suggestedRates?.laborRate != null && labor === '' && (
                  <p className="text-[11px] text-gray-400 mt-1">ostatnio: {fmtMoney(p.suggestedRates.laborRate)}/m²</p>
                )}
              </div>
              <div className="flex flex-col justify-end text-sm">
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Wynik</p>
                <p className="tabular-nums">{effArea != null ? `${fmtM2(effArea)} m²` : '— m²'}</p>
                <p className="tabular-nums text-gray-600">robocizna: {effLaborCost != null ? fmtMoney(effLaborCost) : '—'}</p>
                <p className={`tabular-nums font-semibold ${margin == null ? 'text-gray-400' : margin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  marża: {margin != null ? `${fmtMoney(margin)} (${marginPct}%)` : '—'}
                </p>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={savePlaster} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Zapisuję…' : 'Zapisz'}
              </button>
              <button onClick={() => { setEditing(false); setError(null) }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Anuluj</button>
            </div>
          </div>
        )}
      </div>
      {error && !editing && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
