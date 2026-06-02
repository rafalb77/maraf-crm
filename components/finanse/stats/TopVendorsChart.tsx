'use client'
import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import type { TopVendorRow } from '@/lib/finanse-stats'

type Mode = 'total' | 'unpaid'

export function TopVendorsChart({ data }: { data: TopVendorRow[] }) {
  const [mode, setMode] = useState<Mode>('total')

  const sorted = [...data].sort((a, b) => (mode === 'total' ? b.total - a.total : b.unpaid - a.unpaid)).slice(0, 10)
  const chartData = sorted.map((v) => ({
    name: v.name.length > 20 ? v.name.slice(0, 18) + '…' : v.name,
    fullName: v.name,
    value: mode === 'total' ? v.total : v.unpaid,
    count: v.count,
  }))

  const colors = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#c026d3', '#db2777', '#e11d48', '#f43f5e', '#f97316', '#f59e0b']

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">TOP 10 kontrahentów</h2>
          <p className="text-xs text-gray-500 mt-0.5">{mode === 'total' ? 'Obrót brutto wszystkich faktur' : 'Niezapłacone zobowiązania'}</p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
          <button
            onClick={() => setMode('total')}
            className={`px-3 py-1.5 ${mode === 'total' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >Obrót</button>
          <button
            onClick={() => setMode('unpaid')}
            className={`px-3 py-1.5 ${mode === 'unpaid' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >Niezapłacone</button>
        </div>
      </div>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
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
              dataKey="name"
              tick={{ fontSize: 11, fill: '#374151' }}
              axisLine={false}
              tickLine={false}
              width={130}
            />
            <Tooltip
              cursor={{ fill: '#f9fafb' }}
              content={({ active, payload }) => active && payload?.[0] ? (
                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                  <p className="text-xs font-semibold text-gray-900">{(payload[0].payload as any).fullName}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {mode === 'total' ? 'Obrót' : 'Niezapłacone'}: <span className="font-medium tabular-nums">{fmtMoney(payload[0].value as number)}</span>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{(payload[0].payload as any).count} faktur</p>
                </div>
              ) : null}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
