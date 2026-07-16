'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { Client, Unit } from '@prisma/client'
import {
  CONTRACT_TYPE_LABELS,
  UNIT_TYPE_LABELS,
  RESERVATION_CONTRACT_LIMITS,
  type ContractType,
  type UnitType,
} from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

export function ContractForm({
  clients,
  units,
  defaultClientId,
  defaultSecondaryClientId,
  reservedByClient,
}: {
  clients: Client[]
  units: Unit[]
  defaultClientId?: string
  /** Współrezerwujący preselectowany (po dodaniu nowego klienta jako drugiego). */
  defaultSecondaryClientId?: string
  /** Mapa klient → ID jego zarezerwowanych lokali. Po wybraniu klienta jego
   *  lokale zaznaczają się automatycznie (mniej klikania). */
  reservedByClient?: Record<string, string[]>
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    type: 'REZERWACYJNA' as ContractType,
    clientId: defaultClientId || '',
    secondaryClientId: defaultSecondaryClientId || '',
    investmentName: 'Inwestycja',
    reservationEndDate: '',
    reservationFeeDays: '7',
    notes: '',
  })

  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])
  // Ceny brutto per lokal (snapshot na umowie) — domyślnie z oferty/bazowe,
  // edytowalne (rabat przy tworzeniu umowy).
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>({})

  // Po wyborze klienta — auto-zaznacz jego zarezerwowane lokale (te dostępne
  // na liście). Działa też dla defaultClientId (wejście z karty klienta).
  useEffect(() => {
    if (!form.clientId || !reservedByClient) return
    const reserved = reservedByClient[form.clientId]
    if (!reserved || reserved.length === 0) return
    const available = new Set(units.map((u) => u.id))
    setSelectedUnitIds(reserved.filter((id) => available.has(id)))
  }, [form.clientId, reservedByClient, units])

  const selectedUnits = useMemo(
    () => units.filter((u) => selectedUnitIds.includes(u.id)),
    [units, selectedUnitIds],
  )

  // Zmiana klienta → wyczyść ręczne ceny (załadują się oferty nowego klienta).
  useEffect(() => {
    setUnitPrices({})
  }, [form.clientId])

  // Domyślne ceny dla wybranych lokali (z oferty / bazowe). Zachowuje ręczne
  // rabaty, dolicza tylko nowo zaznaczone, usuwa odznaczone.
  useEffect(() => {
    if (selectedUnitIds.length === 0) {
      setUnitPrices({})
      return
    }
    const qs = new URLSearchParams({ clientId: form.clientId, unitIds: selectedUnitIds.join(',') })
    let cancelled = false
    fetch(`/api/contracts/resolve-prices?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.prices) return
        setUnitPrices((prev) => {
          const next: Record<string, string> = {}
          for (const id of selectedUnitIds) {
            next[id] = prev[id] !== undefined ? prev[id] : (d.prices[id] != null ? String(d.prices[id]) : '')
          }
          return next
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [form.clientId, selectedUnitIds])

  const totalGross = selectedUnitIds.reduce((s, id) => s + (parseFloat(unitPrices[id] || '0') || 0), 0)
  const reservationFeePreview = Math.round(totalGross * 0.01 * 100) / 100

  const validationWarning = useMemo(() => {
    if (form.type !== 'REZERWACYJNA') return null
    const counts: Record<string, number> = {}
    for (const u of selectedUnits) {
      counts[u.type] = (counts[u.type] || 0) + 1
    }
    for (const [t, limit] of Object.entries(RESERVATION_CONTRACT_LIMITS)) {
      if ((counts[t] || 0) > limit) {
        return `Przekroczono limit dla ${UNIT_TYPE_LABELS[t as UnitType]} (max ${limit})`
      }
    }
    return null
  }, [form.type, selectedUnits])

  function toggleUnit(id: string) {
    setSelectedUnitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (validationWarning) {
      setError(validationWarning)
      return
    }
    setLoading(true)
    const { secondaryClientId, ...rest } = form
    const unitPricesNum: Record<string, number> = {}
    for (const id of selectedUnitIds) {
      const v = parseFloat(unitPrices[id] || '')
      if (Number.isFinite(v) && v > 0) unitPricesNum[id] = v
    }
    const res = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rest,
        unitIds: selectedUnitIds,
        secondaryClientIds: secondaryClientId ? [secondaryClientId] : [],
        unitPrices: unitPricesNum,
      }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Błąd zapisu')
      return
    }
    const contract = await res.json()
    router.push(`/sales/${contract.id}`)
    router.refresh()
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value })

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Typ umowy *">
          <select className={inputCls} value={form.type} onChange={set('type')} required>
            {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((t) => (
              <option key={t} value={t}>
                {CONTRACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nazwa inwestycji">
          <input className={inputCls} value={form.investmentName} onChange={set('investmentName')} />
        </Field>
        <Field
          label="Klient *"
          extra={
            <Link
              href="/clients/new?returnTo=/sales/new"
              className="text-xs text-blue-600 hover:text-blue-700 underline"
            >
              + Nowy klient
            </Link>
          }
        >
          <select className={inputCls} value={form.clientId} onChange={set('clientId')} required>
            <option value="">— wybierz —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.lastName} {c.firstName}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Drugi klient (współrezerwujący)"
          extra={
            <Link
              href={`/clients/new?returnTo=${encodeURIComponent('/sales/new?role=secondary')}`}
              className="text-xs text-blue-600 hover:text-blue-700 underline"
            >
              + Nowy klient
            </Link>
          }
        >
          <select className={inputCls} value={form.secondaryClientId} onChange={set('secondaryClientId')}>
            <option value="">— brak —</option>
            {clients.filter((c) => c.id !== form.clientId).map((c) => (
              <option key={c.id} value={c.id}>
                {c.lastName} {c.firstName}
              </option>
            ))}
          </select>
        </Field>
        {form.type === 'REZERWACYJNA' && (
          <>
            <Field
              label="Termin zakończenia rezerwacji"
              hint="Data, do której lokal pozostaje zarezerwowany — trafia do wygenerowanej umowy rezerwacyjnej."
            >
              <input type="date" className={inputCls} value={form.reservationEndDate} onChange={set('reservationEndDate')} />
            </Field>
            <Field
              label="Termin wpłaty opłaty rez. (dni)"
              hint="Liczone od daty podpisania. Opłata = 1% wartości, liczona automatycznie."
            >
              <input type="number" min={1} max={90} className={inputCls} value={form.reservationFeeDays} onChange={set('reservationFeeDays')} />
            </Field>
          </>
        )}
      </div>

      <Field label="Notatki">
        <textarea rows={3} className={inputCls} value={form.notes} onChange={set('notes')} />
      </Field>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Składniki umowy (lokale)</label>
        {form.type === 'REZERWACYJNA' && (
          <p className="text-xs text-gray-500 mb-2">
            Umowa rezerwacyjna: max 1 mieszkanie + 2 miejsca postojowe + 2 miejsca garażowe + 1 komórka lokatorska.
          </p>
        )}
        <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
          {units.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">Brak dostępnych lokali</p>
          ) : (
            units.map((u) => (
              <label
                key={u.id}
                className={`flex items-center gap-3 p-2 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50 ${
                  selectedUnitIds.includes(u.id) ? 'bg-blue-50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedUnitIds.includes(u.id)}
                  onChange={() => toggleUnit(u.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{u.number}</p>
                  <p className="text-xs text-gray-500">
                    {UNIT_TYPE_LABELS[u.type as UnitType]} · {formatCurrency(u.priceGross)}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>
        {validationWarning && <p className="text-sm text-red-600 mt-2">{validationWarning}</p>}
      </div>

      {selectedUnitIds.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ceny lokali <span className="font-normal text-gray-500">(z oferty / cennika — zmień, aby udzielić rabatu)</span>
          </label>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {selectedUnits.map((u) => (
              <div key={u.id} className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{u.number}</p>
                  <p className="text-xs text-gray-500">{UNIT_TYPE_LABELS[u.type as UnitType]} · cennik {formatCurrency(u.priceGross)}</p>
                </div>
                <div className="flex items-center gap-1 sm:flex-shrink-0">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={unitPrices[u.id] ?? ''}
                    onChange={(e) => setUnitPrices((p) => ({ ...p, [u.id]: e.target.value }))}
                    className="flex-1 sm:flex-none sm:w-36 px-2 py-1 border border-gray-300 rounded text-sm text-right text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-500 flex-shrink-0">zł brutto</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 mt-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <span className="text-gray-600">Wartość brutto: <strong className="text-gray-900">{formatCurrency(totalGross)}</strong></span>
            <span className="text-gray-600">Opłata rezerwacyjna (1%): <strong className="text-gray-900">{formatCurrency(reservationFeePreview)}</strong></span>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          Anuluj
        </button>
        <button
          type="submit"
          disabled={loading || !!validationWarning}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Zapisuję...' : 'Utwórz umowę'}
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  children,
  extra,
  hint,
}: {
  label: string
  children: React.ReactNode
  extra?: React.ReactNode
  hint?: string
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-2 mb-1">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {extra}
      </div>
      {children}
      {hint && <p className="text-[11px] text-gray-500 mt-1 leading-tight">{hint}</p>}
    </div>
  )
}
