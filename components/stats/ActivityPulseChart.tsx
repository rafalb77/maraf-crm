'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { ActivityMonth } from '@/lib/stats'

const SERIES: { key: keyof ActivityMonth; name: string; color: string }[] = [
  { key: 'TELEFON', name: 'Telefon', color: '#2563eb' },
  { key: 'EMAIL', name: 'E-mail', color: '#0ea5e9' },
  { key: 'SPOTKANIE', name: 'Spotkanie', color: '#16a34a' },
  { key: 'DOKUMENT', name: 'Dokument', color: '#c9a37a' },
  { key: 'NOTATKA', name: 'Notatka', color: '#94a3b8' },
]

export function ActivityPulseChart({ data }: { data: ActivityMonth[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={32} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {SERIES.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
