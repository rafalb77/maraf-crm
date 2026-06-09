import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { formatCurrency, formatArea, formatDateTime } from '@/lib/utils'
import {
  UNIT_TYPE_LABELS, UNIT_STATUS_LABELS, UNIT_STATUS_COLORS,
  SERVICE_STATUS_LABELS, SERVICE_STATUS_COLORS, SERVICE_PRIORITY_LABELS,
  canGenerateCreative,
  type UnitType, type UnitStatus, type ServiceStatus, type ServicePriority
} from '@/lib/types'
import { FloorPlanUpload } from '@/components/units/FloorPlanUpload'
import { UnitImageGallery } from '@/components/units/UnitImageGallery'
import { DeleteUnitButton } from '@/components/units/DeleteUnitButton'
import { ReserveForClientModal } from '@/components/units/ReserveForClientModal'

export default async function UnitDetailPage({ params }: { params: { id: string } }) {
  const unit = await prisma.unit.findUnique({
    where: { id: params.id },
    include: {
      clientUnits: { include: { client: true } },
      serviceRequests: { include: { client: true }, orderBy: { createdAt: 'desc' } },
      images: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
    },
  })

  if (!unit) notFound()

  // Lista klientów do szybkiej rezerwacji z poziomu lokalu (gdy WOLNY).
  const clientsForReserve = unit.status === 'WOLNY'
    ? await prisma.client.findMany({
        select: { id: true, firstName: true, lastName: true, phone: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
    : []

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
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
        <div className="flex gap-2">
          {unit.status === 'WOLNY' && (
            <ReserveForClientModal unitId={unit.id} unitNumber={unit.number} clients={clientsForReserve} />
          )}
          {canGenerateCreative(unit) && (
            <Link
              href={`/units/${unit.id}/creative`}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Generuj kreacje
            </Link>
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
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Dane lokalu</h2>
            <div className="grid grid-cols-2 gap-4">
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
            </div>
            {unit.description && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500 mb-1">Opis</p>
                <p className="text-sm text-gray-700">{unit.description}</p>
              </div>
            )}
          </div>

          {/* Karta lokalu (PDF) */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
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
                      className="w-full rounded-lg border border-gray-100 bg-gray-50"
                      style={{ aspectRatio: '4 / 3', minHeight: 480 }} />
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
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Zdjecia i wizualizacje</h2>
            <UnitImageGallery unitId={unit.id} initialImages={unit.images} />
          </div>

          {/* Service requests */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
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
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Przypisani klienci</h2>
            {unit.clientUnits.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak przypisanych klientów</p>
            ) : (
              <div className="space-y-2">
                {unit.clientUnits.map((cu) => (
                  <Link key={cu.clientId} href={`/clients/${cu.clientId}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium text-sm">
                      {cu.client.firstName[0]}{cu.client.lastName[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{cu.client.firstName} {cu.client.lastName}</p>
                      <p className="text-xs text-gray-500">{cu.client.phone || cu.client.email || '—'}</p>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  )
}
