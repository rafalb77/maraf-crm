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
    } else {
      payload.pricePerSqmNet = '0'
      payload.pricePerSqmGross = '0'
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
