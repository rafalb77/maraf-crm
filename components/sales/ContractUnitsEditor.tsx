'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Car, Home, Loader2, Package, Plus, Store, Warehouse, X, type LucideIcon } from 'lucide-react'
import { UNIT_TYPE_LABELS, type UnitType } from '@/lib/types'
import { formatArea, formatCurrency } from '@/lib/utils'

type UnitRow = {
  unitId: string
  number: string
  type: string
  area: number
  building: string | null
  floor: number | null
  basePriceGross: number // cennik (live)
  priceGross: number // snapshot na umowie (po rabacie)
}
type AvailableUnit = {
  id: string
  number: string
  type: string
  priceGross: number
  area: number
  building: string | null
  floor: number | null
}

type EditRow = {
  unitId: string
  number: string
  type: string
  area: number
  building: string | null
  floor: number | null
  basePriceGross: number
  snapshotPriceGross: number // wartość startowa (snapshot lub cennik dla dodanych)
  discountValue: string
  discountMode: 'PLN' | 'PCT'
  touched: boolean // czy user zmienił rabat — tylko wtedy przeliczamy od ceny bazowej
}

const UNIT_TYPE_ICONS: Record<UnitType, LucideIcon> = {
  MIESZKALNY: Home,
  USLUGOWY: Store,
  PARKING: Car,
  GARAZ: Warehouse,
  KOMORKA: Package,
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function formatPct(pct: number): string {
  return `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(pct)} %`
}

/** Cena po rabacie. Nietknięty wiersz zachowuje snapshot (nie re-wycenia się). */
function finalGrossOf(row: EditRow): number {
  if (!row.touched) return round2(row.snapshotPriceGross)
  const base = row.basePriceGross
  const d = parseFloat(row.discountValue) || 0
  const final = row.discountMode === 'PCT' ? base * (1 - d / 100) : base - d
  return Math.min(base, Math.max(0, round2(final)))
}

function UnitTypeBadge({ type }: { type: string }) {
  const Icon = UNIT_TYPE_ICONS[type as UnitType] ?? Home
  return (
    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
      <Icon className="w-4 h-4 text-blue-500" />
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 font-medium text-right">{children}</dd>
    </div>
  )
}

export function ContractUnitsEditor({
  contractId,
  status,
  units,
  availableUnits,
  reservationFee: storedFee,
}: {
  contractId: string
  status: string
  units: UnitRow[]
  availableUnits: AvailableUnit[]
  /** Opłata rezerwacyjna zapisana na umowie (1% wartości); null dla starych umów. */
  reservationFee?: number | null
}) {
  const router = useRouter()
  const canEdit = status === 'W_PRZYGOTOWANIU'
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<EditRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addId, setAddId] = useState('')

  function startEdit() {
    setRows(
      units.map((u) => {
        const discount = round2(u.basePriceGross - u.priceGross)
        return {
          unitId: u.unitId,
          number: u.number,
          type: u.type,
          area: u.area,
          building: u.building,
          floor: u.floor,
          basePriceGross: u.basePriceGross,
          snapshotPriceGross: u.priceGross,
          discountValue: discount > 0 ? String(discount) : '',
          discountMode: 'PLN' as const,
          touched: false,
        }
      }),
    )
    setAddId('')
    setError(null)
    setEditing(true)
  }

  const usedIds = useMemo(() => new Set(rows.map((r) => r.unitId)), [rows])
  // Pula do dodania = wolne lokale z serwera + składniki TEJ umowy (serwer je
  // wyklucza z availableUnits, a usunięty w trakcie edycji wiersz musi dać się
  // dodać z powrotem bez zapisywania).
  const addPool = useMemo(() => {
    const pool = new Map<string, AvailableUnit>()
    for (const u of availableUnits) pool.set(u.id, u)
    for (const u of units) {
      if (!pool.has(u.unitId)) {
        pool.set(u.unitId, {
          id: u.unitId,
          number: u.number,
          type: u.type,
          priceGross: u.basePriceGross,
          area: u.area,
          building: u.building,
          floor: u.floor,
        })
      }
    }
    return [...pool.values()].sort((a, b) => a.number.localeCompare(b.number, 'pl'))
  }, [availableUnits, units])
  const addable = addPool.filter((u) => !usedIds.has(u.id))

  const totalGross = rows.reduce((s, r) => s + finalGrossOf(r), 0)
  const reservationFee = round2(totalGross * 0.01)

  function setRow(unitId: string, patch: Partial<EditRow>) {
    setRows((prev) => prev.map((r) => (r.unitId === unitId ? { ...r, ...patch } : r)))
  }
  function setDiscount(unitId: string, discountValue: string) {
    setRow(unitId, { discountValue, touched: true })
  }
  function toggleMode(unitId: string, mode: 'PLN' | 'PCT') {
    setRows((prev) =>
      prev.map((r) => {
        if (r.unitId !== unitId || r.discountMode === mode) return r
        // Konwertuj wartość, żeby zachować cenę końcową (a nie zmieniać znaczenia liczby).
        const d = parseFloat(r.discountValue) || 0
        const base = r.basePriceGross
        let converted = ''
        if (d > 0 && base > 0) {
          converted = mode === 'PCT' ? String(round2((d / base) * 100)) : String(round2((base * d) / 100))
        }
        return { ...r, discountMode: mode, discountValue: converted, touched: true }
      }),
    )
  }
  function removeRow(unitId: string) {
    setRows((prev) => prev.filter((r) => r.unitId !== unitId))
  }
  function addRow() {
    const u = addPool.find((x) => x.id === addId)
    if (!u) return
    setRows((prev) => [
      ...prev,
      {
        unitId: u.id,
        number: u.number,
        type: u.type,
        area: u.area,
        building: u.building,
        floor: u.floor,
        basePriceGross: u.priceGross,
        snapshotPriceGross: u.priceGross,
        discountValue: '',
        discountMode: 'PLN',
        touched: false,
      },
    ])
    setAddId('')
  }

  async function save() {
    if (rows.length === 0) {
      setError('Umowa musi zawierać co najmniej jeden lokal.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/units`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units: rows.map((r) => ({ unitId: r.unitId, priceGross: finalGrossOf(r) })) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się zapisać składników')
      }
      setEditing(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const totalBase = units.reduce((s, u) => s + u.basePriceGross, 0)
  const totalSnapshot = units.reduce((s, u) => s + u.priceGross, 0)
  const totalDiscount = round2(totalBase - totalSnapshot)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Składniki umowy</h2>
        {canEdit &&
          (!editing ? (
            <button onClick={startEdit} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Edytuj składniki
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)} disabled={busy} className="text-sm text-gray-600 hover:text-gray-800">
                Anuluj
              </button>
              <button
                onClick={save}
                disabled={busy || rows.length === 0}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1.5"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Zapisz
              </button>
            </div>
          ))}
      </div>

      {!editing ? (
        units.length === 0 ? (
          <p className="text-gray-400 text-sm">Brak lokali</p>
        ) : (
          <div className="space-y-2">
            {units.map((u) => {
              const discountGross = round2(u.basePriceGross - u.priceGross)
              const discounted = discountGross > 0.004
              const discountPct = u.basePriceGross > 0 ? (discountGross / u.basePriceGross) * 100 : 0
              return (
                <div key={u.unitId} className="rounded-lg bg-blue-50/50 border border-gray-200 p-2.5">
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <div className="flex items-center gap-2.5 sm:items-start flex-1 min-w-0">
                      <UnitTypeBadge type={u.type} />
                      <div className="min-w-0">
                        <Link
                          href={`/units/${u.unitId}`}
                          className="text-sm font-semibold text-gray-900 hover:text-blue-600 break-words"
                        >
                          {u.number}
                        </Link>
                        <p className="text-xs text-gray-500">{UNIT_TYPE_LABELS[u.type as UnitType] ?? u.type}</p>
                      </div>
                    </div>
                    <dl className="sm:w-72 space-y-0.5 text-xs">
                      <Detail label="Budynek">{u.building || '—'}</Detail>
                      {u.floor != null && <Detail label="Piętro">{u.floor === 0 ? 'parter' : u.floor}</Detail>}
                      <Detail label="Powierzchnia umowna">{formatArea(u.area)}</Detail>
                      {discounted && (
                        <Detail label="Cena cennikowa">
                          <span className="text-gray-400 line-through font-normal">{formatCurrency(u.basePriceGross)}</span>
                        </Detail>
                      )}
                      <Detail label="Rabat">{discounted ? formatPct(discountPct) : '—'}</Detail>
                      <Detail label="Rabat brutto">{discounted ? formatCurrency(discountGross) : '—'}</Detail>
                      <Detail label="Cena brutto">
                        <span className="font-semibold">{formatCurrency(u.priceGross)}</span>
                      </Detail>
                    </dl>
                  </div>
                </div>
              )
            })}
            {totalDiscount > 0.004 && (
              <div className="flex justify-between items-center pt-1 text-xs text-gray-500">
                <span>Rabat łącznie</span>
                <span>−{formatCurrency(totalDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 text-sm border-t border-gray-100">
              <span className="text-gray-600">Razem brutto</span>
              <span className="font-semibold text-gray-900">{formatCurrency(totalSnapshot)}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-500">
              <span>Opłata rezerwacyjna (1%)</span>
              <span>{formatCurrency(storedFee ?? round2(totalSnapshot * 0.01))}</span>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const final = finalGrossOf(r)
            const rowDiscount = round2(r.basePriceGross - final)
            return (
              <div key={r.unitId} className="rounded-lg bg-blue-50/50 border border-gray-200 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UnitTypeBadge type={r.type} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 break-words">{r.number}</p>
                      <p className="text-xs text-gray-500">
                        {UNIT_TYPE_LABELS[r.type as UnitType] ?? r.type}
                        {r.building ? ` · bud. ${r.building}` : ''} · {formatArea(r.area)} · cennik{' '}
                        {formatCurrency(r.basePriceGross)}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => removeRow(r.unitId)} className="text-gray-400 hover:text-red-600 flex-shrink-0" title="Usuń składnik">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-2 mt-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Rabat</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={r.discountValue}
                      onChange={(e) => setDiscount(r.unitId, e.target.value)}
                      placeholder="0"
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs">
                      {(['PLN', 'PCT'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => toggleMode(r.unitId, m)}
                          className={`px-2 py-1 ${r.discountMode === m ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                          {m === 'PLN' ? 'zł' : '%'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(final)}</span>
                    {rowDiscount > 0.004 && (
                      <p className="text-[11px] text-gray-400">rabat −{formatCurrency(rowDiscount)}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {addable.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— dodaj lokal —</option>
                {addable.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.number} ({UNIT_TYPE_LABELS[u.type as UnitType] ?? u.type}) · {formatArea(u.area)} · {formatCurrency(u.priceGross)}
                  </option>
                ))}
              </select>
              <button
                onClick={addRow}
                disabled={!addId}
                className="px-2.5 py-1.5 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Dodaj
              </button>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 text-sm border-t border-gray-100">
            <span className="text-gray-600">Razem brutto</span>
            <span className="font-semibold text-gray-900">{formatCurrency(totalGross)}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-gray-500">
            <span>Opłata rezerwacyjna (1%)</span>
            <span>{formatCurrency(reservationFee)}</span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
