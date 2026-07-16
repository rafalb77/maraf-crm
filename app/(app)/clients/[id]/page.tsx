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
import { PromoteReservationButton } from '@/components/clients/PromoteReservationButton'
import { SwapButton } from '@/components/reservations/ReservationActions'
import { ClientOwnerChanger } from '@/components/clients/ClientOwnerChanger'

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  await expireSoftReservations()
  const [client, allUnits, users] = await Promise.all([
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
    prisma.user.findMany({
      select: { id: true, name: true, preferredName: true, email: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    }),
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

  // Meta pod nazwiskiem: klient od · źródło · pierwszy przypisany lokal
  const heroMeta = [
    `Klient od ${formatDate(client.createdAt)}`,
    client.source ? `Źródło: ${client.source}` : null,
    client.clientUnits[0] ? `Lokal ${client.clientUnits[0].unit.number}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      {/* Powrót do listy */}
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 -mt-1.5 mb-4 -ml-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        ← Klienci
      </Link>

      {/* Hero: avatar-inicjały + nazwisko + status + meta + akcje */}
      <div className="flex items-center gap-[18px] mb-6 flex-wrap v2-card-in">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-[19px] font-bold text-white flex-shrink-0"
          style={{ background: 'var(--gradient-brand)', boxShadow: 'var(--shadow-sm)' }}
        >
          {(client.firstName[0] || '') + (client.lastName[0] || '')}
        </div>
        <div className="flex-1 min-w-[200px]">
          {/* flex-col na mobile: status-changer zawsze zaczyna nowy wiersz od lewej krawędzi,
              dzięki czemu jego dropdown (absolute left-0) nigdy nie ucieka poza ekran 375px
              gdy imię+nazwisko jest krótkie i badge zmieściłby się w tej samej linii. */}
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <h1 className="text-2xl font-bold text-gray-900" style={{ letterSpacing: '-0.01em' }}>
              {client.firstName} {client.lastName}
            </h1>
            <ClientStatusChanger clientId={client.id} currentStatus={client.status as ClientStatus} />
          </div>
          {heroMeta && <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>{heroMeta}</p>}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/oferty/nowa"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--accent)' }}
          >
            + Nowa oferta
          </Link>
          <Link href={`/clients/${client.id}/edit`}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Edytuj
          </Link>
          <DeleteClientButton id={client.id} name={`${client.firstName} ${client.lastName}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Lewa (szeroka): historia działań + notatki */}
        <div className="lg:col-span-2 space-y-4">
          {/* Activity feed */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 v2-card-in" style={{ animationDelay: '.06s' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Historia działań</h2>
            </div>
            <ActivityForm clientId={client.id} />
            <div className="mt-5">
              {client.activities.length === 0 ? (
                <p className="text-gray-400 text-sm">Brak zarejestrowanych działań</p>
              ) : (
                client.activities.map((a) => (
                  <div key={a.id} className="flex gap-3.5 py-3 border-b last:border-b-0" style={{ borderColor: 'var(--border-soft)' }}>
                    <div
                      className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-sm flex-shrink-0 border"
                      style={{ background: 'var(--surface-alt)', borderColor: 'var(--border-soft)' }}
                    >
                      {activityIcon(a.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2.5">
                        <span className="text-[13px] font-semibold text-gray-900">
                          {ACTIVITY_TYPE_LABELS[a.type as ActivityType]}{a.title ? ` — ${a.title}` : ''}
                        </span>
                        <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {formatDateTime(a.date)}
                        </span>
                      </div>
                      {a.content && (
                        <p className="text-[13px] text-gray-600 mt-1 leading-relaxed whitespace-pre-wrap">{a.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Notes */}
          {client.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 v2-card-in" style={{ animationDelay: '.12s' }}>
              <h2 className="font-semibold text-gray-900 mb-3.5">Notatki</h2>
              <div
                className="px-3.5 py-3 rounded-[10px] text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap"
                style={{ background: 'var(--surface-alt)' }}
              >
                {client.notes}
              </div>
            </div>
          )}
        </div>

        {/* Prawa (wąska): dane osobowe + lokale + umowy + serwis */}
        <div className="lg:col-span-1 space-y-4">
          {/* Personal data */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 v2-card-in" style={{ animationDelay: '.09s' }}>
            <h2 className="font-semibold text-gray-900 mb-3.5">Dane osobowe</h2>
            <div className="space-y-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase" style={{ letterSpacing: '.1em', color: 'var(--text-muted)' }}>
                  Opiekun
                </span>
                <ClientOwnerChanger clientId={client.id} ownerId={client.ownerId} users={users} />
              </div>
              <DataRow label="Imię i nazwisko" value={`${client.firstName} ${client.lastName}`} />
              <DataRow label="Telefon" value={client.phone || '—'} />
              {client.phone2 && <DataRow label="Telefon 2" value={client.phone2} />}
              <DataRow label="E-mail" value={client.email || '—'} />
              <DataRow label="PESEL" value={client.pesel || '—'} />
              {client.nip && <DataRow label="NIP" value={client.nip} />}
              <DataRow label="Adres" value={[client.address, client.zipCode, client.city].filter(Boolean).join(', ') || '—'} />
            </div>
          </div>

          {/* Assigned units */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 v2-card-in" style={{ animationDelay: '.15s' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Przypisane lokale</h2>
              <AssignUnitModal clientId={client.id} availableUnits={availableUnits} />
            </div>
            {client.clientUnits.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak przypisanych lokali</p>
            ) : (
              <div className="space-y-2">
                {client.clientUnits.map((cu) => {
                  const isSoft = cu.unit.reservationType === 'MIEKKA'
                  const canUnassign = cu.unit.reservationType !== 'REZERWACJA'
                  return (
                    <div
                      key={cu.unitId}
                      className="px-3.5 py-3 rounded-[10px] border transition-colors"
                      style={{ background: 'var(--surface-alt)', borderColor: 'var(--border-soft)' }}
                    >
                      {/* Górny wiersz: lokal + status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/units/${cu.unitId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                            {cu.unit.number}
                          </Link>
                          <p className="text-xs text-gray-500">
                            {UNIT_TYPE_LABELS[cu.unit.type as UnitType]} · {formatCurrency(cu.unit.priceGross)}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${UNIT_STATUS_COLORS[cu.unit.status as UnitStatus]}`}>
                          {UNIT_STATUS_LABELS[cu.unit.status as UnitStatus]}
                        </span>
                      </div>
                      {/* Dolny wiersz: typ rezerwacji + akcje */}
                      {(cu.unit.reservationType || isSoft || canUnassign) && (
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <div className="flex items-center gap-1.5 min-w-0 text-xs">
                            {cu.unit.reservationType && (
                              <span className={`px-1.5 py-0.5 rounded font-medium ${RESERVATION_TYPE_COLORS[cu.unit.reservationType as ReservationType]}`}>
                                {RESERVATION_TYPE_LABELS[cu.unit.reservationType as ReservationType]}
                              </span>
                            )}
                            {isSoft && cu.unit.reservationExpiresAt && (
                              <span className="text-gray-500 whitespace-nowrap">do {formatDate(cu.unit.reservationExpiresAt)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isSoft && (
                              <SwapButton unitId={cu.unitId} unitNumber={cu.unit.number} unitType={cu.unit.type} />
                            )}
                            {canUnassign && (
                              <UnassignUnitButton clientId={client.id} unitId={cu.unitId} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Contracts */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 v2-card-in" style={{ animationDelay: '.21s' }}>
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
            <div className="mt-3">
              <PromoteReservationButton clientId={client.id} unitCount={client.clientUnits.length} />
            </div>
          </div>

          {/* Service requests */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 v2-card-in" style={{ animationDelay: '.27s' }}>
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
      </div>
    </div>
  )
}

// Etykieta nad wartością (styl v2) zamiast dwóch kolumn
function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[10px] font-semibold uppercase"
        style={{ letterSpacing: '.1em', color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  )
}

function activityIcon(type: string) {
  const icons: Record<string, string> = {
    NOTATKA: '📝', TELEFON: '📞', EMAIL: '✉️', SPOTKANIE: '🤝', DOKUMENT: '📄',
  }
  return icons[type] || '📝'
}

