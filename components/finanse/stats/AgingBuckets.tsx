'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import type { AgingBuckets as AgingData } from '@/lib/finanse-stats'

export function AgingBuckets({ data }: { data: AgingData }) {
  const chartData = [
    {
      kategoria: 'Należności',
      'W terminie': data.receivables.current,
      '1-30 dni': data.receivables.b0_30,
      '31-60 dni': data.receivables.b31_60,
      '61-90 dni': data.receivables.b61_90,
      '90+ dni': data.receivables.b90plus,
    },
    {
      kategoria: 'Zobowiązania',
      'W terminie': data.payables.current,
      '1-30 dni': data.payables.b0_30,
      '31-60 dni': data.payables.b31_60,
      '61-90 dni': data.payables.b61_90,
      '90+ dni': data.payables.b90plus,
    },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Wiek faktur</h2>
        <p className="text-xs text-gray-500 mt-0.5">Należności od klientów + nasze zobowiązania wg dni po terminie</p>
      </div>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(v) => fmtMoneyShort(v as number)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="kategoria"
              tick={{ fontSize: 12, fill: '#374151', fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              width={100}
            />
            <Tooltip
              cursor={{ fill: '#f9fafb' }}
              content={({ active, payload, label }) => active && payload?.length ? (
                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                  <p className="text-xs font-semibold text-gray-900 mb-1">{label}</p>
                  {payload.map((p, i) => (p.value as number) > 0 && (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-gray-600">{p.name}:</span>
                      <span className="font-medium tabular-nums">{fmtMoney(p.value as number)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            />
            <Bar dataKey="W terminie" stackId="a" fill="#10b981" radius={[4, 0, 0, 4]} />
            <Bar dataKey="1-30 dni" stackId="a" fill="#facc15" />
            <Bar dataKey="31-60 dni" stackId="a" fill="#f59e0b" />
            <Bar dataKey="61-90 dni" stackId="a" fill="#f97316" />
            <Bar dataKey="90+ dni" stackId="a" fill="#dc2626" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-[11px]">
        <Legend color="#10b981" label="W terminie" />
        <Legend color="#facc15" label="1-30 dni" />
        <Legend color="#f59e0b" label="31-60 dni" />
        <Legend color="#f97316" label="61-90 dni" />
        <Legend color="#dc2626" label="90+ dni" />
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-gray-100">
        <div>
          <p className="text-xs text-gray-500">Należności (do nas)</p>
          <p className="text-base font-semibold text-gray-900 tabular-nums">{fmtMoney(data.receivables.total)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Zobowiązania (nasze)</p>
          <p className="text-base font-semibold text-gray-900 tabular-nums">{fmtMoney(data.payables.total)}</p>
        </div>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-gray-600">{label}</span>
    </div>
  )
}
