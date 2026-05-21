'use client'
import { formatDate } from '@/lib/utils'
import {
  CONTRACT_TYPE_LABELS, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS,
  type ContractType, type ContractStatus,
} from '@/lib/types'
import { ClickableRow } from '@/components/ui/ClickableRow'
import { useTableSort, SortHeader } from '@/components/ui/sortableTable'

export type ContractRow = {
  id: string
  number: string
  investmentName: string
  type: string
  clientName: string
  introducedAt: string // ISO
  signedAt: string | null // ISO
  status: string
}

type Key = 'numer' | 'inwestycja' | 'typ' | 'klient' | 'wprow' | 'podpis' | 'status'

function getValue(c: ContractRow, key: Key): string | number | null {
  switch (key) {
    case 'numer': return c.number
    case 'inwestycja': return c.investmentName
    case 'typ': return CONTRACT_TYPE_LABELS[c.type as ContractType] || c.type
    case 'klient': return c.clientName
    case 'wprow': return c.introducedAt
    case 'podpis': return c.signedAt
    case 'status': return CONTRACT_STATUS_LABELS[c.status as ContractStatus] || c.status
  }
}

const TH = 'px-4 py-3 font-medium'

export function SalesTable({ rows }: { rows: ContractRow[] }) {
  const { sorted, sortKey, sortDir, onSort } = useTableSort<ContractRow, Key>(rows, getValue, 'wprow', 'desc')

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <SortHeader label="Numer" colKey="numer" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Inwestycja" colKey="inwestycja" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Typ" colKey="typ" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Klient" colKey="klient" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Data wprow." colKey="wprow" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Data podpisania" colKey="podpis" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Status" colKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center py-12 text-gray-400">Brak umów</td>
            </tr>
          ) : (
            sorted.map((c) => (
              <ClickableRow key={c.id} href={`/sales/${c.id}`}>
                <td className="px-4 py-3 text-sm font-medium text-blue-600">{c.number}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{c.investmentName}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{CONTRACT_TYPE_LABELS[c.type as ContractType]}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{c.clientName}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{formatDate(new Date(c.introducedAt))}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{c.signedAt ? formatDate(new Date(c.signedAt)) : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${CONTRACT_STATUS_COLORS[c.status as ContractStatus]}`}>
                    {CONTRACT_STATUS_LABELS[c.status as ContractStatus]}
                  </span>
                </td>
              </ClickableRow>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
