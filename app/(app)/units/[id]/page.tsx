import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { formatCurrency, formatArea, formatDate, formatDateTime } from '@/lib/utils'
import {
  UNIT_TYPE_LABELS, UNIT_STATUS_LABELS, UNIT_STATUS_COLORS,
  SERVICE_STATUS_LABELS, SERVICE_STATUS_COLORS, SERVICE_PRIORITY_LABELS,
  CONTRACT_TYPE_LABELS, canGenerateCreative,
  type UnitType, type UnitStatus, type ServiceStatus, type ServicePriority, type ContractType
} from '@/lib/types'
import { FloorPlanUpload } from '@/components/units/FloorPlanUpload'
import { UnitImageGallery } from '@/components/units/UnitImageGallery'
import { DeleteUnitButton } from '@/components/units/DeleteUnitButton'
import { UnitEscrowSubaccount } from '@/components/units/UnitEscrowSubaccount'
import { ReserveForClientModal } from '@/components/units/ReserveForClientModal'
import { PromoteReservationButton } from '@/components/clients/PromoteReservationButton'

export default async function UnitDetailPage({ params }: { params: { id: string } }) {
  const unit = await prisma.unit.findUnique({
    where: { id: params.id },
    include: {
      clientUnits: { include: { client: true } },
      contractUnits: {
        where: { contract: { status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] } } },
        select: {
          contract: {
            select: {
              id: true, number: true, type: true, status: true,
              client: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
              contractClients: {
                select: { client: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } } },
                orderBy: { position: 'asc' },
              },
            },
          },
        },
        orderBy: { contract: { createdAt: 'asc' } },
      },
      serviceRequests: { include: { client: true }, orderBy: { createdAt: 'desc' } },
      images: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
    },
  })

  if (!unit) notFound()

  // „Przypisani klienci": najpierw strony aktywnych umów z tym lokalem (umowa =
  // prawda o tym, czyj jest lokal), potem wpisy portfela (rezerwacja miękka / samo
  // przypisanie). Wpis klienta, który nie jest stroną żadnej z tych umów ani nie
  // trzyma rezerwacji, to zalegający ślad po lokalu, który przeszedł do kogoś innego
  // — oznaczamy go, zamiast pokazywać jak właściciela (MP.21 u Czwondy, 11.2026).
  type Holder = { id: string; firstName: string; lastName: string; phone: string | null; email: string | null }
  const holders: { client: Holder; note: string; contract: { id: string; number: string } | null; stale: boolean }[] = []
  const seen = new Set<string>()
  for (const cu of unit.contractUnits) {
    const c = cu.contract
    const note = `${CONTRACT_TYPE_LABELS[c.type as ContractType] ?? c.type}${c.status === 'PODPISANA' ? '' : ' (w przygotowaniu)'}`
    for (const cl of [c.client, ...c.contractClients.map((cc) => cc.client)]) {
      if (seen.has(cl.id)) continue
      seen.add(cl.id)
      holders.push({ client: cl, note, contract: { id: c.id, number: c.number }, stale: false })
    }
  }
  const claimed = seen.size > 0 || !!unit.reservedById
  for (const cu of unit.clientUnits) {
    if (seen.has(cu.clientId)) continue
    seen.add(cu.clientId)
    const isHolder = unit.reservedById === cu.clientId
    const note = isHolder
      ? unit.reservationType === 'MIEKKA'
        ? `rezerwacja miękka${unit.reservationExpiresAt ? ` do ${formatDate(unit.reservationExpiresAt)}` : ''}`
        : 'rezerwacja'
      : claimed
        ? 'zalegający wpis portfela — lokal ma innego klienta; usuń go (×) na karcie klienta'
        : `przypisany ${formatDate(cu.assignedAt)}`
    holders.push({ client: cu.client, note, contract: null, stale: claimed && !isHolder })
  }

  // Lista klientów do szybkiej rezerwacji z poziomu lokalu (gdy WOLNY).
  const clientsForReserve = unit.status === 'WOLNY'
    ? await prisma.client.findMany({
        select: { id: true, firstName: true, lastName: true, phone: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
    : []

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/units" className="hover:text-blue-600">Lokale</Link>
            <span>/</span>
            <span>{unit.number}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{unit.number}</h1>
            <span className={`px-2 py-0.5 rounded text-sm font-medium ${UNIT_STATUS_COLORS[unit.status as UnitStatus]}`}>
              {UNIT_STATUS_LABELS[unit.status as UnitStatus]}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">{UNIT_TYPE_LABELS[unit.type as UnitType]}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {unit.status === 'WOLNY' && (
            <ReserveForClientModal unitId={unit.id} unitNumber={unit.number} clients={clientsForReserve} />
          )}
          {unit.reservationType === 'MIEKKA' && unit.reservedById && (
            <PromoteReservationButton clientId={unit.reservedById} variant="button" />
          )}
          {canGenerateCreative(unit) && (
            <Link
              href={`/units/${unit.id}/creative`}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Generuj kreacje
            </Link>
          )}
          {unit.type === 'MIESZKALNY' && (
            <a
              href={`/api/units/${unit.id}/prospekt`}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Prospekt (.docx)
            </a>
          )}
          <Link
            href={`/units/${unit.id}/edit`}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Edytuj
          </Link>
          <DeleteUnitButton id={unit.id} number={unit.number} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Dane lokalu</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Numer" value={unit.number} />
              <Field label="Typ" value={UNIT_TYPE_LABELS[unit.type as UnitType]} />
              <Field label="Powierzchnia" value={formatArea(unit.area)} />
              <Field label="Piętro" value={
                unit.floor === null ? '—'
                  : unit.floor === 0 ? 'Parter'
                  : unit.floor === -1 ? 'Podziemie'
                  : `${unit.floor}. piętro`
              } />
              <Field label="Liczba pokoi" value={unit.rooms != null ? String(unit.rooms) : '—'} />
              <Field label="Budynek" value={unit.building || '—'} />
              <Field label="VAT" value={`${unit.vatRate}%`} />
              <Field label="Cena za m² netto" value={formatCurrency(unit.pricePerSqmNet)} />
              <Field label="Cena za m² brutto" value={formatCurrency(unit.pricePerSqmGross)} />
              <Field label="Cena netto" value={formatCurrency(unit.priceNet)} />
              <Field label="Cena brutto" value={formatCurrency(unit.priceGross)} />
              {/* Rachunek wirtualny ING per lokal — dopasowanie wplat nabywcy
                  w Rozliczeniach powierniczych (umowa dziedziczy z lokalu). */}
              <div className="sm:col-span-2">
                <UnitEscrowSubaccount unitId={unit.id} initial={unit.escrowSubaccount} />
              </div>
            </div>
            {unit.description && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500 mb-1">Opis</p>
                <p className="text-sm text-gray-700">{unit.description}</p>
              </div>
            )}
          </div>

          {/* Karta lokalu (PDF) */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Karta lokalu (PDF)</h2>
            {unit.floorPlanUrl ? (
              <div className="space-y-3">
                {unit.floorPlanUrl.endsWith('.pdf') ? (
                  <>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <a href={unit.floorPlanUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Otwórz w nowej karcie
                      </a>
                      <a href={unit.floorPlanUrl} download
                        className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Pobierz
                      </a>
                    </div>
                    <iframe src={unit.floorPlanUrl} title="Podgląd karty PDF"
                      className="w-full rounded-lg border border-gray-100 bg-gray-50 min-h-[280px] sm:min-h-[480px]"
                      style={{ aspectRatio: '4 / 3' }} />
                  </>
                ) : (
                  <div className="relative rounded-lg overflow-hidden border border-gray-100" style={{ height: 300 }}>
                    <Image src={unit.floorPlanUrl} alt="Karta lokalu" fill unoptimized className="object-contain" />
                  </div>
                )}
              </div>
            ) : null}
            <div className="mt-3">
              <FloorPlanUpload unitId={unit.id} />
            </div>
          </div>

          {/* Galeria zdjec / wizualizacji — uzywana do generowania kreacji Meta Ads */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Zdjecia i wizualizacje</h2>
            <UnitImageGallery unitId={unit.id} initialImages={unit.images} />
          </div>

          {/* Service requests */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Historia usterek</h2>
            </div>
            {unit.serviceRequests.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak zgłoszonych usterek</p>
            ) : (
              <div className="space-y-2">
                {unit.serviceRequests.map((s) => (
                  <Link key={s.id} href={`/service/${s.id}`}
                    className="flex gap-3 items-start p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{s.title}</p>
                      <p className="text-xs text-gray-500">
                        {s.client.firstName} {s.client.lastName} · {formatDateTime(s.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
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

        {/* Assigned clients */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Przypisani klienci</h2>
            {holders.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak przypisanych klientów</p>
            ) : (
              <div className="space-y-2">
                {holders.map((h) => (
                  <div key={h.client.id} className={`flex items-center gap-3 p-2 rounded-lg ${h.stale ? 'opacity-70' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm ${h.stale ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>
                      {h.client.firstName[0]}{h.client.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <Link href={`/clients/${h.client.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                        {h.client.firstName} {h.client.lastName}
                      </Link>
                      <p className="text-xs text-gray-500">{h.client.phone || h.client.email || '—'}</p>
                      <p className={`text-xs ${h.stale ? 'text-amber-700' : 'text-gray-600'}`}>
                        {h.note}
                        {h.contract && (
                          <>
                            {' '}
                            <Link href={`/sales/${h.contract.id}`} className="text-blue-600 hover:text-blue-700 font-medium">
                              {h.contract.number}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  )
}
