import Link from 'next/link'
import { Clock } from 'lucide-react'
import type { ComponentProps } from 'react'
import {
  UNIT_TYPE_LABELS, UNIT_STATUS_LABELS, UNIT_STATUS_COLORS,
  RESERVATION_TYPE_LABELS, RESERVATION_TYPE_COLORS,
  type UnitType, type UnitStatus, type ReservationType,
} from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { PortfolioRow, PortfolioSums } from '@/lib/client-portfolio'
import { AssignUnitModal } from './AssignUnitModal'
import { UnassignUnitButton } from './UnassignUnitButton'
import { SwapButton } from '@/components/reservations/ReservationActions'

function fmtPct(pct: number): string {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(pct)
}

/**
 * Portfel lokali klienta: unia przypisań (ClientUnit) i składników aktywnych
 * umów — z ceną zakupu (snapshot z umowy), cennikiem i rabatem per lokal.
 * Desktop: tabela z sumami; mobile: karty (idiom ClientsTable).
 */
export function ClientUnitsPanel({
  clientId,
  rows,
  sums,
  availableUnits,
}: {
  clientId: string
  rows: PortfolioRow[]
  sums: PortfolioSums
  availableUnits: ComponentProps<typeof AssignUnitModal>['availableUnits']
}) {
  const now = Date.now()

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between p-4 sm:p-5 pb-0 sm:pb-0 mb-4">
        <h2 className="font-semibold text-gray-900">Portfel lokali</h2>
        <AssignUnitModal clientId={clientId} availableUnits={availableUnits} />
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-400 text-sm px-4 sm:px-5 pb-5">Brak lokali — zarezerwuj pierwszy.</p>
      ) : (
        <>
          {/* Desktop/tablet: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
                  <th className="px-4 py-2.5 text-left font-semibold">Lokal</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Cennik</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Cena zakupu</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Rabat</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Umowa</th>
                  <th className="px-4 py-2.5 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isSoft = r.reservationType === 'MIEKKA'
                  const softExp = r.reservationExpiresAtISO ? new Date(r.reservationExpiresAtISO) : null
                  const softSoon = softExp ? softExp.getTime() - now <= 2 * 86_400_000 : false
                  return (
                    <tr key={r.unitId} className="border-b border-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/units/${r.unitId}`} prefetch={false} className="font-semibold text-gray-900 hover:text-blue-600">
                          {r.number}
                        </Link>
                        <p className="text-xs text-gray-500">{UNIT_TYPE_LABELS[r.unitType as UnitType] ?? r.unitType}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${UNIT_STATUS_COLORS[r.status as UnitStatus]}`}>
                            {UNIT_STATUS_LABELS[r.status as UnitStatus] ?? r.status}
                          </span>
                          {r.reservationType && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${RESERVATION_TYPE_COLORS[r.reservationType as ReservationType]}`}>
                              {RESERVATION_TYPE_LABELS[r.reservationType as ReservationType]}
                            </span>
                          )}
                        </div>
                        {isSoft && softExp && (
                          <p className={`mt-1 text-xs inline-flex items-center gap-1 ${softSoon ? 'text-red-600' : 'text-gray-500'}`}>
                            {softSoon && <Clock className="w-3.5 h-3.5" />}
                            do {formatDate(softExp)}
                          </p>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${r.discount > 0 ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                        {formatCurrency(r.cennik)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                        {r.purchase != null ? formatCurrency(r.purchase) : <span className="text-gray-400 font-normal">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" title="Rabat vs cennik z dnia umowy">
                        {r.discount > 0 ? (
                          <span className="text-green-700">−{formatCurrency(r.discount)} · −{fmtPct(r.discountPct)}%</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.contract ? (
                          <Link href={`/sales/${r.contract.id}`} prefetch={false} className="text-blue-600 hover:text-blue-700 font-medium">
                            {r.contract.number}
                          </Link>
                        ) : isSoft ? (
                          <span className="text-gray-500">Rezerwacja miękka</span>
                        ) : r.assignedAtISO ? (
                          <span className="text-gray-500">Przypisany {formatDate(new Date(r.assignedAtISO))}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {isSoft && <SwapButton unitId={r.unitId} unitNumber={r.number} unitType={r.unitType} />}
                          {r.reservationType !== 'REZERWACJA' && r.assignedAtISO && (
                            <UnassignUnitButton clientId={clientId} unitId={r.unitId} />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold text-gray-900" style={{ background: 'var(--surface-alt)' }}>
                  <td className="px-4 py-3" colSpan={2}>Razem ({rows.length})</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(sums.cennik)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {rows.some((r) => r.purchase != null) ? formatCurrency(sums.purchase) : <span className="text-gray-400 font-normal">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {sums.discount > 0 ? (
                      <span className="text-green-700">−{formatCurrency(sums.discount)} · −{fmtPct(sums.discountPct)}%</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile: karty */}
          <ul className="md:hidden divide-y divide-gray-100">
            {rows.map((r) => {
              const isSoft = r.reservationType === 'MIEKKA'
              return (
                <li key={r.unitId} className="relative px-4 py-3">
                  <Link href={`/units/${r.unitId}`} prefetch={false} className="absolute inset-0" aria-label={r.number} />
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-gray-900 truncate">
                      {r.number}
                      <span className="ml-2 text-xs font-normal text-gray-500">{UNIT_TYPE_LABELS[r.unitType as UnitType] ?? r.unitType}</span>
                    </p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${UNIT_STATUS_COLORS[r.status as UnitStatus]}`}>
                      {UNIT_STATUS_LABELS[r.status as UnitStatus] ?? r.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs flex-wrap">
                    {r.discount > 0 && <span className="line-through text-gray-400 tabular-nums">{formatCurrency(r.cennik)}</span>}
                    <span className="font-medium text-gray-900 tabular-nums">
                      {r.purchase != null ? formatCurrency(r.purchase) : formatCurrency(r.cennik)}
                    </span>
                    {r.discount > 0 && (
                      <span className="px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700 tabular-nums">
                        −{formatCurrency(r.discount)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span className="min-w-0 truncate">
                      {r.contract ? (
                        <Link href={`/sales/${r.contract.id}`} prefetch={false} className="relative text-blue-600 hover:text-blue-700 font-medium">
                          {r.contract.number}
                        </Link>
                      ) : isSoft && r.reservationExpiresAtISO ? (
                        `Rezerwacja miękka do ${formatDate(new Date(r.reservationExpiresAtISO))}`
                      ) : r.assignedAtISO ? (
                        `Przypisany ${formatDate(new Date(r.assignedAtISO))}`
                      ) : null}
                    </span>
                    {/* relative BEZ z-index: pozycjonowany element po overlayu w DOM i tak
                        wygrywa hit-test, a z-10 tworzyłby stacking context więżący
                        modal SwapButton (fixed z-50) pod TopBarem (z-20). */}
                    <span className="relative inline-flex items-center gap-1 flex-shrink-0">
                      {isSoft && <SwapButton unitId={r.unitId} unitNumber={r.number} unitType={r.unitType} />}
                      {r.reservationType !== 'REZERWACJA' && r.assignedAtISO && (
                        <UnassignUnitButton clientId={clientId} unitId={r.unitId} />
                      )}
                    </span>
                  </div>
                </li>
              )
            })}
            <li className="px-4 py-3 flex items-center justify-between text-sm font-semibold text-gray-900" style={{ background: 'var(--surface-alt)' }}>
              <span>Razem ({rows.length})</span>
              {/* Suma tego, co pokazują karty (zakup, a dla lokali bez umowy cennik) —
                  sums.purchase pomija wiersze bez umowy i kłóciłby się z pozycjami. */}
              <span className="tabular-nums">{formatCurrency(rows.reduce((s, r) => s + (r.purchase ?? r.cennik), 0))}</span>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
