'use client'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  PURCHASE_INVOICE_STATUS_LABELS,
  PURCHASE_INVOICE_STATUS_COLORS,
  COMPANY_SHORT,
  type PurchaseInvoiceStatus,
  type Company,
} from '@/lib/types'
import { fmtDate, fmtMoney, isOverdue } from '@/lib/finanse-format'

export type FakturaRow = {
  id: string
  vendorName: string
  subVendor: string | null
  number: string
  company: string
  issueDate: string
  dueDate: string | null
  vatRate: number
  amountNet: number
  amountVat: number
  amountGross: number
  sumPaid: number
  status: string
  notes: string | null
}

type Totals = { net: number; vat: number; gross: number; count: number; onPage: number }

const PAID_STATUSES = new Set(['OPLACONA', 'ANULOWANA'])

type Props = {
  rows: FakturaRow[]
  totals: Totals
  currentSort?: string  // np. 'dueDate-asc'
  sortOptions?: Record<string, string>  // klucz → etykieta (do walidacji)
}

export function FakturyTable({ rows, totals, currentSort, sortOptions }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Klikanie nagłówka kolumny — toggle asc/desc dla danej kolumny.
  function onSort(colKey: string) {
    const cur = currentSort || ''
    let newKey: string
    if (cur.startsWith(colKey + '-')) {
      // ten sam col → toggle direction
      const curDir = cur.slice(colKey.length + 1)
      newKey = `${colKey}-${curDir === 'asc' ? 'desc' : 'asc'}`
    } else {
      // inny col → domyślnie asc (poza datami/kwotami gdzie desc jest naturalne)
      const defaultDir = (colKey === 'issueDate' || colKey === 'amountGross') ? 'desc' : 'asc'
      newKey = `${colKey}-${defaultDir}`
    }
    // Walidacja
    if (sortOptions && !sortOptions[newKey]) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', newKey)
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allOnPageSelected) setSelected(new Set())
    else setSelected(new Set(rows.map((r) => r.id)))
  }

  const selectedRows = rows.filter((r) => selected.has(r.id))
  const selGross = selectedRows.reduce((s, r) => s + r.amountGross, 0)
  const selVat = selectedRows.reduce((s, r) => s + r.amountVat, 0)
  const selNet = selectedRows.reduce((s, r) => s + r.amountNet, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Pasek zaznaczonych — przelew zbiorczy */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-blue-900">
            Zaznaczono {selected.size} {selected.size === 1 ? 'fakturę' : 'faktur'}
          </span>
          <div className="flex items-center gap-6 text-sm">
            <span className="text-blue-900">Netto: <strong className="tabular-nums">{fmtMoney(selNet)}</strong></span>
            <span className="text-blue-900">VAT: <strong className="tabular-nums">{fmtMoney(selVat)}</strong></span>
            <span className="text-blue-900 text-base">Do przelewu (brutto): <strong className="tabular-nums">{fmtMoney(selGross)}</strong></span>
            <button onClick={() => setSelected(new Set())} className="text-blue-600 hover:text-blue-800 text-xs">wyczyść</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-left">
            <tr>
              <th className="px-3 py-3 w-8">
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} title="Zaznacz wszystkie na stronie" />
              </th>
              <SortableTh colKey="vendor" label="Kontrahent" currentSort={currentSort} onSort={onSort} />
              <th className="px-3 py-3 font-medium text-gray-700">Nr FV</th>
              <SortableTh colKey="issueDate" label="Wyst." currentSort={currentSort} onSort={onSort} />
              <SortableTh colKey="dueDate" label="Termin" currentSort={currentSort} onSort={onSort} />
              <th className="px-3 py-3 font-medium text-gray-700 text-right">Netto</th>
              <th className="px-3 py-3 font-medium text-gray-700 text-right">VAT%</th>
              <th className="px-3 py-3 font-medium text-gray-700 text-right">Kwota VAT</th>
              <SortableTh colKey="amountGross" label="Brutto" align="right" currentSort={currentSort} onSort={onSort} />
              <SortableTh colKey="status" label="Status" currentSort={currentSort} onSort={onSort} />
              <th className="px-3 py-3 font-medium text-gray-700">Komentarz</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Brak faktur dla wybranych filtrów.</td></tr>
            )}
            {rows.map((r) => {
              const overdue = isOverdue(r.dueDate, r.status)
              const unpaid = !PAID_STATUSES.has(r.status)
              const isSel = selected.has(r.id)
              return (
                <tr key={r.id} className={isSel ? 'bg-blue-50/50' : 'hover:bg-gray-50'}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={isSel} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2">
                    {/* Gdy jest podkontrahent (np. Janpol/PATRIMEX pod STAFFA) — to ON
                        jest faktycznym kontrahentem (duzy), a parasol (STAFFA) maly nad nim. */}
                    {r.subVendor ? (
                      <>
                        <div className="text-[11px] text-gray-400 leading-tight">{r.vendorName}</div>
                        <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                          {r.subVendor}
                          {r.company === 'MARAF_DEVELOPMENT' && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded">MD</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                        {r.vendorName}
                        {r.company === 'MARAF_DEVELOPMENT' && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded">MD</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/finanse/faktury/${r.id}`} className="text-blue-600 hover:underline font-mono text-xs">{r.number}</Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600 tabular-nums whitespace-nowrap">{fmtDate(r.issueDate)}</td>
                  <td className={`px-3 py-2 tabular-nums whitespace-nowrap ${overdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                    {fmtDate(r.dueDate)}{overdue && ' ⚠'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtMoney(r.amountNet)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{(r.vatRate * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtMoney(r.amountVat)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${unpaid ? 'text-red-600' : 'text-gray-900'}`}>
                    {fmtMoney(r.amountGross)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      PURCHASE_INVOICE_STATUS_COLORS[r.status as PurchaseInvoiceStatus] || 'bg-gray-100 text-gray-700'
                    }`}>
                      {PURCHASE_INVOICE_STATUS_LABELS[r.status as PurchaseInvoiceStatus] || r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <CommentCell invoiceId={r.id} initial={r.notes} />
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-semibold text-gray-900">
              <tr>
                <td colSpan={5} className="px-3 py-3">
                  Razem ({totals.count} faktur{totals.onPage < totals.count ? `, na stronie ${totals.onPage}` : ''})
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(totals.net)}</td>
                <td></td>
                <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(totals.vat)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(totals.gross)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// Komentarz inline — klik otwiera input, zapis przez /notes endpoint
function CommentCell({ invoiceId, initial }: { invoiceId: string; initial: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initial || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const r = await fetch(`/api/finanse/invoices/${invoiceId}/notes`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: value.trim() || null }),
      })
      if (r.ok) { setEditing(false); router.refresh() }
      else alert('Błąd zapisu komentarza')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setValue(initial || '') } }}
          className="px-2 py-1 border border-blue-300 rounded text-xs w-40"
          placeholder="komentarz..."
        />
        <button onClick={save} disabled={saving} className="text-green-600 text-xs">{saving ? '...' : '✓'}</button>
        <button onClick={() => { setEditing(false); setValue(initial || '') }} className="text-gray-400 text-xs">✗</button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-left text-xs text-gray-600 hover:text-blue-600 min-w-[80px] block"
      title="Kliknij aby edytować"
    >
      {initial || <span className="text-gray-300 italic">+ dodaj</span>}
    </button>
  )
}

// Klikalny nagłówek kolumny — toggle asc/desc, aktywny zaznaczony strzałką.
function SortableTh({
  colKey, label, align = 'left', currentSort, onSort,
}: {
  colKey: string
  label: string
  align?: 'left' | 'right'
  currentSort?: string
  onSort: (k: string) => void
}) {
  const isActive = !!(currentSort && currentSort.startsWith(colKey + '-'))
  const dir = isActive ? currentSort!.slice(colKey.length + 1) : null
  const arrow = isActive ? (dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  return (
    <th className={`px-3 py-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(colKey)}
        className={`inline-flex items-center gap-0.5 hover:text-blue-600 ${isActive ? 'text-blue-700' : 'text-gray-700'}`}
        title={`Sortuj po: ${label}`}
      >
        {label}<span className={`text-xs ${isActive ? '' : 'text-gray-300'}`}>{arrow}</span>
      </button>
    </th>
  )
}
