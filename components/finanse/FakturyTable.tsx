'use client'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  PURCHASE_INVOICE_STATUS_LABELS,
  PURCHASE_INVOICE_STATUS_COLORS,
  PURCHASE_INVOICE_CATEGORIES,
  PURCHASE_INVOICE_CATEGORY_LABELS,
  PURCHASE_INVOICE_CATEGORY_COLORS,
  COMPANY_SHORT,
  type PurchaseInvoiceStatus,
  type PurchaseInvoiceCategory,
  type Company,
} from '@/lib/types'
import { fmtDate, fmtMoney, isOverdue } from '@/lib/finanse-format'
import { QuickPaymentCell } from '@/components/finanse/QuickPaymentCell'

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
  remaining: number // pozostalo do zaplaty (po potraceniach)
  status: string
  category: string | null
  notes: string | null
  isKsef?: boolean
}

type Totals = { net: number; vat: number; gross: number; remaining: number; count: number; onPage: number }

const PAID_STATUSES = new Set(['OPLACONA', 'ANULOWANA'])
// Statusy, ktore mozna zbiorczo zatwierdzic (-> ZATWIERDZONA, do kolejki platnosci).
const APPROVABLE_STATUSES = new Set(['POBRANA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'ODRZUCONA'])

// Definicja kolumn tabeli — kolejnosc = kolejnosc <td> w wierszu.
// defaultW: startowa szerokosc px (user moze zmienic przeciagajac krawedz
// naglowka; dblclick na uchwycie = reset). sortKey: klucz SORT_OPTIONS (strona).
type ColDef = { key: string; label: string; defaultW: number; minW?: number; sortKey?: string; align?: 'left' | 'right' }
const COLUMNS: ColDef[] = [
  { key: 'sel',         label: '',          defaultW: 30,  minW: 28 },
  { key: 'vendor',      label: 'Kontrahent', defaultW: 116, sortKey: 'vendor' },
  { key: 'number',      label: 'Nr FV',      defaultW: 88,  sortKey: 'number' },
  { key: 'issueDate',   label: 'Wyst.',      defaultW: 74,  sortKey: 'issueDate' },
  { key: 'dueDate',     label: 'Termin',     defaultW: 74,  sortKey: 'dueDate' },
  { key: 'amountNet',   label: 'Netto',      defaultW: 80,  sortKey: 'amountNet', align: 'right' },
  { key: 'vatRate',     label: 'VAT%',       defaultW: 46,  sortKey: 'vatRate', align: 'right' },
  { key: 'amountVat',   label: 'Kwota VAT',  defaultW: 74,  sortKey: 'amountVat', align: 'right' },
  { key: 'amountGross', label: 'Brutto',     defaultW: 84,  sortKey: 'amountGross', align: 'right' },
  { key: 'status',      label: 'Status',     defaultW: 92 },
  { key: 'category',    label: 'Kategoria',  defaultW: 70 },
  { key: 'notes',       label: 'Komentarz',  defaultW: 80 },
  { key: 'remaining',   label: 'Pozostało',  defaultW: 84,  align: 'right' },
  { key: 'payment',     label: 'Płatność',   defaultW: 88 },
]
const COL_WIDTHS_LS_KEY = 'fakturyColWidths.v1'
const DEFAULT_WIDTHS: Record<string, number> = Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultW]))

type Props = {
  rows: FakturaRow[]
  totals: Totals
  currentSort?: string  // np. 'dueDate-asc'
  sortOptions?: Record<string, string>  // klucz → etykieta (do walidacji)
}

export function FakturyTable({ rows, totals, currentSort, sortOptions }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Szerokosci kolumn — start z defaultow (SSR = klient, bez hydration mismatch);
  // zapisane przez usera szerokosci doczytywane po mount z localStorage.
  const [widths, setWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS)
  const [approving, setApproving] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Zbiorcze zatwierdzenie zaznaczonych faktur (-> ZATWIERDZONA => kolejka platnosci).
  async function bulkApprove(ids: string[]) {
    if (!ids.length || approving) return
    setApproving(true)
    try {
      const r = await fetch('/api/finanse/invoices/bulk-approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { alert(data.error || 'Błąd zatwierdzania'); return }
      setSelected(new Set())
      router.refresh()
    } catch (e: any) {
      alert(e.message || 'Błąd sieci')
    } finally {
      setApproving(false)
    }
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_WIDTHS_LS_KEY) || '{}')
      if (saved && typeof saved === 'object') setWidths((w) => ({ ...w, ...saved }))
    } catch {}
  }, [])

  function persistWidth(key: string, value: number | null) {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_WIDTHS_LS_KEY) || '{}')
      if (value === null) delete saved[key]
      else saved[key] = value
      localStorage.setItem(COL_WIDTHS_LS_KEY, JSON.stringify(saved))
    } catch {}
  }

  // Przeciaganie krawedzi naglowka — zmiana szerokosci kolumny.
  function startResize(key: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widths[key] ?? DEFAULT_WIDTHS[key]
    const min = COLUMNS.find((c) => c.key === key)?.minW ?? 44
    function onMove(ev: MouseEvent) {
      setWidths((w) => ({ ...w, [key]: Math.max(min, startW + ev.clientX - startX) }))
    }
    function onUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      persistWidth(key, Math.max(min, startW + ev.clientX - startX))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function resetWidth(key: string) {
    setWidths((w) => ({ ...w, [key]: DEFAULT_WIDTHS[key] }))
    persistWidth(key, null)
  }

  const tableWidth = COLUMNS.reduce((s, c) => s + (widths[c.key] ?? c.defaultW), 0)

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
      const descByDefault = new Set(['issueDate', 'amountGross', 'amountNet', 'amountVat', 'vatRate'])
      const defaultDir = descByDefault.has(colKey) ? 'desc' : 'asc'
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
  const approvableIds = selectedRows.filter((r) => APPROVABLE_STATUSES.has(r.status)).map((r) => r.id)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Pasek zaznaczonych — przelew zbiorczy */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-blue-900">
            Zaznaczono {selected.size} {selected.size === 1 ? 'fakturę' : 'faktur'}
          </span>
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="text-blue-900">Netto: <strong className="tabular-nums">{fmtMoney(selNet)}</strong></span>
            <span className="text-blue-900">VAT: <strong className="tabular-nums">{fmtMoney(selVat)}</strong></span>
            <span className="text-blue-900 text-base">Do przelewu (brutto): <strong className="tabular-nums">{fmtMoney(selGross)}</strong></span>
            {approvableIds.length > 0 && (
              <button
                onClick={() => bulkApprove(approvableIds)}
                disabled={approving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                title="Zmienia status na Zatwierdzona — faktury trafią do kolejki płatności"
              >
                {approving ? 'Zatwierdzam…' : `✓ Zatwierdź zaznaczone (${approvableIds.length})`}
              </button>
            )}
            <button onClick={() => setSelected(new Set())} className="text-blue-600 hover:text-blue-800 text-xs">wyczyść</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        {/* table-layout: fixed + colgroup — szerokosci kolumn sterowane stanem
            (resize przeciaganiem prawej krawedzi naglowka, dblclick = reset).
            width 100% + minWidth: na szerokich ekranach tabela wypelnia
            kontener (nadmiar rozdzielany proporcjonalnie), na weszych trzyma
            minimum i przewija poziomo. */}
        <table className="text-sm" style={{ tableLayout: 'fixed', width: '100%', minWidth: tableWidth }}>
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.key} style={{ width: (widths[c.key] ?? c.defaultW) + 'px' }} />
            ))}
          </colgroup>
          <thead className="bg-gray-50 border-b border-gray-200 text-left">
            <tr>
              {COLUMNS.map((c) => (
                <Th
                  key={c.key}
                  col={c}
                  currentSort={currentSort}
                  onSort={onSort}
                  onResizeStart={startResize}
                  onResetWidth={resetWidth}
                >
                  {c.key === 'sel' && (
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} title="Zaznacz wszystkie na stronie" />
                  )}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-gray-400">Brak faktur dla wybranych filtrów.</td></tr>
            )}
            {rows.map((r) => {
              const overdue = isOverdue(r.dueDate, r.status)
              const unpaid = !PAID_STATUSES.has(r.status)
              const isSel = selected.has(r.id)
              return (
                <tr key={r.id} className={isSel ? 'bg-blue-50/50' : 'hover:bg-gray-50'}>
                  <td className="px-1.5 py-2">
                    <input type="checkbox" checked={isSel} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-1.5 py-2 overflow-hidden">
                    {/* Gdy jest podkontrahent (np. Janpol/PATRIMEX pod STAFFA) — to ON
                        jest faktycznym kontrahentem (duzy), a parasol (STAFFA) maly nad nim.
                        Dlugie nazwy obcinane wielokropkiem, pelna nazwa w tooltipie. */}
                    {r.subVendor ? (
                      <>
                        <div className="text-[11px] text-gray-400 leading-tight truncate" title={r.vendorName}>{r.vendorName}</div>
                        <div className="font-semibold text-gray-900 flex items-center gap-1.5 min-w-0">
                          <span className="truncate" title={r.subVendor}>{r.subVendor}</span>
                          {r.company === 'MARAF_DEVELOPMENT' && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded shrink-0">MD</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5 min-w-0">
                        <span className="truncate" title={r.vendorName}>{r.vendorName}</span>
                        {r.company === 'MARAF_DEVELOPMENT' && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded shrink-0">MD</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-1.5 py-2 overflow-hidden">
                    <div className="flex items-center gap-1 min-w-0">
                      <Link
                        href={`/finanse/faktury/${r.id}`}
                        className="text-blue-600 hover:underline font-mono text-xs truncate"
                        title={r.number}
                      >
                        {r.number}
                      </Link>
                      {r.isKsef && (
                        <span className="text-[10px] bg-sky-100 text-sky-700 px-1 rounded font-medium shrink-0" title="Pobrana z KSeF">KSeF</span>
                      )}
                    </div>
                  </td>
                  <td className="px-1.5 py-2 text-gray-600 tabular-nums whitespace-nowrap overflow-hidden">{fmtDate(r.issueDate)}</td>
                  <td className={`px-1.5 py-2 tabular-nums whitespace-nowrap overflow-hidden ${overdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                    {fmtDate(r.dueDate)}{overdue && ' ⚠'}
                  </td>
                  <td className="px-1.5 py-2 text-right tabular-nums text-gray-700">{fmtMoney(r.amountNet)}</td>
                  <td className="px-1.5 py-2 text-right tabular-nums text-gray-500">{(r.vatRate * 100).toFixed(0)}%</td>
                  <td className="px-1.5 py-2 text-right tabular-nums text-gray-700">{fmtMoney(r.amountVat)}</td>
                  <td className={`px-1.5 py-2 text-right tabular-nums font-semibold ${unpaid ? 'text-red-600' : 'text-gray-900'}`}>
                    {fmtMoney(r.amountGross)}
                  </td>
                  <td className="px-1.5 py-2 overflow-hidden">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      PURCHASE_INVOICE_STATUS_COLORS[r.status as PurchaseInvoiceStatus] || 'bg-gray-100 text-gray-700'
                    }`}>
                      {PURCHASE_INVOICE_STATUS_LABELS[r.status as PurchaseInvoiceStatus] || r.status}
                    </span>
                  </td>
                  <td className="px-1.5 py-2 overflow-hidden">
                    <CategoryCell invoiceId={r.id} category={r.category} />
                  </td>
                  <td className="px-1.5 py-2 overflow-hidden">
                    <CommentCell invoiceId={r.id} initial={r.notes} />
                  </td>
                  {/* Pozostalo do zaplaty = nalezne po potraceniach - zaplacono */}
                  <td className={`px-1.5 py-2 text-right tabular-nums font-semibold ${r.remaining > 0.01 ? 'text-red-600' : 'text-gray-300'}`}>
                    {r.remaining > 0.01 ? fmtMoney(r.remaining) : '—'}
                  </td>
                  <td className="px-1.5 py-2">
                    <QuickPaymentCell invoiceId={r.id} remaining={r.remaining} status={r.status} kind="purchase" />
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-semibold text-gray-900">
              <tr>
                <td colSpan={5} className="px-1.5 py-3">
                  Razem ({totals.count} faktur{totals.onPage < totals.count ? `, na stronie ${totals.onPage}` : ''})
                </td>
                <td className="px-1.5 py-3 text-right tabular-nums">{fmtMoney(totals.net)}</td>
                <td></td>
                <td className="px-1.5 py-3 text-right tabular-nums">{fmtMoney(totals.vat)}</td>
                <td className="px-1.5 py-3 text-right tabular-nums">{fmtMoney(totals.gross)}</td>
                <td colSpan={3}></td>
                <td className={`px-1.5 py-3 text-right tabular-nums ${totals.remaining > 0.01 ? 'text-red-600' : 'text-gray-400'}`}>
                  {totals.remaining > 0.01 ? fmtMoney(totals.remaining) : '—'}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// Naglowek kolumny: sortowanie (gdy sortKey) + uchwyt resize na prawej krawedzi
// (drag = zmiana szerokosci, dblclick = reset do domyslnej).
function Th({
  col, currentSort, onSort, onResizeStart, onResetWidth, children,
}: {
  col: ColDef
  currentSort?: string
  onSort: (k: string) => void
  onResizeStart: (key: string, e: React.MouseEvent) => void
  onResetWidth: (key: string) => void
  children?: React.ReactNode
}) {
  const sortKey = col.sortKey
  const isActive = !!(sortKey && currentSort && currentSort.startsWith(sortKey + '-'))
  const dir = isActive ? currentSort!.slice(sortKey!.length + 1) : null
  const arrow = isActive ? (dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  return (
    <th className={`relative px-1.5 py-3 font-medium overflow-hidden ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
      {sortKey ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={`inline-flex items-center gap-0.5 hover:text-blue-600 max-w-full ${isActive ? 'text-blue-700' : 'text-gray-700'}`}
          title={`Sortuj po: ${col.label}`}
        >
          <span className="truncate">{col.label}</span>
          <span className={`text-xs shrink-0 ${isActive ? '' : 'text-gray-300'}`}>{arrow}</span>
        </button>
      ) : (
        <span className="text-gray-700 truncate">{col.label}</span>
      )}
      {/* Uchwyt resize — prawa krawedz naglowka */}
      <span
        onMouseDown={(e) => onResizeStart(col.key, e)}
        onDoubleClick={() => onResetWidth(col.key)}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-blue-300/60"
        title="Przeciągnij aby zmienić szerokość • dwuklik = reset"
      />
    </th>
  )
}

// Kategoria inline — klik na badge/"—" otwiera select, wybor zapisuje od razu
// (PATCH kategorii dziala niezaleznie od statusu FV, jak w widoku szczegolow).
function CategoryCell({ invoiceId, category }: { invoiceId: string; category: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save(next: string) {
    setSaving(true)
    try {
      const r = await fetch(`/api/finanse/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category: next || null }),
      })
      if (r.ok) { setEditing(false); router.refresh() }
      else {
        const data = await r.json().catch(() => ({}))
        alert(data.error || 'Błąd zapisu kategorii')
      }
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={category || ''}
        disabled={saving}
        onChange={(e) => save(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
        className="w-full px-1 py-0.5 border border-blue-300 rounded text-xs disabled:opacity-50"
      >
        <option value="">— brak —</option>
        {PURCHASE_INVOICE_CATEGORIES.map((c) => (
          <option key={c} value={c}>{PURCHASE_INVOICE_CATEGORY_LABELS[c]}</option>
        ))}
      </select>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block text-left"
      title={category ? 'Kliknij aby zmienić kategorię' : 'Kliknij aby ustawić kategorię'}
    >
      {category ? (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
          PURCHASE_INVOICE_CATEGORY_COLORS[category as PurchaseInvoiceCategory] || 'bg-gray-100 text-gray-600'
        }`}>
          {PURCHASE_INVOICE_CATEGORY_LABELS[category as PurchaseInvoiceCategory] || category}
        </span>
      ) : (
        <span className="text-gray-300 text-xs hover:text-blue-500">+ ustaw</span>
      )}
    </button>
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
          className="px-2 py-1 border border-blue-300 rounded text-xs w-full max-w-[160px]"
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
      className="text-left text-xs text-gray-600 hover:text-blue-600 block w-full truncate"
      title={initial ? `${initial} (kliknij aby edytować)` : 'Kliknij aby dodać komentarz'}
    >
      {initial || <span className="text-gray-300 italic">+ dodaj</span>}
    </button>
  )
}
