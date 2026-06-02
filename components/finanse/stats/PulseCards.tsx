'use client'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import type { PulseData } from '@/lib/finanse-stats'

type AccentColor = 'green' | 'red' | 'blue' | 'amber'

const ACCENTS: Record<AccentColor, { bg: string; border: string; text: string; stroke: string }> = {
  green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', stroke: '#10b981' },
  red:   { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    stroke: '#f43f5e' },
  blue:  { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    stroke: '#3b82f6' },
  amber: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   stroke: '#f59e0b' },
}

export function PulseCards({ data }: { data: PulseData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        title="Przychód MTD"
        value={data.revenue.current}
        delta={data.revenue.deltaPct}
        sparkline={data.revenue.sparkline}
        accent="green"
      />
      <Card
        title="Koszty MTD"
        value={data.costs.current}
        delta={data.costs.deltaPct}
        deltaInverted
        sparkline={data.costs.sparkline}
        accent="red"
      />
      <Card
        title="Cashflow netto"
        value={data.cashflow.current}
        delta={data.cashflow.deltaPct}
        sparkline={data.cashflow.sparkline}
        accent={data.cashflow.current >= 0 ? 'blue' : 'amber'}
      />
      <LiquidityCard liquidity={data.liquidity} />
    </div>
  )
}

function Card({
  title, value, delta, deltaInverted, sparkline, accent,
}: {
  title: string
  value: number
  delta: number | null
  deltaInverted?: boolean  // dla kosztów: wzrost = zły (czerwony)
  sparkline: { d: string; v: number }[]
  accent: AccentColor
}) {
  const c = ACCENTS[accent]
  const deltaPositive = delta != null && (deltaInverted ? delta < 0 : delta > 0)
  const deltaNegative = delta != null && (deltaInverted ? delta > 0 : delta < 0)
  const deltaColor = deltaPositive ? 'text-emerald-600' : deltaNegative ? 'text-rose-600' : 'text-gray-400'
  const deltaArrow = delta == null ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→'

  return (
    <div className={`bg-white rounded-xl border ${c.border} p-5 hover:shadow-sm transition-shadow`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{title}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${c.text}`}>{fmtMoney(value)}</p>
      <div className="flex items-baseline justify-between mt-1">
        <span className={`text-xs font-medium ${deltaColor}`}>
          {delta != null ? `${deltaArrow} ${Math.abs(delta)}%` : '—'} <span className="text-gray-400">vs mc-1</span>
        </span>
      </div>
      <div className="h-12 mt-3 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkline}>
            <Tooltip
              content={({ active, payload, label }) => active && payload?.[0] ? (
                <div className="bg-white border border-gray-200 rounded px-2 py-1 text-xs shadow-sm">
                  <p className="text-gray-500">{label}</p>
                  <p className="font-medium tabular-nums">{fmtMoneyShort(payload[0].value as number)}</p>
                </div>
              ) : null}
            />
            <Line type="monotone" dataKey="v" stroke={c.stroke} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-gray-400 mt-1">30 dni wstecz</p>
    </div>
  )
}

function LiquidityCard({ liquidity }: { liquidity: PulseData['liquidity'] }) {
  const colorMap = {
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
    red:   { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  }
  const c = colorMap[liquidity.color]
  // Donut: ratio jako % (max 200% = pełne kółko)
  const pct = Math.min(100, Math.round(liquidity.ratio * 50)) // ratio 1.0 = 50%, 2.0 = 100%
  const circumference = 2 * Math.PI * 28
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className={`bg-white rounded-xl border ${c.border} p-5 hover:shadow-sm transition-shadow flex items-center gap-4`}>
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg width="80" height="80" className="-rotate-90">
          <circle cx="40" cy="40" r="28" fill="none" stroke="#f3f4f6" strokeWidth="6" />
          <circle
            cx="40" cy="40" r="28"
            fill="none"
            stroke={liquidity.color === 'green' ? '#10b981' : liquidity.color === 'amber' ? '#f59e0b' : '#f43f5e'}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className={`absolute text-lg font-bold ${c.text}`}>{Math.round(liquidity.ratio * 100) / 100}</span>
      </div>
      <div className="flex-1">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Płynność</p>
        <p className={`text-base font-semibold mt-1 ${c.text}`}>{liquidity.label}</p>
        <div className="flex items-center gap-1.5 mt-2">
          <span className={`inline-block w-2 h-2 rounded-full ${c.dot}`} />
          <p className="text-xs text-gray-500">należności ÷ zobowiązania</p>
        </div>
      </div>
    </div>
  )
}
