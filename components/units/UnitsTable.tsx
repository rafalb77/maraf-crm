'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCurrency, formatArea } from '@/lib/utils'
import {
  UNIT_TYPE_LABELS, UNIT_STATUS_LABELS, UNIT_STATUS_COLORS,
  type UnitType, type UnitStatus
} from '@/lib/types'

export type UnitRow = {
  id: string
  number: string
  type: string
  floor: number | null
  area: number
  pricePerSqmNet: number
  pricePerSqmGross: number
  priceNet: number
  priceGross: number
  vatRate: number
  status: string
  clientUnits: { clientId: string; client: { firstName: string; lastName: string } }[]
}

type ColumnKey =
  | 'number' | 'type' | 'floor' | 'area'
  | 'pricePerSqmNet' | 'pricePerSqmGross'
  | 'priceNet' | 'priceGross' | 'vatRate'
  | 'status' | 'client'

type Column = {
  key: ColumnKey
  label: string
  align: 'left' | 'right'
  sortable: boolean
  summable: boolean
  defaultVisible: boolean
}

const COLUMNS: Column[] = [
  { key: 'number',           label: 'Nr lokalu',         align: 'left',  sortable: true, summable: false, defaultVisible: true },
  { key: 'type',             label: 'Typ',               align: 'left',  sortable: true, summable: false, defaultVisible: true },
  { key: 'floor',            label: 'Piętro',            align: 'left',  sortable: true, summable: false, defaultVisible: true },
  { key: 'area',             label: 'Powierzchnia',      align: 'right', sortable: true, summable: true,  defaultVisible: true },
  { key: 'pricePerSqmNet',   label: 'Cena za m² netto',  align: 'right', sortable: true, summable: false, defaultVisible: false },
  { key: 'pricePerSqmGross', label: 'Cena za m² brutto', align: 'right', sortable: true, summable: false, defaultVisible: true },
  { key: 'priceNet',         label: 'Cena netto',        align: 'right', sortable: true, summable: true,  defaultVisible: true },
  { key: 'priceGross',       label: 'Cena brutto',       align: 'right', sortable: true, summable: true,  defaultVisible: true },
  { key: 'vatRate',          label: 'VAT',               align: 'right', sortable: true, summable: false, defaultVisible: false },
  { key: 'status',           label: 'Status',            align: 'left',  sortable: true, summable: false, defaultVisible: true },
  { key: 'client',           label: 'Klient',            align: 'left',  sortable: false, summable: false, defaultVisible: true },
]

const STORAGE_KEY = 'units-table-visible-cols-v1'

function floorLabel(f: number | null) {
  if (f === null) return '—'
  if (f === 0) return 'Parter'
  if (f === -1) return 'Podziemie'
  return `${f} p.`
}

export function UnitsTable({ units }: { units: UnitRow[] }) {
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>(() => {
    const init = {} as Record<ColumnKey, boolean>
    for (const c of COLUMNS) init[c.key] = c.defaultVisible
    return init
  })
  const [sortKey, setSortKey] = useState<ColumnKey>('number')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [colMenuOpen, setColMenuOpen] = useState(false)

  // Load saved column visibility
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, boolean>
        setVisible((prev) => {
          const next = { ...prev }
          for (const c of COLUMNS) if (c.key in saved) next[c.key] = !!saved[c.key]
          return next
        })
      }
    } catch {}
  }, [])

  function toggleCol(key: ColumnKey) {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function resetCols() {
    const init = {} as Record<ColumnKey, boolean>
    for (const c of COLUMNS) init[c.key] = c.defaultVisible
    setVisible(init)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(init)) } catch {}
  }

  function onSort(key: ColumnKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    const arr = [...units]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const va = getSortValue(a, sortKey)
      const vb = getSortValue(b, sortKey)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'pl', { numeric: true }) * dir
    })
    return arr
  }, [units, sortKey, sortDir])

  // Sums for visible summable columns
  const sums = useMemo(() => {
    return {
      area: sorted.reduce((s, u) => s + u.area, 0),
      priceNet: sorted.reduce((s, u) => s + u.priceNet, 0),
      priceGross: sorted.reduce((s, u) => s + u.priceGross, 0),
    }
  }, [sorted])

  const visibleCols = COLUMNS.filter((c) => visible[c.key])

  return (
    <div>
      {/* Column toggle button */}
      <div className="flex items-center justify-end mb-3 relative">
        <button
          type="button"
          onClick={() => setColMenuOpen((v) => !v)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 bg-white"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18M3 12h18M3 18h18" />
          </svg>
          Kolumny
        </button>
        {colMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setColMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Pokaż kolumny</p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={visible[c.key]}
                      onChange={() => toggleCol(c.key)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-700">{c.label}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={resetCols}
                className="mt-3 w-full text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Przywróć domyślne
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {visibleCols.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3 font-medium text-gray-500 select-none ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.sortable ? 'cursor-pointer hover:text-gray-700' : ''}`}
                  onClick={c.sortable ? () => onSort(c.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.sortable && sortKey === c.key && (
                      <span className="text-gray-400">{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </span>
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 1} className="px-4 py-12 text-center text-gray-400">
                  Brak lokali spełniających kryteria
                </td>
              </tr>
            ) : (
              sorted.map((unit) => (
                <tr key={unit.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  {visibleCols.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''} ${c.key === 'number' ? 'font-semibold text-gray-900' : 'text-gray-600'} ${c.key === 'priceGross' ? 'font-medium text-gray-900' : ''}`}
                    >
                      {renderCell(unit, c.key)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <Link href={`/units/${unit.id}`} className="text-blue-600 hover:text-blue-700 font-medium text-xs">
                      Szczegóły
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-900">
                {visibleCols.map((c, idx) => (
                  <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {idx === 0 ? `Suma (${sorted.length})` : c.summable ? renderSum(c.key, sums) : ''}
                  </td>
                ))}
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function getSortValue(u: UnitRow, key: ColumnKey): string | number | null {
  switch (key) {
    case 'number': return u.number
    case 'type': return UNIT_TYPE_LABELS[u.type as UnitType] || u.type
    case 'floor': return u.floor
    case 'area': return u.area
    case 'pricePerSqmNet': return u.pricePerSqmNet
    case 'pricePerSqmGross': return u.pricePerSqmGross
    case 'priceNet': return u.priceNet
    case 'priceGross': return u.priceGross
    case 'vatRate': return u.vatRate
    case 'status': return UNIT_STATUS_LABELS[u.status as UnitStatus] || u.status
    case 'client': return u.clientUnits[0]
      ? `${u.clientUnits[0].client.lastName} ${u.clientUnits[0].client.firstName}`
      : ''
  }
}

function renderCell(u: UnitRow, key: ColumnKey) {
  switch (key) {
    case 'number': return u.number
    case 'type': return UNIT_TYPE_LABELS[u.type as UnitType]
    case 'floor': return floorLabel(u.floor)
    case 'area': return u.area > 0 ? formatArea(u.area) : '—'
    case 'pricePerSqmNet': return u.pricePerSqmNet > 0 ? formatCurrency(u.pricePerSqmNet) : '—'
    case 'pricePerSqmGross': return u.pricePerSqmGross > 0 ? formatCurrency(u.pricePerSqmGross) : '—'
    case 'priceNet': return formatCurrency(u.priceNet)
    case 'priceGross': return formatCurrency(u.priceGross)
    case 'vatRate': return `${u.vatRate}%`
    case 'status': return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${UNIT_STATUS_COLORS[u.status as UnitStatus]}`}>
        {UNIT_STATUS_LABELS[u.status as UnitStatus]}
      </span>
    )
    case 'client': return u.clientUnits.length > 0 ? (
      <span className="space-x-1">
        {u.clientUnits.map((cu) => (
          <Link key={cu.clientId} href={`/clients/${cu.clientId}`} className="hover:text-blue-600">
            {cu.client.firstName} {cu.client.lastName}
          </Link>
        ))}
      </span>
    ) : <span className="text-gray-400">—</span>
  }
}

function renderSum(key: ColumnKey, sums: { area: number; priceNet: number; priceGross: number }) {
  switch (key) {
    case 'area': return formatArea(sums.area)
    case 'priceNet': return formatCurrency(sums.priceNet)
    case 'priceGross': return formatCurrency(sums.priceGross)
    default: return ''
  }
}
