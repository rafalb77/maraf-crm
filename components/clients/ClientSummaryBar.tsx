import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import {
  CONTRACT_TYPE_LABELS, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS,
  type ContractType, type ContractStatus,
} from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import type { AttentionFlag, ClientKpi } from '@/lib/client-portfolio'
import { PromoteReservationButton } from './PromoteReservationButton'

function fmtPct(pct: number): string {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(pct)
}

/** Pasek KPI klienta („co i za ile kupił" w 3 sekundy) + warunkowe flagi „Wymaga uwagi". */
export function ClientSummaryBar({
  kpi,
  flags,
  clientId,
  unitCount,
}: {
  kpi: ClientKpi
  flags: AttentionFlag[]
  clientId: string
  unitCount: number
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* text-lg na mobile + overflow-wrap:anywhere: kwoty pl-PL mają niełamliwe
            NBSP i przy grid-cols-2 na 375px wystawałyby poza kafel. */}
        <Kpi label="Wartość zakupów">
          {kpi.purchaseTotal > 0 ? (
            <p className="text-lg sm:text-xl font-bold text-gray-900 tabular-nums [overflow-wrap:anywhere]">{formatCurrency(kpi.purchaseTotal)}</p>
          ) : (
            <p className="text-lg sm:text-xl font-bold text-gray-400">—</p>
          )}
        </Kpi>

        <Kpi label="Rabat łącznie" title="Rabat vs cennik z dnia umowy">
          {kpi.discountTotal > 0 ? (
            <>
              <p className="text-lg sm:text-xl font-bold text-green-700 tabular-nums [overflow-wrap:anywhere]">−{formatCurrency(kpi.discountTotal)}</p>
              <p className="text-xs text-green-700/80 tabular-nums">−{fmtPct(kpi.discountPct)}%</p>
            </>
          ) : (
            <p className="text-lg sm:text-xl font-bold text-gray-400">—</p>
          )}
        </Kpi>

        <Kpi label="Lokale">
          <p className="text-lg sm:text-xl font-bold text-gray-900 tabular-nums">{kpi.unitsCount}</p>
          {kpi.softCount > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              w tym {kpi.softCount} {softPlural(kpi.softCount)}
            </p>
          )}
        </Kpi>

        {kpi.topContract ? (
          <Link href={`/sales/${kpi.topContract.id}`} prefetch={false} className="group">
            <Kpi label="Etap sprzedaży">
              <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 leading-snug">
                {CONTRACT_TYPE_LABELS[kpi.topContract.type as ContractType] ?? kpi.topContract.type}
              </p>
              <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-medium ${CONTRACT_STATUS_COLORS[kpi.topContract.status as ContractStatus]}`}>
                {CONTRACT_STATUS_LABELS[kpi.topContract.status as ContractStatus] ?? kpi.topContract.status}
              </span>
            </Kpi>
          </Link>
        ) : (
          <Kpi label="Etap sprzedaży">
            <p className="text-sm font-bold text-gray-400">Brak umów</p>
          </Kpi>
        )}
      </div>

      {flags.length > 0 && (
        <div className="mt-3 space-y-2">
          {flags.map((f, i) => (
            <div
              key={`${f.kind}-${i}`}
              className={`flex items-center gap-2 flex-wrap rounded-lg border px-3 py-2 text-sm ${
                f.severity === 'overdue'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="min-w-0">
                {f.href ? (
                  <Link href={f.href} prefetch={false} className="hover:underline">
                    {f.text}
                  </Link>
                ) : (
                  f.text
                )}
              </span>
              {f.kind === 'MIEKKA_WYGASA' && (
                <span className="ml-auto flex-shrink-0">
                  <PromoteReservationButton clientId={clientId} unitCount={unitCount} variant="button" />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function softPlural(n: number): string {
  if (n === 1) return 'rezerwacja miękka'
  const d = n % 10
  const h = n % 100
  if (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) return 'rezerwacje miękkie'
  return 'rezerwacji miękkich'
}

function Kpi({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3 rounded-[10px]" style={{ background: 'var(--surface-alt)' }} title={title}>
      <p className="text-[10px] font-semibold uppercase mb-1" style={{ letterSpacing: '.1em', color: 'var(--text-muted)' }}>
        {label}
      </p>
      {children}
    </div>
  )
}
