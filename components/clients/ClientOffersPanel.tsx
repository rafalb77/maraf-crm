import Link from 'next/link'
import { OFFER_STATUS_LABELS, OFFER_STATUS_COLORS, type OfferStatus } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'

export type ClientOfferRow = {
  id: string
  number: string | null
  title: string | null
  status: string
  createdAtISO: string
  validUntilISO: string | null
  totalGross: number
  totalDiscountGross: number
  itemLabels: string[]
}

/**
 * Oferty klienta na jego karcie — pełen lejek przed umową: co zaproponowano,
 * za ile, z jakim rabatem i co klient zaakceptował. Zaakceptowana oferta bez
 * umowy = następny krok (konwersja na karcie oferty w module Oferty).
 */
export function ClientOffersPanel({ offers, hasContracts }: { offers: ClientOfferRow[]; hasContracts: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Oferty</h2>
        <Link href="/oferty/nowa" prefetch={false} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
          + Nowa
        </Link>
      </div>

      {offers.length === 0 ? (
        <p className="text-gray-400 text-sm">Brak ofert</p>
      ) : (
        <div className="space-y-2">
          {offers.map((o) => {
            const accepted = o.status === 'ZAAKCEPTOWANA'
            const validUntil = o.validUntilISO ? new Date(o.validUntilISO) : null
            return (
              <Link
                key={o.id}
                href={`/oferty/${o.id}`}
                prefetch={false}
                className={`block px-3.5 py-3 rounded-[10px] border transition-colors hover:border-blue-300 ${
                  accepted ? 'border-green-200 bg-green-50' : 'border-gray-100'
                }`}
                style={accepted ? undefined : { background: 'var(--surface-alt)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {o.number || o.title || 'Oferta'}
                      <span className="ml-2 text-xs font-normal text-gray-500">{formatDate(new Date(o.createdAtISO))}</span>
                    </p>
                    {o.itemLabels.length > 0 && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{o.itemLabels.join(' · ')}</p>
                    )}
                  </div>
                  <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${OFFER_STATUS_COLORS[o.status as OfferStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                    {OFFER_STATUS_LABELS[o.status as OfferStatus] ?? o.status}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-xs">
                  <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(o.totalGross)}</span>
                  {o.totalDiscountGross > 0 && (
                    <span className="text-green-700 tabular-nums">rabat −{formatCurrency(o.totalDiscountGross)}</span>
                  )}
                  {validUntil && !accepted && o.status === 'WYSLANA' && (
                    <span className="text-gray-500">ważna do {formatDate(validUntil)}</span>
                  )}
                  {accepted && !hasContracts && (
                    <span className="font-medium text-green-700">→ gotowa do przekształcenia w umowę</span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
