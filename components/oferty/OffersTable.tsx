'use client'
import { ClickableRow } from '@/components/ui/ClickableRow'
import { useTableSort, SortHeader } from '@/components/ui/sortableTable'

export type OfferRow = {
  id: string
  title: string | null
  number: string | null
  createdAt: string // ISO
  clientName: string | null
  itemsCount: number
  subtotalNet: number
  totalDiscountNet: number
  totalNet: number
  totalGross: number
  status: string
}

type Key = 'tytul' | 'klient' | 'pozycji' | 'subtotalNet' | 'rabat' | 'totalNet' | 'totalGross' | 'status'

function offerTitle(o: OfferRow) {
  return o.title || (o.number ? `Oferta #${o.number}` : 'Oferta bez tytułu')
}

function getValue(o: OfferRow, key: Key): string | number | null {
  switch (key) {
    case 'tytul': return offerTitle(o)
    case 'klient': return o.clientName || ''
    case 'pozycji': return o.itemsCount
    case 'subtotalNet': return o.subtotalNet
    case 'rabat': return o.totalDiscountNet
    case 'totalNet': return o.totalNet
    case 'totalGross': return o.totalGross
    case 'status': return o.status
  }
}

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  SZKIC: { label: 'szkic', cls: 'bg-gray-100 text-gray-600' },
  WYSLANA: { label: 'wysłana', cls: 'bg-blue-50 text-blue-700' },
  ZAAKCEPTOWANA: { label: 'zaakceptowana', cls: 'bg-green-50 text-green-700' },
  ODRZUCONA: { label: 'odrzucona', cls: 'bg-red-50 text-red-700' },
  ANULOWANA: { label: 'anulowana', cls: 'bg-gray-100 text-gray-500' },
}

const TH = 'px-3 py-3 font-medium'
const TH1 = 'px-5 py-3 font-medium'

export function OffersTable({ rows }: { rows: OfferRow[] }) {
  const { sorted, sortKey, sortDir, onSort } = useTableSort<OfferRow, Key>(rows, getValue, 'tytul', 'asc')

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
          <tr>
            <SortHeader label="Tytuł" colKey="tytul" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH1} />
            <SortHeader label="Klient" colKey="klient" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Pozycji" colKey="pozycji" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} align="right" />
            <SortHeader label="Suma netto" colKey="subtotalNet" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} align="right" />
            <SortHeader label="Rabat" colKey="rabat" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} align="right" />
            <SortHeader label="Po rabacie netto" colKey="totalNet" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} align="right" />
            <SortHeader label="Po rabacie brutto" colKey="totalGross" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} align="right" />
            <SortHeader label="Status" colKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} className="px-5 py-3 font-medium" align="right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => {
            const st = STATUS_MAP[o.status] || { label: o.status, cls: 'bg-gray-100' }
            return (
              <ClickableRow key={o.id} href={`/oferty/${o.id}`} className="border-t border-gray-100">
                <td className="px-5 py-3">
                  <span className="font-medium text-gray-900">{offerTitle(o)}</span>
                  <p className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleDateString('pl-PL')}</p>
                </td>
                <td className="px-3 py-3 text-gray-700">
                  {o.clientName || <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-3 text-right text-gray-600">{o.itemsCount}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-500">{fmt(o.subtotalNet)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-amber-700">
                  {o.totalDiscountNet > 0 ? `−${fmt(o.totalDiscountNet)}` : '—'}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-medium">{fmt(o.totalNet)}</td>
                <td className="px-3 py-3 text-right tabular-nums font-medium text-green-700">{fmt(o.totalGross)}</td>
                <td className="px-5 py-3 text-right">
                  <span className={`inline-block px-2 py-0.5 text-xs rounded ${st.cls}`}>{st.label}</span>
                </td>
              </ClickableRow>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
