'use client'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import type { MonthRow } from '@/lib/finanse-stats'

const MONTH_LABELS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']

export function CashflowChart({ data }: { data: MonthRow[] }) {
  const chartData = data.map((d) => {
    const [yyyy, mm] = d.m.split('-')
    return {
      label: MONTH_LABELS[parseInt(mm, 10) - 1] + ' \'' + yyyy.slice(2),
      Przychody: d.revenue,
      Koszty: d.costs,
      'Zysk netto': d.net,
    }
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">Cashflow — 12 miesięcy</h2>
          <p className="text-xs text-gray-500 mt-0.5">Słupki: przychody i koszty per miesiąc • Linia: zysk netto</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <LegendDot color="#10b981" label="Przychody" />
          <LegendDot color="#f43f5e" label="Koszty" />
          <LegendDot color="#3b82f6" label="Zysk netto" />
        </div>
      </div>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(v) => fmtMoneyShort(v as number)}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip
              cursor={{ fill: '#f9fafb' }}
              content={({ active, payload, label }) => active && payload?.length ? (
                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                  <p className="text-xs font-semibold text-gray-900 mb-1">{label}</p>
                  {payload.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-gray-600">{p.name}:</span>
                      <span className="font-medium tabular-nums">{fmtMoney(p.value as number)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            />
            <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="2 2" />
            <Bar dataKey="Przychody" fill="#10b981" radius={[4, 4, 0, 0]} barSize={18} />
            <Bar dataKey="Koszty" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={18} />
            <Line type="monotone" dataKey="Zysk netto" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: '#3b82f6' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-gray-600">{label}</span>
    </div>
  )
}
