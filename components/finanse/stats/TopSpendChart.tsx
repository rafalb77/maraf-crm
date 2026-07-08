'use client'
import Link from 'next/link'
import { useState } from 'react'
import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import type { TopSpendData, TopSpendRow } from '@/lib/finanse-stats'

type Period = 'ytd' | 'm12' | 'all'
const PERIOD_LABELS: Record<Period, string> = { ytd: 'Ten rok', m12: '12 mies.', all: 'Całość' }

// TOP 10 wydatkow wg faktycznego wykonawcy (subVendor || vendor).
// Pasek dwuwarstwowy: pelny kolor = zaplacone, kreskowany = pozostalo do zaplaty.
export function TopSpendChart({ data }: { data: TopSpendData }) {
  const [period, setPeriod] = useState<Period>('ytd')
  const rows: TopSpendRow[] = data[period]
  const max = rows[0]?.total || 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">Największe wydatki wg wykonawcy</h2>
          <p className="text-xs text-gray-500 mt-0.5">TOP 10 • brutto wszystkich faktur • pełny kolor = zapłacone, kreskowane = do zapłaty</p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 ${period === p ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">Brak faktur w tym okresie.</p>}

      <div className="space-y-3">
        {rows.map((r) => {
          const barPct = (r.total / max) * 100
          const paidPct = r.total > 0 ? Math.min(100, (r.paid / r.total) * 100) : 0
          return (
            <div key={r.name} className="group">
              <div className="flex items-baseline justify-between mb-1 gap-2">
                <Link
                  href={`/finanse/faktury?q=${encodeURIComponent(r.name)}`}
                  className="text-sm font-medium text-gray-900 hover:text-amber-600 truncate"
                  title={`${r.name} — ${r.count} faktur, ${fmtMoney(r.total)} (zapłacone ${fmtMoney(r.paid)}${r.remaining > 0.01 ? `, do zapłaty ${fmtMoney(r.remaining)}` : ''})`}
                >
                  {r.name}
                </Link>
                <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                  {fmtMoneyShort(r.total)}
                  <span className="text-xs text-gray-400 font-normal ml-1.5">{r.pct}%</span>
                </span>
              </div>
              <div className="bg-gray-100 rounded-full overflow-hidden h-2.5 relative">
                {/* warstwa "pozostalo" — kreskowana, na calej szerokosci paska */}
                <div
                  className="h-full rounded-full absolute inset-y-0 left-0"
                  style={{
                    width: `${barPct}%`,
                    background: 'repeating-linear-gradient(45deg, var(--accent), var(--accent) 3px, transparent 3px, transparent 7px)',
                    opacity: 0.45,
                    transition: 'width .6s ease',
                  }}
                />
                {/* warstwa "zaplacone" — pelny kolor, proporcjonalnie */}
                <div
                  className="h-full rounded-full absolute inset-y-0 left-0"
                  style={{
                    width: `${(barPct * paidPct) / 100}%`,
                    background: 'var(--accent)',
                    transition: 'width .6s ease',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
