'use client'
import { useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import type { MonthRow, CashRow } from '@/lib/finanse-stats'

const MONTH_LABELS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']

type Mode = 'operacyjny' | 'gotowkowy'

export function CashflowChart({ data, cashflowGot }: { data: MonthRow[]; cashflowGot: CashRow[] | null }) {
  const [mode, setMode] = useState<Mode>('operacyjny')
  const hasGotowkowy = cashflowGot !== null && cashflowGot.length > 0

  // Wybierz dane wg trybu
  const chartData = mode === 'operacyjny' || !hasGotowkowy
    ? data.map((d) => {
        const [yyyy, mm] = d.m.split('-')
        return {
          label: MONTH_LABELS[parseInt(mm, 10) - 1] + ' \'' + yyyy.slice(2),
          Przychody: d.revenue,
          Koszty: d.costs,
          'Zysk netto': d.net,
        }
      })
    : cashflowGot!.map((d) => {
        const [yyyy, mm] = d.m.split('-')
        return {
          label: MONTH_LABELS[parseInt(mm, 10) - 1] + ' \'' + yyyy.slice(2),
          Przychody: d.salesPaid + d.escrowReleased + d.vatRefunded,
          Koszty: d.costsPaid + d.loanPrincipal + d.loanInterest + d.loanFees,
          'Saldo netto': d.cashNet,
          'Transze kredytu': d.loanDrawn,
          // breakdown do tooltipa
          _salesPaid: d.salesPaid,
          _escrowReleased: d.escrowReleased,
          _vatRefunded: d.vatRefunded,
          _costsPaid: d.costsPaid,
          _loanPrincipal: d.loanPrincipal,
          _loanInterest: d.loanInterest,
          _loanFees: d.loanFees,
        }
      })

  const isGot = mode === 'gotowkowy' && hasGotowkowy

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">Cashflow — 12 miesięcy</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {isGot
              ? 'Tryb gotówkowy: + wpływy z escrow + zwroty VAT, − spłaty rat kredytów'
              : 'Tryb operacyjny: tylko faktury sprzedażowe i kosztowe (P&L)'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {hasGotowkowy && (
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
              <button
                onClick={() => setMode('operacyjny')}
                className={`px-3 py-1.5 ${mode === 'operacyjny' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >Operacyjny</button>
              <button
                onClick={() => setMode('gotowkowy')}
                className={`px-3 py-1.5 ${mode === 'gotowkowy' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >Gotówkowy</button>
            </div>
          )}
          <div className="flex items-center gap-3 text-xs">
            <LegendDot color="#10b981" label="Przychody" />
            <LegendDot color="#f43f5e" label="Koszty" />
            <LegendDot color="#3b82f6" label={isGot ? 'Saldo netto' : 'Zysk netto'} />
            {isGot && <LegendDot color="#8b5cf6" label="Transze kredytu" dashed />}
          </div>
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
                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm max-w-xs">
                  <p className="text-xs font-semibold text-gray-900 mb-1">{label}</p>
                  {payload.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-gray-600">{p.name}:</span>
                      <span className="font-medium tabular-nums">{fmtMoney(p.value as number)}</span>
                    </div>
                  ))}
                  {isGot && payload[0]?.payload && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-500 space-y-0.5">
                      <div>FV sprzedaży: <strong className="tabular-nums">{fmtMoney(payload[0].payload._salesPaid)}</strong></div>
                      <div>Escrow uwolnione: <strong className="tabular-nums">{fmtMoney(payload[0].payload._escrowReleased)}</strong></div>
                      <div>Zwroty VAT: <strong className="tabular-nums">{fmtMoney(payload[0].payload._vatRefunded)}</strong></div>
                      <div>FV kosztowe: <strong className="tabular-nums">{fmtMoney(payload[0].payload._costsPaid)}</strong></div>
                      <div>Raty K/O/P: <strong className="tabular-nums">{fmtMoney(payload[0].payload._loanPrincipal + payload[0].payload._loanInterest + payload[0].payload._loanFees)}</strong></div>
                    </div>
                  )}
                </div>
              ) : null}
            />
            <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="2 2" />
            <Bar dataKey="Przychody" fill="#10b981" radius={[4, 4, 0, 0]} barSize={18} />
            <Bar dataKey="Koszty" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={18} />
            <Line type="monotone" dataKey={isGot ? 'Saldo netto' : 'Zysk netto'} stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: '#3b82f6' }} />
            {isGot && (
              <Line type="monotone" dataKey="Transze kredytu" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-2.5 h-2.5"
        style={{
          backgroundColor: dashed ? 'transparent' : color,
          borderTop: dashed ? `2px dashed ${color}` : 'none',
          borderRadius: dashed ? 0 : 2,
          marginTop: dashed ? 3 : 0,
        }}
      />
      <span className="text-gray-600">{label}</span>
    </div>
  )
}
