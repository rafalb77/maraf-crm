'use client'
import { useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'

/**
 * Sortowanie tabel po stronie klienta — wspólny mechanizm dla list
 * (Klienci, Oferty, Sprzedaż). Wzoruje się na UnitsTable.
 *
 * getValue zwraca wartość porównywalną dla danej kolumny. Liczby sortowane
 * numerycznie, reszta przez localeCompare 'pl' (numeric:true → "B1.2" < "B1.10").
 * Null/undefined zawsze na końcu.
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  getValue: (row: T, key: K) => string | number | null | undefined,
  initialKey: K,
  initialDir: SortDir = 'asc',
) {
  const [sortKey, setSortKey] = useState<K>(initialKey)
  const [sortDir, setSortDir] = useState<SortDir>(initialDir)

  function onSort(key: K) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = getValue(a, sortKey)
      const vb = getValue(b, sortKey)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'pl', { numeric: true }) * dir
    })
    // getValue jest stabilną funkcją czystą — celowo poza zależnościami.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir])

  return { sorted, sortKey, sortDir, onSort }
}

/** Klikalny nagłówek kolumny ze strzałką kierunku sortowania. */
export function SortHeader<K extends string>({
  label,
  colKey,
  activeKey,
  dir,
  onSort,
  className = '',
  align = 'left',
}: {
  label: string
  colKey: K
  activeKey: K
  dir: SortDir
  onSort: (key: K) => void
  className?: string
  align?: 'left' | 'right'
}) {
  const active = colKey === activeKey
  return (
    <th
      onClick={() => onSort(colKey)}
      className={`select-none cursor-pointer hover:text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        {active && <span className="text-gray-400">{dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  )
}
