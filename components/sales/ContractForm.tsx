'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
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
}: {
  clients: Client[]
  units: Unit[]
  defaultClientId?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    type: 'REZERWACYJNA' as ContractType,
    clientId: defaultClientId || '',
    secondaryClientId: '',
    investmentName: 'Inwestycja',
    plannedSignDate: '',
    reservationFee: '',
    notes: '',
  })

  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])

  const selectedUnits = useMemo(
    () => units.filter((u) => selectedUnitIds.includes(u.id)),
    [units, selectedUnitIds],
  )

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
    const res = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rest,
        unitIds: selectedUnitIds,
        secondaryClientIds: secondaryClientId ? [secondaryClientId] : [],
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
        <Field label="Drugi klient (współrezerwujący)">
          <select className={inputCls} value={form.secondaryClientId} onChange={set('secondaryClientId')}>
            <option value="">— brak —</option>
            {clients.filter((c) => c.id !== form.clientId).map((c) => (
              <option key={c.id} value={c.id}>
                {c.lastName} {c.firstName}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Planowana data podpisania"
          hint="Pole wpływa na wygenerowaną umowę: termin opłaty rezerwacyjnej + data zakończenia rezerwacji"
        >
          <input type="date" className={inputCls} value={form.plannedSignDate} onChange={set('plannedSignDate')} />
        </Field>
        <Field label="Opłata rezerwacyjna">
          <input type="number" step="0.01" className={inputCls} value={form.reservationFee} onChange={set('reservationFee')} />
        </Field>
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
