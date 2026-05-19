'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Unit } from '@prisma/client'
import { formatCurrency } from '@/lib/utils'

const TYPES = [
  { value: 'MIESZKALNY', label: 'Mieszkanie' },
  { value: 'USLUGOWY', label: 'Lokal usługowy' },
  { value: 'PARKING', label: 'Miejsce parkingowe' },
  { value: 'GARAZ', label: 'Miejsce garażowe' },
  { value: 'KOMORKA', label: 'Komórka lokatorska' },
]

// Types where price is computed as area × price/m² (per-sqm pricing)
const PER_SQM_TYPES = new Set(['MIESZKALNY', 'USLUGOWY', 'KOMORKA'])
const isPerSqm = (t: string) => PER_SQM_TYPES.has(t)

const STATUSES = [
  { value: 'WOLNY', label: 'Wolny' },
  { value: 'ZAREZERWOWANY', label: 'Zarezerwowany' },
  { value: 'SPRZEDANY', label: 'Sprzedany' },
  { value: 'NIEDOSTEPNY', label: 'Niedostępny' },
]

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

export function UnitForm({ unit }: { unit?: Unit }) {
  const router = useRouter()
  const initialType = unit?.type || 'MIESZKALNY'
  const [form, setForm] = useState({
    number: unit?.number || '',
    type: initialType,
    area: unit?.area?.toString() || '',
    pricePerSqmNet: unit?.pricePerSqmNet?.toString() || '',
    pricePerSqmGross: unit?.pricePerSqmGross?.toString() || '',
    priceNet: unit?.priceNet?.toString() || '',
    priceGross: unit?.priceGross?.toString() || '',
    vatRate: unit?.vatRate?.toString() || '8',
    floor: unit?.floor?.toString() || '',
    rooms: unit?.rooms?.toString() || '',
    building: unit?.building || '',
    description: unit?.description || '',
    status: unit?.status || 'WOLNY',
    // Pola integracji 3D Estate — visibleOnMatrix + promocje
    visibleOnMatrix: unit?.visibleOnMatrix ?? true,
    promoActive: unit?.promoActive ?? false,
    promoPricePerSqmNet: unit?.promoPricePerSqmNet?.toString() || '',
    promoPricePerSqmGross: unit?.promoPricePerSqmGross?.toString() || '',
    promoPriceNet: unit?.promoPriceNet?.toString() || '',
    promoPriceGross: unit?.promoPriceGross?.toString() || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const perSqm = isPerSqm(form.type)

  // Computed totals (only for per-sqm pricing)
  const { totalNet, totalGross } = useMemo(() => {
    const area = parseFloat(form.area)
    const ppmNet = parseFloat(form.pricePerSqmNet)
    const ppmGross = parseFloat(form.pricePerSqmGross)
    return {
      totalNet: !isNaN(area) && !isNaN(ppmNet) ? area * ppmNet : null,
      totalGross: !isNaN(area) && !isNaN(ppmGross) ? area * ppmGross : null,
    }
  }, [form.area, form.pricePerSqmNet, form.pricePerSqmGross])

  function setPpmNet(value: string) {
    const v = parseFloat(value)
    const vat = parseInt(form.vatRate)
    const next: Partial<typeof form> = { pricePerSqmNet: value }
    if (!isNaN(v) && !isNaN(vat)) {
      next.pricePerSqmGross = (v * (1 + vat / 100)).toFixed(2)
    }
    setForm((f) => ({ ...f, ...next }))
  }

  function setPpmGross(value: string) {
    const v = parseFloat(value)
    const vat = parseInt(form.vatRate)
    const next: Partial<typeof form> = { pricePerSqmGross: value }
    if (!isNaN(v) && !isNaN(vat) && vat >= 0) {
      next.pricePerSqmNet = (v / (1 + vat / 100)).toFixed(2)
    }
    setForm((f) => ({ ...f, ...next }))
  }

  function setPriceNet(value: string) {
    const v = parseFloat(value)
    const vat = parseInt(form.vatRate)
    const next: Partial<typeof form> = { priceNet: value }
    if (!isNaN(v) && !isNaN(vat)) {
      next.priceGross = (v * (1 + vat / 100)).toFixed(2)
    }
    setForm((f) => ({ ...f, ...next }))
  }

  function setPriceGross(value: string) {
    const v = parseFloat(value)
    const vat = parseInt(form.vatRate)
    const next: Partial<typeof form> = { priceGross: value }
    if (!isNaN(v) && !isNaN(vat) && vat >= 0) {
      next.priceNet = (v / (1 + vat / 100)).toFixed(2)
    }
    setForm((f) => ({ ...f, ...next }))
  }

  function setVat(value: string) {
    const vat = parseInt(value)
    const next: Partial<typeof form> = { vatRate: value }
    if (!isNaN(vat)) {
      // Recalc gross from net for both per-sqm and total pricing
      const ppmNet = parseFloat(form.pricePerSqmNet)
      if (!isNaN(ppmNet)) {
        next.pricePerSqmGross = (ppmNet * (1 + vat / 100)).toFixed(2)
      }
      const pNet = parseFloat(form.priceNet)
      if (!isNaN(pNet)) {
        next.priceGross = (pNet * (1 + vat / 100)).toFixed(2)
      }
      // Promo prices — same VAT recalculation
      const promoPpmNet = parseFloat(form.promoPricePerSqmNet)
      if (!isNaN(promoPpmNet)) {
        next.promoPricePerSqmGross = (promoPpmNet * (1 + vat / 100)).toFixed(2)
      }
      const promoNet = parseFloat(form.promoPriceNet)
      if (!isNaN(promoNet)) {
        next.promoPriceGross = (promoNet * (1 + vat / 100)).toFixed(2)
      }
    }
    setForm((f) => ({ ...f, ...next }))
  }

  // --- PROMO price setters (mirror logiki cen bazowych) ---
  function setPromoPpmNet(value: string) {
    const v = parseFloat(value)
    const vat = parseInt(form.vatRate)
    const next: Partial<typeof form> = { promoPricePerSqmNet: value }
    if (!isNaN(v) && !isNaN(vat)) {
      next.promoPricePerSqmGross = (v * (1 + vat / 100)).toFixed(2)
    }
    setForm((f) => ({ ...f, ...next }))
  }

  function setPromoPpmGross(value: string) {
    const v = parseFloat(value)
    const vat = parseInt(form.vatRate)
    const next: Partial<typeof form> = { promoPricePerSqmGross: value }
    if (!isNaN(v) && !isNaN(vat) && vat >= 0) {
      next.promoPricePerSqmNet = (v / (1 + vat / 100)).toFixed(2)
    }
    setForm((f) => ({ ...f, ...next }))
  }

  function setPromoPriceNet(value: string) {
    const v = parseFloat(value)
    const vat = parseInt(form.vatRate)
    const next: Partial<typeof form> = { promoPriceNet: value }
    if (!isNaN(v) && !isNaN(vat)) {
      next.promoPriceGross = (v * (1 + vat / 100)).toFixed(2)
    }
    setForm((f) => ({ ...f, ...next }))
  }

  function setPromoPriceGross(value: string) {
    const v = parseFloat(value)
    const vat = parseInt(form.vatRate)
    const next: Partial<typeof form> = { promoPriceGross: value }
    if (!isNaN(v) && !isNaN(vat) && vat >= 0) {
      next.promoPriceNet = (v / (1 + vat / 100)).toFixed(2)
    }
    setForm((f) => ({ ...f, ...next }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const url = unit ? `/api/units/${unit.id}` : '/api/units'
    const method = unit ? 'PUT' : 'POST'

    // Send computed values aligned with pricing mode
    const payload: Record<string, any> = { ...form }
    if (perSqm) {
      // Server will compute priceNet/priceGross = area × ppm
      payload.priceNet = ''
      payload.priceGross = ''
      payload.promoPriceNet = ''
      payload.promoPriceGross = ''
    } else {
      payload.pricePerSqmNet = '0'
      payload.pricePerSqmGross = '0'
      payload.promoPricePerSqmNet = '0'
      payload.promoPricePerSqmGross = '0'
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const data = await res.json()
      router.push(`/units/${data.id}`)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error || 'Błąd zapisu')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Numer lokalu *</label>
          <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })}
            required className={inputCls} placeholder="np. M-01" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Typ lokalu *</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
            className={inputCls + ' bg-white'}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Powierzchnia (m²) {perSqm ? '*' : ''}
          </label>
          <input type="number" step="0.01" value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
            required={perSqm} className={inputCls} placeholder="np. 52.50" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Piętro</label>
          <input type="number" value={form.floor}
            onChange={(e) => setForm({ ...form, floor: e.target.value })}
            className={inputCls} placeholder="0 = parter, -1 = podziemie" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Liczba pokoi</label>
          <input type="number" min="0" value={form.rooms}
            onChange={(e) => setForm({ ...form, rooms: e.target.value })}
            className={inputCls} placeholder="np. 3" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">VAT (%)</label>
          <select value={form.vatRate} onChange={(e) => setVat(e.target.value)}
            className={inputCls + ' bg-white'}>
            <option value="8">8%</option>
            <option value="23">23%</option>
            <option value="0">0%</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
            className={inputCls + ' bg-white'}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {perSqm ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cena za m² netto (PLN) *</label>
              <input type="number" step="0.01" value={form.pricePerSqmNet}
                onChange={(e) => setPpmNet(e.target.value)}
                required className={inputCls} placeholder="np. 9500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cena za m² brutto (PLN) *</label>
              <input type="number" step="0.01" value={form.pricePerSqmGross}
                onChange={(e) => setPpmGross(e.target.value)}
                required className={inputCls} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cena netto (PLN) *</label>
              <input type="number" step="0.01" value={form.priceNet}
                onChange={(e) => setPriceNet(e.target.value)}
                required className={inputCls} placeholder="np. 50000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cena brutto (PLN) *</label>
              <input type="number" step="0.01" value={form.priceGross}
                onChange={(e) => setPriceGross(e.target.value)}
                required className={inputCls} />
            </div>
          </>
        )}
      </div>

      {/* Summary: totals (only for per-sqm pricing) */}
      {perSqm && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <p className="text-xs uppercase font-semibold text-blue-700 mb-2">Cena lokalu (powierzchnia × cena za m²)</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Łącznie netto:</span>{' '}
              <span className="font-semibold text-gray-900">
                {totalNet != null ? formatCurrency(totalNet) : '—'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Łącznie brutto:</span>{' '}
              <span className="font-semibold text-gray-900">
                {totalGross != null ? formatCurrency(totalGross) : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Budynek</label>
        <input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })}
          className={inputCls} placeholder="np. A" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Opis</label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3} className={inputCls + ' resize-none'} placeholder="Dodatkowe informacje o lokalu..." />
      </div>

      {/* Sekcja: Widoczność na matrycy 3D + promocja (integracja 3D Estate) */}
      <div className="border-t border-gray-100 pt-5">
        <h3 className="font-semibold text-gray-900 mb-1">Matryca 3D (3D Estate)</h3>
        <p className="text-xs text-gray-500 mb-4">
          Pola wpływające na to jak lokal wyświetla się na matrycy 3D na stronie inwestycji.
        </p>

        <div className="space-y-4">
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox"
              checked={form.visibleOnMatrix}
              onChange={(e) => setForm({ ...form, visibleOnMatrix: e.target.checked })}
              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span>
              Widoczny na matrycy 3D
              <span className="block text-xs text-gray-500 mt-0.5">
                Odznacz, żeby ukryć lokal na matrycy niezależnie od statusu (np. przed wprowadzeniem do sprzedaży).
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox"
              checked={form.promoActive}
              onChange={(e) => setForm({ ...form, promoActive: e.target.checked })}
              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span>
              Promocja aktywna
              <span className="block text-xs text-gray-500 mt-0.5">
                Po zaznaczeniu 3D Estate pokaże cenę promocyjną z przekreśloną ceną bazową.
                <strong className="text-amber-700"> ⚠️ Uwaga Omnibus:</strong> w pierwszych 30 dniach od uruchomienia integracji
                3DE może nie wyświetlić poprawnej najniższej ceny z 30 dni (nie ma jeszcze pełnej historii odczytów).
              </span>
            </span>
          </label>

          {form.promoActive && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <p className="text-xs font-medium text-amber-900">Ceny promocyjne</p>
              <div className="grid grid-cols-2 gap-4">
                {perSqm ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Promo cena za m² netto</label>
                      <input type="number" step="0.01" value={form.promoPricePerSqmNet}
                        onChange={(e) => setPromoPpmNet(e.target.value)}
                        className={inputCls} placeholder="np. 8500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Promo cena za m² brutto</label>
                      <input type="number" step="0.01" value={form.promoPricePerSqmGross}
                        onChange={(e) => setPromoPpmGross(e.target.value)}
                        className={inputCls} />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Promo cena netto</label>
                      <input type="number" step="0.01" value={form.promoPriceNet}
                        onChange={(e) => setPromoPriceNet(e.target.value)}
                        className={inputCls} placeholder="np. 45000" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Promo cena brutto</label>
                      <input type="number" step="0.01" value={form.promoPriceGross}
                        onChange={(e) => setPromoPriceGross(e.target.value)}
                        className={inputCls} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
          {loading ? 'Zapisywanie...' : unit ? 'Zapisz zmiany' : 'Dodaj lokal'}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          Anuluj
        </button>
      </div>
    </form>
  )
}
