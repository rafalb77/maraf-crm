import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime, formatCurrency, formatDate } from '@/lib/utils'
import {
  CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS,
  ACTIVITY_TYPE_LABELS, SERVICE_STATUS_COLORS, SERVICE_STATUS_LABELS,
  SERVICE_PRIORITY_LABELS, SERVICE_PRIORITY_COLORS,
  UNIT_TYPE_LABELS, UNIT_STATUS_LABELS, UNIT_STATUS_COLORS,
  RESERVATION_TYPE_LABELS, RESERVATION_TYPE_COLORS,
  CONTRACT_TYPE_LABELS, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS,
  type ClientStatus, type ActivityType, type ServiceStatus, type ServicePriority, type UnitType, type UnitStatus, type ReservationType,
  type ContractType, type ContractStatus,
} from '@/lib/types'
import { expireSoftReservations } from '@/lib/reservations'
import { ActivityForm } from '@/components/clients/ActivityForm'
import { AssignUnitModal } from '@/components/clients/AssignUnitModal'
import { DeleteClientButton } from '@/components/clients/DeleteClientButton'
import { ClientStatusChanger } from '@/components/clients/ClientStatusChanger'
import { UnassignUnitButton } from '@/components/clients/UnassignUnitButton'

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  await expireSoftReservations()
  const [client, allUnits] = await Promise.all([
    prisma.client.findUnique({
      where: { id: params.id },
      include: {
        clientUnits: { include: { unit: true } },
        activities: { orderBy: { date: 'desc' } },
        serviceRequests: { include: { unit: true }, orderBy: { createdAt: 'desc' } },
        contracts: { orderBy: { createdAt: 'desc' } },
      },
    }),
    prisma.unit.findMany({ orderBy: { number: 'asc' } }),
  ])

  if (!client) notFound()

  const assignedUnitIds = client.clientUnits.map((cu) => cu.unitId)
  // Available = not already assigned and not sold/hard-reserved by someone else
  const availableUnits = allUnits.filter(
    (u) =>
      !assignedUnitIds.includes(u.id) &&
      u.status !== 'SPRZEDANY' &&
      u.reservationType !== 'REZERWACJA',
  )

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/clients" className="hover:text-blue-600">Klienci</Link>
            <span>/</span>
            <span>{client.firstName} {client.lastName}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{client.firstName} {client.lastName}</h1>
            <ClientStatusChanger clientId={client.id} currentStatus={client.status as ClientStatus} />
          </div>
          {client.source && <p className="text-gray-500 text-sm mt-1">Źródło: {client.source}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/clients/${client.id}/edit`}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Edytuj
          </Link>
          <DeleteClientButton id={client.id} name={`${client.firstName} ${client.lastName}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: personal data + units + service */}
        <div className="lg:col-span-1 space-y-5">
          {/* Personal data */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Dane osobowe</h2>
            <div className="space-y-3 text-sm">
              <DataRow label="Imię i nazwisko" value={`${client.firstName} ${client.lastName}`} />
              <DataRow label="Telefon" value={client.phone || '—'} />
              {client.phone2 && <DataRow label="Telefon 2" value={client.phone2} />}
              <DataRow label="Email" value={client.email || '—'} />
              <DataRow label="PESEL" value={client.pesel || '—'} />
              {client.nip && <DataRow label="NIP" value={client.nip} />}
              <DataRow label="Adres" value={[client.address, client.zipCode, client.city].filter(Boolean).join(', ') || '—'} />
            </div>
          </div>

          {/* Notes */}
          {client.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Notatki</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}

          {/* Assigned units */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Przypisane lokale</h2>
              <AssignUnitModal clientId={client.id} availableUnits={availableUnits} />
            </div>
            {client.clientUnits.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak przypisanych lokali</p>
            ) : (
              <div className="space-y-2">
                {client.clientUnits.map((cu) => (
                  <div key={cu.unitId} className="flex items-center gap-3 p-2 rounded-lg border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <Link href={`/units/${cu.unitId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                        {cu.unit.number}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {UNIT_TYPE_LABELS[cu.unit.type as UnitType]} · {formatCurrency(cu.unit.priceGross)}
                      </p>
                      {cu.unit.reservationType && (
                        <p className="text-xs mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded font-medium ${RESERVATION_TYPE_COLORS[cu.unit.reservationType as ReservationType]}`}>
                            {RESERVATION_TYPE_LABELS[cu.unit.reservationType as ReservationType]}
                          </span>
                          {cu.unit.reservationType === 'MIEKKA' && cu.unit.reservationExpiresAt && (
                            <span className="text-gray-500 ml-1">do {formatDate(cu.unit.reservationExpiresAt)}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${UNIT_STATUS_COLORS[cu.unit.status as UnitStatus]}`}>
                      {UNIT_STATUS_LABELS[cu.unit.status as UnitStatus]}
                    </span>
                    {cu.unit.reservationType !== 'REZERWACJA' && (
                      <UnassignUnitButton clientId={client.id} unitId={cu.unitId} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contracts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Umowy</h2>
              <Link href={`/sales/new?clientId=${client.id}`}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                + Nowa
              </Link>
            </div>
            {client.contracts.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak umów</p>
            ) : (
              <div className="space-y-2">
                {client.contracts.map((c) => (
                  <Link key={c.id} href={`/sales/${c.id}`}
                    className="flex gap-3 items-start p-2 rounded-lg hover:bg-gray-50 border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{c.number}</p>
                      <p className="text-xs text-gray-500">{CONTRACT_TYPE_LABELS[c.type as ContractType]}</p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${CONTRACT_STATUS_COLORS[c.status as ContractStatus]}`}>
                      {CONTRACT_STATUS_LABELS[c.status as ContractStatus]}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Service requests */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Serwis / Usterki</h2>
              <Link href={`/service/new?clientId=${client.id}`}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                + Nowe
              </Link>
            </div>
            {client.serviceRequests.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak zgłoszeń</p>
            ) : (
              <div className="space-y-2">
                {client.serviceRequests.map((s) => (
                  <Link key={s.id} href={`/service/${s.id}`}
                    className="flex gap-3 items-start p-2 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                      <p className="text-xs text-gray-500">{s.unit?.number || 'Brak lokalu'}</p>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SERVICE_STATUS_COLORS[s.status as ServiceStatus]}`}>
                        {SERVICE_STATUS_LABELS[s.status as ServiceStatus]}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: activity feed */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Historia działań</h2>
            </div>
            <ActivityForm clientId={client.id} />
            <div className="mt-5 space-y-3">
              {client.activities.length === 0 ? (
                <p className="text-gray-400 text-sm">Brak zarejestrowanych działań</p>
              ) : (
                client.activities.map((a) => (
                  <div key={a.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center text-sm flex-shrink-0">
                        {activityIcon(a.type)}
                      </div>
                      <div className="w-px flex-1 bg-gray-100 mt-1" />
                    </div>
                    <div className="flex-1 pb-4 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-medium text-gray-500">
                            {ACTIVITY_TYPE_LABELS[a.type as ActivityType]}
                          </span>
                          <p className="text-sm font-medium text-gray-900 mt-0.5">{a.title}</p>
                          {a.content && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.content}</p>}
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{formatDateTime(a.date)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 w-32 flex-shrink-0">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  )
}

function activityIcon(type: string) {
  const icons: Record<string, string> = {
    NOTATKA: '📝', TELEFON: '📞', EMAIL: '✉️', SPOTKANIE: '🤝', DOKUMENT: '📄',
  }
  return icons[type] || '📝'
}

