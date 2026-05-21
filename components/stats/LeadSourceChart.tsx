'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import type { LeadSourceRow } from '@/lib/stats'

export function LeadSourceChart({ data }: { data: LeadSourceRow[] }) {
  // Wysokość zależna od liczby źródeł (każdy wiersz ~38px).
  const height = Math.max(160, data.length * 42 + 40)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
        barCategoryGap={12}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
        <YAxis
          type="category"
          dataKey="source"
          width={110}
          tick={{ fontSize: 12, fill: '#374151' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.03)' }}
          formatter={(value: number, name: string) => [value, name]}
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="total" name="Leady" fill="#dbe4f0" radius={[0, 4, 4, 0]} maxBarSize={22} />
        <Bar dataKey="converted" name="Umowy" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.conversion >= 0.15 ? '#16a34a' : d.conversion > 0 ? '#c9a37a' : '#e5e7eb'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
