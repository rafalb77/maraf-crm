'use client'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { VelocityMonth } from '@/lib/stats'

const fmtPln = (n: number) =>
  n.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 })

export function SalesVelocityChart({ data }: { data: VelocityMonth[] }) {
  const hasRevenue = data.some((d) => d.revenue > 0)

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
        <YAxis
          yAxisId="left"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          width={44}
        />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === 'Umowy' ? [value, name] : [fmtPln(value), name]
          }
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="signed" name="Umowy" fill="#c9a37a" radius={[4, 4, 0, 0]} maxBarSize={36} />
        {hasRevenue && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulativeRevenue"
            name="Przychód skumulowany"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
