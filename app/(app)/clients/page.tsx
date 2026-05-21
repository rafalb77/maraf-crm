import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import {
  CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS,
  type ClientStatus
} from '@/lib/types'
import { ClientFilters } from '@/components/clients/ClientFilters'
import { ClickableRow } from '@/components/ui/ClickableRow'

async function getClients(status?: string, search?: string) {
  return prisma.client.findMany({
    where: {
      AND: [
        search ? {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        } : {},
        status ? { status } : {},
      ],
    },
    include: {
      clientUnits: { include: { unit: true } },
      _count: { select: { activities: true, serviceRequests: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { status?: string; search?: string }
}) {
  const clients = await getClients(searchParams.status, searchParams.search)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Klienci</h1>
          <p className="text-gray-500 text-sm mt-1">{clients.length} klientów</p>
        </div>
        <Link
          href="/clients/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Dodaj klienta
        </Link>
      </div>

      <ClientFilters />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">Klient</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Kontakt</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Lokale</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Działania</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Ostatnia aktywność</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  Brak klientów spełniających kryteria
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <ClickableRow key={client.id} href={`/clients/${client.id}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
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
                    {client.clientUnits.length > 0
                      ? client.clientUnits.map((cu) => cu.unit.number).join(', ')
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{client._count.activities}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDateTime(client.updatedAt)}</td>
                </ClickableRow>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
