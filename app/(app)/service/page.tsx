import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import {
  SERVICE_STATUS_LABELS, SERVICE_STATUS_COLORS,
  SERVICE_PRIORITY_LABELS, SERVICE_PRIORITY_COLORS,
  type ServiceStatus, type ServicePriority
} from '@/lib/types'

async function getRequests(status?: string, priority?: string) {
  return prisma.serviceRequest.findMany({
    where: {
      AND: [
        status ? { status } : {},
        priority ? { priority } : {},
      ],
    },
    include: { client: true, unit: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
}

export default async function ServicePage({
  searchParams,
}: {
  searchParams: { status?: string; priority?: string }
}) {
  const requests = await getRequests(searchParams.status, searchParams.priority)

  const open = requests.filter((r) => r.status !== 'ZAKONCZONE').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Serwis / Usterki</h1>
          <p className="text-gray-500 text-sm mt-1">{open} otwartych · {requests.length} łącznie</p>
        </div>
        <Link href="/service/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nowe zgłoszenie
        </Link>
      </div>

      <ServiceFilters current={searchParams} />

      <div className="space-y-2">
        {requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            Brak zgłoszeń serwisowych
          </div>
        ) : (
          requests.map((r) => (
            <Link key={r.id} href={`/service/${r.id}`}
              className="flex items-start gap-4 bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-200 hover:shadow-sm transition-all">
              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${priorityDot(r.priority)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{r.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {r.client.firstName} {r.client.lastName}
                      {r.unit ? ` · ${r.unit.number}` : ''}
                    </p>
                    {r.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{r.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${SERVICE_PRIORITY_COLORS[r.priority as ServicePriority]}`}>
                      {SERVICE_PRIORITY_LABELS[r.priority as ServicePriority]}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${SERVICE_STATUS_COLORS[r.status as ServiceStatus]}`}>
                      {SERVICE_STATUS_LABELS[r.status as ServiceStatus]}
                    </span>
                  </div>
                </div>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{formatDateTime(r.createdAt)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

function priorityDot(priority: string) {
  return { WYSOKA: 'bg-red-500', SREDNIA: 'bg-orange-400', NISKA: 'bg-gray-400' }[priority] || 'bg-gray-400'
}

function ServiceFilters({ current }: { current: { status?: string; priority?: string } }) {
  return (
    <div className="flex gap-3 mb-4 flex-wrap">
      {[
        { href: '/service', label: 'Wszystkie' },
        { href: '/service?status=ZGLOSZONO', label: 'Zgłoszone' },
        { href: '/service?status=W_TOKU', label: 'W toku' },
        { href: '/service?status=ZAKONCZONE', label: 'Zakończone' },
      ].map((item) => (
        <Link key={item.href} href={item.href}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          {item.label}
        </Link>
      ))}
      <Link href="/service?priority=WYSOKA"
        className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors">
        Priorytet wysoki
      </Link>
    </div>
  )
}
