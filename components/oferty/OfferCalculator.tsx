'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const inputCls = 'px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const TYPE_LABELS: Record<string, string> = {
  MIESZKALNY: 'Mieszkanie',
  USLUGOWY: 'Usługowy',
  PARKING: 'Miejsce postojowe',
  GARAZ: 'Garaż',
  KOMORKA: 'Komórka',
}
const TYPE_BADGE: Record<string, string> = {
  MIESZKALNY: 'bg-blue-50 text-blue-700',
  USLUGOWY: 'bg-purple-50 text-purple-700',
  PARKING: 'bg-amber-50 text-amber-700',
  GARAZ: 'bg-orange-50 text-orange-700',
  KOMORKA: 'bg-gray-100 text-gray-700',
}

type Unit = {
  id: string
  number: string
  type: string
  area: number
  pricePerSqmNet: number
  pricePerSqmGross: number
  priceNet: number
  priceGross: number
  vatRate: number
  status: string
}

type Client = { id: string; name: string }

type Item = {
  key: string
  unitId: string | null
  label: string
  unitType: string
  area: number
  pricePerSqmNet: number
  pricePerSqmGross: number
  priceNet: number
  priceGross: number
  vatRate: number
  discountType: 'PCT' | 'AMOUNT_NET'
  discountValue: number
}

type InitialOffer = {
  id: string
  title: string | null
  clientId: string | null
  validUntil: string | null
  notes: string | null
  items: Item[]
}

export function OfferCalculator({
  units,
  clients,
  initial,
}: {
  units: Unit[]
  clients: Client[]
  initial?: InitialOffer
}) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title || '')
  const [clientId, setClientId] = useState(initial?.clientId || '')
  const [validUntil, setValidUntil] = useState(initial?.validUntil ? initial.validUntil.slice(0, 10) : '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [items, setItems] = useState<Item[]>(initial?.items || [])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!initial

  function addUnit(u: Unit) {
    if (items.some((it) => it.unitId === u.id)) return
    const item: Item = {
      key: `u-${u.id}-${Date.now()}`,
      unitId: u.id,
      label: u.number,
      unitType: u.type,
      area: u.area,
      pricePerSqmNet: u.pricePerSqmNet,
      pricePerSqmGross: u.pricePerSqmGross,
      priceNet: u.priceNet,
      priceGross: u.priceGross,
      vatRate: u.vatRate,
      discountType: 'PCT',
      discountValue: 0,
    }
    setItems((arr) => [...arr, item])
  }

  function addCustomItem(input: {
    label: string
    unitType: string
    area: number
    priceNet: number
    vatRate: number
  }) {
    const priceGross = input.priceNet * (1 + input.vatRate / 100)
    const item: Item = {
      key: `custom-${Date.now()}`,
      unitId: null,
      label: input.label,
      unitType: input.unitType,
      area: input.area,
      pricePerSqmNet: input.area > 0 ? input.priceNet / input.area : 0,
      pricePerSqmGross: input.area > 0 ? priceGross / input.area : 0,
      priceNet: input.priceNet,
      priceGross,
      vatRate: input.vatRate,
      discountType: 'PCT',
      discountValue: 0,
    }
    setItems((arr) => [...arr, item])
    setCustomOpen(false)
  }

  function removeItem(key: string) {
    setItems((arr) => arr.filter((it) => it.key !== key))
  }

  function updateItem(key: string, patch: Partial<Item>) {
    setItems((arr) => arr.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  // Sumy live
  const sums = useMemo(() => {
    let subtotalNet = 0
    let subtotalGross = 0
    let totalDiscountNet = 0
    let totalDiscountGross = 0
    let totalNet = 0
    let totalGross = 0
    for (const it of items) {
      const dNet = computeDiscountNet(it)
      const dGross = dNet * (1 + it.vatRate / 100)
      const fNet = it.priceNet - dNet
      const fGross = it.priceGross - dGross
      subtotalNet += it.priceNet
      subtotalGross += it.priceGross
      totalDiscountNet += dNet
      totalDiscountGross += dGross
      totalNet += fNet
      totalGross += fGross
    }
    return { subtotalNet, subtotalGross, totalDiscountNet, totalDiscountGross, totalNet, totalGross }
  }, [items])

  async function save() {
    if (items.length === 0) {
      setError('Dodaj przynajmniej jedną pozycję')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = isEdit ? `/api/oferty/${initial!.id}` : '/api/oferty'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || null,
          clientId: clientId || null,
          validUntil: validUntil || null,
          notes: notes || null,
          items: items.map((it, idx) => ({
            position: idx + 1,
            unitId: it.unitId,
            label: it.label,
            unitType: it.unitType,
            area: it.area,
            pricePerSqmNet: it.pricePerSqmNet,
            pricePerSqmGross: it.pricePerSqmGross,
            priceNet: it.priceNet,
            priceGross: it.priceGross,
            vatRate: it.vatRate,
            discountType: it.discountType,
            discountValue: it.discountValue,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd zapisu')
      router.push(`/oferty/${isEdit ? initial!.id : data.id}`)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  const availableUnits = units.filter((u) => {
    if (items.some((it) => it.unitId === u.id)) return false
    if (filterType && u.type !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      if (!u.number.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="space-y-5">
      {/* Header — dane oferty */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Dane oferty</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tytuł oferty</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="np. Oferta dla państwa Kowalskich"
              className={inputCls + ' w-full'}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Klient (opcjonalnie)</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls + ' w-full bg-white'}>
              <option value="">— bez przypisania —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Ważna do</label>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputCls + ' w-full'} />
          </div>
        </div>
      </div>

      {/* Pozycje */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Pozycje oferty ({items.length})</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { setCustomOpen(false); setPickerOpen(!pickerOpen) }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium"
            >
              {pickerOpen ? 'Zamknij listę' : '+ Dodaj lokal'}
            </button>
            <button
              onClick={() => { setPickerOpen(false); setCustomOpen(!customOpen) }}
              className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-medium"
            >
              {customOpen ? 'Zamknij' : '+ Pozycja niestandardowa'}
            </button>
          </div>
        </div>

        {customOpen && <CustomItemForm onAdd={addCustomItem} onCancel={() => setCustomOpen(false)} />}

        {pickerOpen && (
          <div className="px-5 py-3 bg-gray-50/60 border-b border-gray-100">
            <div className="flex gap-2 mb-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Szukaj numeru..."
                className={inputCls + ' flex-1'}
              />
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={inputCls + ' bg-white'}>
                <option value="">Wszystkie typy</option>
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {availableUnits.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">Brak dostępnych lokali</p>
              ) : (
                availableUnits.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addUnit(u)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-200 rounded hover:border-blue-300 hover:bg-blue-50/30 text-left text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`inline-block px-2 py-0.5 text-[10px] uppercase rounded ${TYPE_BADGE[u.type] || 'bg-gray-100'}`}>
                        {TYPE_LABELS[u.type] || u.type}
                      </span>
                      <span className="font-mono font-medium">{u.number}</span>
                      <span className="text-gray-500">{u.area.toFixed(2)} m²</span>
                    </div>
                    <span className="text-gray-700 tabular-nums">
                      {fmt(u.priceGross)} zł brutto
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Brak pozycji. Kliknij <strong>+ Dodaj lokal</strong> żeby zacząć.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 bg-gray-50/60">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Typ</th>
                  <th className="text-left px-3 py-2 font-medium">Nr</th>
                  <th className="text-right px-2 py-2 font-medium">Pow. m²</th>
                  <th className="text-right px-2 py-2 font-medium">Cena za m²<br/>netto</th>
                  <th className="text-right px-2 py-2 font-medium">Cena za m²<br/>brutto</th>
                  <th className="text-right px-2 py-2 font-medium">Cena netto</th>
                  <th className="text-right px-2 py-2 font-medium">Cena brutto</th>
                  <th className="text-center px-2 py-2 font-medium">Rabat</th>
                  <th className="text-right px-2 py-2 font-medium bg-amber-50/40">Po rabacie<br/>netto</th>
                  <th className="text-right px-3 py-2 font-medium bg-green-50/40">Po rabacie<br/>brutto</th>
                  <th className="px-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const dNet = computeDiscountNet(it)
                  const fNet = it.priceNet - dNet
                  const fGross = it.priceGross - dNet * (1 + it.vatRate / 100)
                  return (
                    <tr key={it.key} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 text-[10px] uppercase rounded ${TYPE_BADGE[it.unitType] || 'bg-gray-100'}`}>
                          {TYPE_LABELS[it.unitType] || it.unitType}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono font-medium">{it.label}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{it.area.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmt(it.pricePerSqmNet)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmt(it.pricePerSqmGross)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(it.priceNet)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(it.priceGross)}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.discountValue || ''}
                            onChange={(e) => updateItem(it.key, { discountValue: Number(e.target.value) || 0 })}
                            placeholder="0"
                            className={inputCls + ' w-20 text-right tabular-nums'}
                          />
                          <select
                            value={it.discountType}
                            onChange={(e) => updateItem(it.key, { discountType: e.target.value as any })}
                            className="px-1 py-1 border border-gray-300 rounded text-xs bg-white"
                          >
                            <option value="PCT">%</option>
                            <option value="AMOUNT_NET">zł</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium bg-amber-50/40">
                        {fmt(fNet)}
                        {dNet > 0 && (
                          <p className="text-[10px] text-amber-700">−{fmt(dNet)}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold bg-green-50/40 text-green-800">
                        {fmt(fGross)}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => removeItem(it.key)}
                          className="text-red-500 hover:text-red-700 text-xs"
                          title="Usuń pozycję"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sumy + zapis */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Podsumowanie</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <SummaryRow label="Suma netto przed rabatem" value={`${fmt(sums.subtotalNet)} zł`} />
            <SummaryRow label="Suma brutto przed rabatem" value={`${fmt(sums.subtotalGross)} zł`} />
            <SummaryRow
              label="Łączny rabat netto"
              value={sums.totalDiscountNet > 0 ? `−${fmt(sums.totalDiscountNet)} zł` : '—'}
              accent={sums.totalDiscountNet > 0 ? 'amber' : undefined}
            />
            <SummaryRow
              label="Łączny rabat brutto"
              value={sums.totalDiscountGross > 0 ? `−${fmt(sums.totalDiscountGross)} zł` : '—'}
              accent={sums.totalDiscountGross > 0 ? 'amber' : undefined}
            />
          </div>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div>
              <p className="text-xs text-gray-500">Suma netto po rabacie</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmt(sums.totalNet)} zł</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Suma brutto po rabacie</p>
              <p className="text-3xl font-bold text-green-700 tabular-nums">{fmt(sums.totalGross)} zł</p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="block text-xs text-gray-600 mb-1">Notatki / warunki oferty</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="np. Oferta ważna 14 dni. Cena nie obejmuje opłat notarialnych."
            className={inputCls + ' w-full resize-none'}
          />
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={save}
            disabled={saving || items.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            {saving ? 'Zapisuję...' : isEdit ? '💾 Zapisz zmiany' : '💾 Zapisz ofertę'}
          </button>
          <p className="text-xs text-gray-500">
            {isEdit ? 'Zmiany nadpiszą bieżącą ofertę.' : 'Po zapisie zostaniesz przekierowany do podglądu oferty.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function computeDiscountNet(it: Item): number {
  if (!it.discountValue || it.discountValue <= 0) return 0
  if (it.discountType === 'PCT') return it.priceNet * (it.discountValue / 100)
  return Math.min(it.discountValue, it.priceNet)
}

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function CustomItemForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: { label: string; unitType: string; area: number; priceNet: number; vatRate: number }) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState('')
  const [unitType, setUnitType] = useState('MIESZKALNY')
  const [area, setArea] = useState('')
  const [priceMode, setPriceMode] = useState<'TOTAL_NET' | 'PER_SQM_NET'>('TOTAL_NET')
  const [priceValue, setPriceValue] = useState('')
  const [vatRate, setVatRate] = useState(8)

  const a = Number(area) || 0
  const p = Number(priceValue) || 0
  const priceNet = priceMode === 'TOTAL_NET' ? p : p * a
  const priceGross = priceNet * (1 + vatRate / 100)

  return (
    <div className="px-5 py-4 bg-gray-50/60 border-b border-gray-100">
      <p className="text-sm font-medium text-gray-700 mb-3">Niestandardowa pozycja</p>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-600 mb-1">Opis pozycji</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="np. Dodatkowy taras"
            className={inputCls + ' w-full'}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Typ</label>
          <select value={unitType} onChange={(e) => setUnitType(e.target.value)} className={inputCls + ' w-full bg-white'}>
            <option value="MIESZKALNY">Mieszkanie</option>
            <option value="USLUGOWY">Usługowy</option>
            <option value="PARKING">Parking</option>
            <option value="GARAZ">Garaż</option>
            <option value="KOMORKA">Komórka</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Powierzchnia [m²]</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="0,00"
            className={inputCls + ' w-full text-right'}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Cena</label>
          <div className="flex gap-1">
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              placeholder="0,00"
              className={inputCls + ' w-full text-right'}
            />
            <select value={priceMode} onChange={(e) => setPriceMode(e.target.value as any)} className="px-1 py-1 border border-gray-300 rounded text-xs bg-white">
              <option value="TOTAL_NET">całość netto</option>
              <option value="PER_SQM_NET">zł/m² netto</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">VAT [%]</label>
          <input
            type="number"
            min="0"
            max="30"
            value={vatRate}
            onChange={(e) => setVatRate(Number(e.target.value) || 0)}
            className={inputCls + ' w-full text-right'}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-gray-600">
          {priceNet > 0 && (
            <>
              Netto: <strong className="tabular-nums">{fmt(priceNet)} zł</strong>
              {' · '}
              Brutto: <strong className="tabular-nums">{fmt(priceGross)} zł</strong>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
          >
            Anuluj
          </button>
          <button
            onClick={() => onAdd({ label: label.trim(), unitType, area: a, priceNet, vatRate })}
            disabled={!label.trim() || priceNet <= 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded text-sm font-medium"
          >
            Dodaj pozycję
          </button>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: 'amber' }) {
  const color = accent === 'amber' ? 'text-amber-700' : 'text-gray-900'
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${color}`}>{value}</span>
    </div>
  )
}
