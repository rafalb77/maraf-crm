'use client'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { fmtMoney } from '@/lib/finanse-format'
import type { RiskData } from '@/lib/finanse-stats'

const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#c026d3', '#db2777', '#94a3b8']

export function RiskConcentration({ data }: { data: RiskData }) {
  const warningStyle = {
    safe: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'Niskie ryzyko' },
    moderate: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', label: 'Średnie ryzyko' },
    high: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', label: 'Wysokie ryzyko' },
  }[data.warningLevel]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Koncentracja ryzyka</h2>
        <p className="text-xs text-gray-500 mt-0.5">Udział TOP 3 kontrahentów w łącznym obrocie kosztowym</p>
      </div>

      {data.segments.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Brak danych kosztowych.</p>
      ) : (
        <>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="relative w-48 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.segments}
                    dataKey="value"
                    cx="50%" cy="50%"
                    innerRadius={50}
                    outerRadius={88}
                    paddingAngle={1.5}
                    stroke="none"
                  >
                    {data.segments.map((_, i) => (
                      <Cell key={i} fill={i < 6 ? COLORS[i] : COLORS[6]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => active && payload?.[0] ? (
                      <div className="bg-white border border-gray-200 rounded px-2 py-1 text-xs shadow-sm">
                        <p className="font-medium text-gray-900">{(payload[0].payload as any).name}</p>
                        <p className="tabular-nums">{fmtMoney(payload[0].value as number)}</p>
                      </div>
                    ) : null}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{data.top3Pct}%</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">TOP 3</p>
              </div>
            </div>
            <div className="flex-1 min-w-[180px]">
              <div className="space-y-1.5">
                {data.segments.slice(0, 6).map((s, i) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[i] }} />
                    <span className="text-gray-700 flex-1 truncate" title={s.name}>{s.name}</span>
                    <span className="text-gray-500 tabular-nums">{fmtMoney(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${warningStyle.bg} border ${warningStyle.border} rounded-lg p-3 mt-4`}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <p className={`text-sm font-semibold ${warningStyle.text}`}>
                {data.warningLevel === 'high' ? '⚠ ' : data.warningLevel === 'moderate' ? '⚠ ' : '✓ '}
                {warningStyle.label}
              </p>
              <p className={`text-xs ${warningStyle.text}`}>
                TOP 3: <strong>{data.top3Names.slice(0, 3).join(', ')}</strong>
              </p>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {data.warningLevel === 'high'
                ? `Powyżej 70% kosztów u 3 kontrahentów — uzależnienie. Warto dywersyfikować.`
                : data.warningLevel === 'moderate'
                ? 'Połowa kosztów u 3 kontrahentów. Obserwuj — przy wzroście do >70% rozważ dywersyfikację.'
                : 'Koszty rozproszone na wielu kontrahentów. Dobre.'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
