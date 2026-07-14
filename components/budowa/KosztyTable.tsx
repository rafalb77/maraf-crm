'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'

/**
 * Tabela kosztów budowy z filtrami (moduł Budowa, Etap 3) — most z Finansów.
 * Filtry: etap / wykonawca / status płatności / zakres dat. Sumy przy filtrze.
 * Eksport xlsx przez /api/budowa/koszty/export (z aktualnymi filtrami). Dane READ —
 * edycja przypisań w szczegółach faktury (Finanse) lub inboxie powyżej.
 */

export type KosztInvoice = {
  id: string
  number: string
  company: string
  vendorName: string
  subVendor: string | null
  status: string
  issueDate: string // yyyy-mm-dd
  dueDate: string | null
  amountNet: number
  amountGross: number
  remaining: number
  overdue: boolean
  stageId: string | null
  stageName: string | null
}

const COMPANY_SHORT: Record<string, string> = { MARAF: 'Maraf', MARAF_DEVELOPMENT: 'MD' }

function fmt(n: number): string {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const PAY_FILTERS = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'unpaid', label: 'Niezapłacone' },
  { key: 'overdue', label: 'Po terminie' },
  { key: 'paid', label: 'Zapłacone' },
] as const
type PayFilter = (typeof PAY_FILTERS)[number]['key']

export function KosztyTable({
  invoices,
  stages,
  vendors,
}: {
  invoices: KosztInvoice[]
  stages: { id: string; name: string }[]
  vendors: string[]
}) {
  const [stage, setStage] = useState('')
  const [vendor, setVendor] = useState('')
  const [pay, setPay] = useState<PayFilter>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (stage && (stage === '_none' ? i.stageId : i.stageId !== stage)) return false
      if (vendor && i.vendorName !== vendor) return false
      if (pay === 'unpaid' && i.remaining <= 0.01) return false
      if (pay === 'overdue' && !i.overdue) return false
      if (pay === 'paid' && i.remaining > 0.01) return false
      if (from && i.issueDate < from) return false
      if (to && i.issueDate > to) return false
      return true
    })
  }, [invoices, stage, vendor, pay, from, to])

  const sums = useMemo(() => {
    return filtered.reduce(
      (a, i) => ({
        net: a.net + i.amountNet,
        gross: a.gross + i.amountGross,
        remaining: a.remaining + Math.max(0, i.remaining),
      }),
      { net: 0, gross: 0, remaining: 0 },
    )
  }, [filtered])

  const exportUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (stage) p.set('stage', stage)
    if (vendor) p.set('vendor', vendor)
    if (pay !== 'all') p.set('pay', pay)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return `/api/budowa/koszty/export?${p.toString()}`
  }, [stage, vendor, pay, from, to])

  const sel = 'rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <h2 className="font-semibold text-gray-900 mr-auto">Faktury przypisane do budowy</h2>
        <a
          href={exportUrl}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
        >
          ⭳ Eksport xlsx
        </a>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Etap
          <select className={sel} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">wszystkie etapy</option>
            <option value="_none">bez etapu</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Wykonawca
          <select className={sel} value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">wszyscy</option>
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Płatność
          <select className={sel} value={pay} onChange={(e) => setPay(e.target.value as PayFilter)}>
            {PAY_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Od
          <input type="date" className={sel} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Do
          <input type="date" className={sel} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Brak faktur dla wybranych filtrów.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase tracking-wider">
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium">FV</th>
                <th className="text-left py-2 font-medium">Wykonawca</th>
                <th className="text-left py-2 font-medium">Etap</th>
                <th className="text-left py-2 font-medium">Termin</th>
                <th className="text-right py-2 font-medium">Netto</th>
                <th className="text-right py-2 font-medium">Do zapłaty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className={`border-b border-gray-100 ${i.overdue ? 'bg-red-50/40' : ''}`}>
                  <td className="py-2">
                    <Link href={`/finanse/faktury/${i.id}`} className="text-blue-600 hover:underline">
                      {i.number}
                    </Link>
                    <span className="ml-1 text-[10px] text-gray-400">{COMPANY_SHORT[i.company] || i.company}</span>
                  </td>
                  <td className="py-2 text-gray-700">
                    {i.vendorName}
                    {i.subVendor && <span className="text-gray-400"> / {i.subVendor}</span>}
                  </td>
                  <td className="py-2 text-gray-600">{i.stageName || <span className="text-amber-600">— brak —</span>}</td>
                  <td className={`py-2 ${i.overdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                    {fmtDate(i.dueDate)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{fmt(i.amountNet)}</td>
                  <td className={`py-2 text-right tabular-nums ${i.remaining > 0.01 ? 'text-red-700 font-medium' : 'text-gray-400'}`}>
                    {i.remaining > 0.01 ? fmt(i.remaining) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-semibold">
                <td className="py-2" colSpan={4}>
                  Razem ({filtered.length})
                </td>
                <td className="py-2 text-right tabular-nums">{fmt(sums.net)}</td>
                <td className="py-2 text-right tabular-nums text-red-700">{fmt(sums.remaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
