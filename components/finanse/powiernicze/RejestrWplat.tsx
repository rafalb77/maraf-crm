'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fmtMoney } from '@/lib/finanse-format'

type Row = {
  id: string; date: string; amount: number; buyerName: string | null; contractNumber: string | null
  unitNumber: string | null; accountName: string; source: string; contractId: string | null
  paymentTitle: string | null; plannedAmount: number | null; plannedDate: string | null; delta: number | null
  interest: { amount: number; daysLate: number; status: string } | null
}
type Data = { rows: Row[]; summary: { count: number; total: number; bySource: Record<string, number> } }

const SOURCE_LABELS: Record<string, string> = { BANK: 'wyciąg ING', SALES: 'harmonogram', MANUAL: 'ręcznie' }

export function RejestrWplat({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/finanse/powiernicze/register').then((r) => r.json()).then((d) => { if (alive) setData(d) }).catch(() => {})
    return () => { alive = false }
  }, [refreshKey])

  if (!data) return <div className="text-sm text-gray-400 py-8 text-center">Ładowanie…</div>

  function exportCsv() {
    const head = ['Data', 'Nabywca', 'Umowa', 'Lokal', 'Kwota', 'Planowana', 'Różnica', 'Źródło', 'Odsetki', 'Rachunek']
    const lines = data!.rows.map((r) => [
      r.date, r.buyerName || '', r.contractNumber || '', r.unitNumber || '',
      money(r.amount), r.plannedAmount != null ? money(r.plannedAmount) : '', r.delta != null ? money(r.delta) : '',
      SOURCE_LABELS[r.source] || r.source, r.interest ? money(r.interest.amount) : '', r.accountName,
    ].map(csvCell).join(';'))
    downloadCsv(['﻿' + head.join(';'), ...lines].join('\r\n'), 'rejestr-wplat.csv')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Tile label="Wpłat" value={String(data.summary.count)} />
          <Tile label="Suma" value={fmtMoney(data.summary.total)} />
          <Tile label="Z wyciągu ING" value={fmtMoney(data.summary.bySource.BANK || 0)} />
        </div>
        <button onClick={exportCsv} disabled={data.rows.length === 0}
          className="text-sm border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-1.5 disabled:opacity-50">
          Eksport CSV
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] lg:min-w-0 text-sm">
            <thead className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-2 px-3">Data</th>
                <th className="py-2 px-3">Nabywca</th>
                <th className="py-2 px-3">Umowa / rata</th>
                <th className="py-2 px-3">Lokal</th>
                <th className="py-2 px-3 text-right">Kwota</th>
                <th className="py-2 px-3 text-right">Różnica</th>
                <th className="py-2 px-3">Źródło</th>
                <th className="py-2 px-3 text-right">Odsetki</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.rows.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-gray-400">Brak zaksięgowanych wpłat.</td></tr>
              )}
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 px-3 tabular-nums whitespace-nowrap">{r.date}</td>
                  <td className="py-2 px-3">{r.buyerName || '—'}</td>
                  <td className="py-2 px-3">
                    {r.contractId ? (
                      <Link href={`/sales/${r.contractId}`} className="text-blue-600 hover:underline font-medium">{r.contractNumber}</Link>
                    ) : <span className="font-medium">{r.contractNumber || '—'}</span>}
                    {r.paymentTitle ? <span className="text-gray-500"> — {r.paymentTitle}</span> : null}
                  </td>
                  <td className="py-2 px-3">{r.unitNumber || '—'}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-medium whitespace-nowrap">{fmtMoney(r.amount)}</td>
                  <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                    {r.delta == null ? '—' : (
                      <span className={r.delta < 0 ? 'text-rose-600' : r.delta > 0 ? 'text-amber-600' : 'text-gray-400'}>
                        {r.delta > 0 ? '+' : ''}{fmtMoney(r.delta)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3"><span className="text-xs bg-gray-100 text-gray-700 rounded px-1.5 py-0.5">{SOURCE_LABELS[r.source] || r.source}</span></td>
                  <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                    {r.interest ? <span className="text-amber-700" title={`${r.interest.daysLate} dni po terminie`}>{fmtMoney(r.interest.amount)}</span> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500 uppercase font-semibold tracking-wide">{label}</div>
      <div className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

function money(n: number): string {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function csvCell(s: string): string {
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function downloadCsv(content: string, name: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}
