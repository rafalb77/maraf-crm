import Link from 'next/link'
import { Clock, ExternalLink } from 'lucide-react'
import {
  CONTRACT_TYPE_LABELS, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS,
  UNIT_TYPE_LABELS,
  type ContractType, type ContractStatus, type UnitType,
} from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { endOfDay, type DealCardData } from '@/lib/client-portfolio'
import { StageMiniStepper } from './StageMiniStepper'

const VISIBLE_UNITS = 4

function fmtPct(pct: number): string {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(pct)
}

/** Bogata karta umowy na stronie klienta: etapy, kwoty, rabaty, składniki, aneksy. */
export function ContractDealCard({ deal }: { deal: DealCardData }) {
  const now = Date.now()
  const resEnd = deal.reservationEndDateISO ? new Date(deal.reservationEndDateISO) : null
  // Termin data-bez-czasu obowiązuje do końca dnia — czerwień dopiero PO dniu terminu.
  const resEndDays = resEnd ? (endOfDay(resEnd) - now) / 86_400_000 : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      {/* Wiersz 1: numer + badge typu/statusu + przejście do modułu Sprzedaż */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Link href={`/sales/${deal.id}`} prefetch={false} className="font-semibold text-gray-900 hover:text-blue-600">
            {deal.number}
          </Link>
          <span
            className="px-1.5 py-0.5 rounded text-xs font-medium"
            style={{ background: 'var(--status-accent-bg)', color: 'var(--status-accent-fg)' }}
          >
            {CONTRACT_TYPE_LABELS[deal.type as ContractType] ?? deal.type}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${CONTRACT_STATUS_COLORS[deal.status as ContractStatus]}`}>
            {CONTRACT_STATUS_LABELS[deal.status as ContractStatus] ?? deal.status}
          </span>
          {deal.isCoBuyer && (
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Współkupujący</span>
          )}
        </div>
        <Link
          href={`/sales/${deal.id}`}
          prefetch={false}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-shrink-0"
        >
          <ExternalLink className="w-4 h-4" />
          Otwórz w Sprzedaży
        </Link>
      </div>

      {/* Wiersz 2: mini-oś etapów (read-only) */}
      <div className="mt-3">
        <StageMiniStepper currentStage={deal.type} stages={deal.stages} daysInStage={deal.daysInStage} />
      </div>

      {/* Wiersz 3: finanse */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="px-3.5 py-2.5 rounded-[10px]" style={{ background: 'var(--surface-alt)' }}>
          <p className="text-[10px] font-semibold uppercase" style={{ letterSpacing: '.1em', color: 'var(--text-muted)' }}>
            Wartość umowy
          </p>
          <p className="text-sm font-semibold text-gray-900 tabular-nums mt-0.5">{formatCurrency(deal.valueGross)}</p>
        </div>
        <div className="px-3.5 py-2.5 rounded-[10px]" style={{ background: 'var(--surface-alt)' }}>
          <p className="text-[10px] font-semibold uppercase" style={{ letterSpacing: '.1em', color: 'var(--text-muted)' }}>
            Cennik (referencyjny)
          </p>
          <p className="text-sm text-gray-600 tabular-nums mt-0.5">{formatCurrency(deal.cennikGross)}</p>
        </div>
        <div className="px-3.5 py-2.5 rounded-[10px]" style={{ background: 'var(--surface-alt)' }} title="Rabat vs cennik z dnia umowy">
          <p className="text-[10px] font-semibold uppercase" style={{ letterSpacing: '.1em', color: 'var(--text-muted)' }}>
            Rabat
          </p>
          {deal.discountGross > 0 ? (
            <p className="text-sm font-semibold text-green-700 tabular-nums mt-0.5">
              −{formatCurrency(deal.discountGross)} (−{fmtPct(deal.discountPct)}%)
            </p>
          ) : (
            <p className="text-sm text-gray-400 mt-0.5">—</p>
          )}
        </div>
      </div>

      {/* Wiersz 4: składniki umowy */}
      <div className="mt-3 space-y-1">
        {deal.units.slice(0, VISIBLE_UNITS).map((u) => (
          <DealUnitRow key={u.unitId} u={u} />
        ))}
        {deal.units.length > VISIBLE_UNITS && (
          <details>
            <summary className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer py-1">
              Pokaż wszystkie ({deal.units.length})
            </summary>
            <div className="space-y-1">
              {deal.units.slice(VISIBLE_UNITS).map((u) => (
                <DealUnitRow key={u.unitId} u={u} />
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Wiersz 5: aneksy */}
      {deal.annexCount > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          Aneksy: {deal.annexCount}
          {deal.lastAnnexISO && <> · ostatni {formatDate(new Date(deal.lastAnnexISO))}</>}
          {deal.lastAnnexDelta > 0 && <> · <span className="text-emerald-700 font-medium">+{formatCurrency(deal.lastAnnexDelta)}</span></>}
        </p>
      )}

      {/* Stopka: daty + termin rezerwacji + współkupujący */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-x-3 gap-y-1.5 flex-wrap text-xs text-gray-500">
        <span>Wprowadzono {formatDate(new Date(deal.introducedAtISO))}</span>
        {deal.signedAtISO && <span>Podpisano {formatDate(new Date(deal.signedAtISO))}</span>}
        {deal.type === 'REZERWACYJNA' && resEnd && resEndDays != null && (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${
              resEndDays < 0 ? 'bg-red-100 text-red-700' : resEndDays <= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Rezerwacja do {formatDate(resEnd)}
          </span>
        )}
        {deal.coBuyers.length > 0 && (
          <span>
            Pozostali kupujący:{' '}
            {deal.coBuyers.map((cb, i) => (
              <span key={cb.id}>
                {i > 0 && ', '}
                <Link href={`/clients/${cb.id}`} prefetch={false} className="text-blue-600 hover:text-blue-700">
                  {cb.firstName} {cb.lastName}
                </Link>
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

function DealUnitRow({ u }: { u: DealCardData['units'][number] }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-gray-100 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <Link href={`/units/${u.unitId}`} prefetch={false} className="font-medium text-gray-900 hover:text-blue-600">
          {u.number}
        </Link>
        <span className="text-xs text-gray-500 truncate">{UNIT_TYPE_LABELS[u.unitType as UnitType] ?? u.unitType}</span>
        {u.fromAnnex && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 flex-shrink-0">Aneks</span>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <span className="tabular-nums font-medium text-gray-900">{formatCurrency(u.purchase)}</span>
        {u.discount > 0 && (
          <span className="ml-2 text-xs text-green-700 tabular-nums">
            −{formatCurrency(u.discount)} (−{fmtPct(u.discountPct)}%)
          </span>
        )}
      </div>
    </div>
  )
}
