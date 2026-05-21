'use client'
import { formatDateTime } from '@/lib/utils'
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS, type ClientStatus } from '@/lib/types'
import { ClickableRow } from '@/components/ui/ClickableRow'
import { useTableSort, SortHeader } from '@/components/ui/sortableTable'

export type ClientRow = {
  id: string
  firstName: string
  lastName: string
  source: string | null
  phone: string | null
  email: string | null
  status: string
  unitNumbers: string[]
  activitiesCount: number
  updatedAt: string // ISO
}

type Key = 'klient' | 'kontakt' | 'status' | 'lokale' | 'dzialania' | 'aktywnosc'

function getValue(r: ClientRow, key: Key): string | number | null {
  switch (key) {
    case 'klient': return `${r.lastName} ${r.firstName}`.trim()
    case 'kontakt': return r.phone || r.email || ''
    case 'status': return CLIENT_STATUS_LABELS[r.status as ClientStatus] || r.status
    case 'lokale': return r.unitNumbers.length
    case 'dzialania': return r.activitiesCount
    case 'aktywnosc': return r.updatedAt
  }
}

const TH = 'px-4 py-3 font-medium text-gray-500'

export function ClientsTable({ rows }: { rows: ClientRow[] }) {
  const { sorted, sortKey, sortDir, onSort } = useTableSort<ClientRow, Key>(rows, getValue, 'aktywnosc', 'desc')

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <SortHeader label="Klient" colKey="klient" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Kontakt" colKey="kontakt" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Status" colKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Lokale" colKey="lokale" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Działania" colKey="dzialania" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} align="right" />
            <SortHeader label="Ostatnia aktywność" colKey="aktywnosc" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-gray-400">Brak klientów spełniających kryteria</td>
            </tr>
          ) : (
            sorted.map((client) => (
              <ClickableRow key={client.id} href={`/clients/${client.id}`} className="border-b border-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium text-sm flex-shrink-0">
                      {client.firstName[0]}{client.lastName[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{client.firstName} {client.lastName}</p>
                      {client.source && <p className="text-xs text-gray-400">{client.source}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <div>{client.phone || '—'}</div>
                  {client.email && <div className="text-xs text-gray-400">{client.email}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${CLIENT_STATUS_COLORS[client.status as ClientStatus]}`}>
                    {CLIENT_STATUS_LABELS[client.status as ClientStatus]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {client.unitNumbers.length > 0
                    ? client.unitNumbers.join(', ')
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{client.activitiesCount}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{formatDateTime(new Date(client.updatedAt))}</td>
              </ClickableRow>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
