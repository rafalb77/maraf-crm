import Link from 'next/link'
import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import type { TimelineBucket } from '@/lib/finanse-stats'

// Os nadchodzacych platnosci — zalegle + 6 tygodni + pozniej.
// Kolka na osi czasu: POWIERZCHNIA proporcjonalna do kwoty (r ~ sqrt),
// zalegle pulsuja na czerwono. Server component, czysty SVG-like markup.
export function UpcomingTimeline({ buckets }: { buckets: TimelineBucket[] }) {
  const maxSum = Math.max(1, ...buckets.map((b) => b.sum))
  const total = buckets.reduce((s, b) => s + b.sum, 0)
  if (total < 0.01) return null

  const size = (sum: number) => (sum > 0 ? 18 + 38 * Math.sqrt(sum / maxSum) : 10)

  return (
    <Link
      href="/finanse/kolejka-platnosci"
      className="block bg-white rounded-xl border border-gray-200 hover:border-gray-300 p-6 transition-colors"
    >
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-semibold text-gray-900">Oś nadchodzących płatności</h2>
        <span className="text-xs text-gray-400">do zapłaty (po potrąceniach) wg terminu • kliknij → kolejka płatności</span>
      </div>

      <div className="relative mt-2">
        {/* linia bazowa */}
        <div className="absolute left-0 right-0 top-[46px] h-px bg-gray-200" />
        <div className="grid" style={{ gridTemplateColumns: `repeat(${buckets.length}, 1fr)` }}>
          {buckets.map((b) => {
            const d = size(b.sum)
            const isOverdue = b.key === 'overdue'
            const isLater = b.key === 'later'
            const weekIdx = b.key.startsWith('w') ? parseInt(b.key.slice(1), 10) : -1
            const color = isOverdue
              ? '#ef4444'
              : isLater
                ? '#d1d5db'
                : 'var(--accent)'
            const opacity = weekIdx >= 3 ? 0.45 : 1
            return (
              <div key={b.key} className="flex flex-col items-center">
                {/* strefa kolka — stala wysokosc, kolko wysrodkowane na linii */}
                <div className="h-[92px] flex items-center justify-center relative">
                  {isOverdue && b.sum > 0 && (
                    <span
                      className="absolute rounded-full animate-ping"
                      style={{ width: d + 10, height: d + 10, background: '#ef4444', opacity: 0.25 }}
                    />
                  )}
                  <span
                    className="rounded-full flex items-center justify-center"
                    style={{ width: d, height: d, background: color, opacity: b.sum > 0 ? opacity : 0.25, transition: 'all .3s ease' }}
                    title={`${b.label}: ${fmtMoney(b.sum)} (${b.count} FV)`}
                  />
                </div>
                <p className={`text-[11px] leading-tight text-center ${isOverdue && b.sum > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                  {b.label}
                </p>
                <p className={`text-xs tabular-nums text-center font-semibold ${b.sum > 0 ? (isOverdue ? 'text-red-600' : 'text-gray-900') : 'text-gray-300'}`}>
                  {b.sum > 0 ? fmtMoneyShort(b.sum) : '—'}
                </p>
                <p className="text-[10px] text-gray-400 text-center">{b.count > 0 ? `${b.count} FV` : ''}</p>
              </div>
            )
          })}
        </div>
      </div>
    </Link>
  )
}
