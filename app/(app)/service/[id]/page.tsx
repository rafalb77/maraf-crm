import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import {
  SERVICE_STATUS_LABELS, SERVICE_STATUS_COLORS,
  SERVICE_PRIORITY_LABELS, SERVICE_PRIORITY_COLORS,
  type ServiceStatus, type ServicePriority
} from '@/lib/types'
import { ServiceStatusChanger } from '@/components/service/ServiceStatusChanger'
import { DeleteServiceButton } from '@/components/service/DeleteServiceButton'

export default async function ServiceDetailPage({ params }: { params: { id: string } }) {
  const request = await prisma.serviceRequest.findUnique({
    where: { id: params.id },
    include: { client: true, unit: true },
  })

  if (!request) notFound()

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/service" className="hover:text-blue-600">Serwis</Link>
            <span>/</span>
            <span className="truncate max-w-xs">{request.title}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{request.title}</h1>
          <p className="text-gray-500 text-sm mt-1">Zgłoszono: {formatDateTime(request.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <ServiceStatusChanger requestId={request.id} currentStatus={request.status as ServiceStatus} />
          <DeleteServiceButton id={request.id} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <span className={`px-2 py-0.5 rounded text-sm font-medium ${SERVICE_STATUS_COLORS[request.status as ServiceStatus]}`}>
              {SERVICE_STATUS_LABELS[request.status as ServiceStatus]}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Priorytet</p>
            <span className={`px-2 py-0.5 rounded text-sm font-medium ${SERVICE_PRIORITY_COLORS[request.priority as ServicePriority]}`}>
              {SERVICE_PRIORITY_LABELS[request.priority as ServicePriority]}
            </span>
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Klient</p>
          <Link href={`/clients/${request.clientId}`} className="font-medium text-blue-600 hover:text-blue-700">
            {request.client.firstName} {request.client.lastName}
          </Link>
          <p className="text-sm text-gray-500">{request.client.phone || request.client.email || '—'}</p>
        </div>

        {request.unit && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Lokal</p>
            <Link href={`/units/${request.unitId}`} className="font-medium text-blue-600 hover:text-blue-700">
              {request.unit.number}
            </Link>
          </div>
        )}

        {request.description && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Opis</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{request.description}</p>
          </div>
        )}

        {request.resolvedAt && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Zakończono</p>
            <p className="text-sm text-gray-700">{formatDateTime(request.resolvedAt)}</p>
          </div>
        )}
      </div>
    </div>
  )
}
