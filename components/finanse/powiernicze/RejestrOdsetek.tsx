'use client'
import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { fmtMoney } from '@/lib/finanse-format'

type Slice = { from: string; to: string; days: number; ratePct: number; amount: number }
type Row = {
  id: string; contractId: string; contractNumber: string; buyerName: string | null; paymentTitle: string | null
  principal: number; dueDate: string; paidDate: string; daysLate: number; type: string
  ratePct: number | null; amount: number; status: string; breakdown: Slice[] | null
}
type Data = { rows: Row[]; currentRate: number | null; summary: { count: number; totalNaliczone: number; total: number } }

const STATUS_LABELS: Record<string, string> = { NALICZONE: 'naliczone', UMORZONE: 'umorzone', ZAPLACONE: 'zapłacone' }

export function RejestrOdsetek({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  function load() {
    fetch('/api/finanse/powiernicze/interest').then((r) => r.json()).then(setData).catch(() => {})
  }
  useEffect(() => { load() }, [refreshKey])

  async function setStatus(id: string, status: string) {
    if (status === 'UMORZONE' && !confirm('Umorzyć naliczone odsetki? Pozycja pozostanie w rejestrze ze statusem „umorzone”.')) return
    setBusy(id)
    try {
      const r = await fetch(`/api/finanse/powiernicze/interest/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (r.ok) { load(); onChanged() }
    } finally { setBusy(null) }
  }

  if (!data) return <div className="text-sm text-gray-400 py-8 text-center">Ładowanie…</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Pozycji" value={String(data.summary.count)} />
        <Tile label="Naliczone" value={fmtMoney(data.summary.totalNaliczone)} tone="amber" />
        <Tile label="Razem (z umorz.)" value={fmtMoney(data.summary.total)} />
        <Tile label="Stawka dziś" value={data.currentRate != null ? `${data.currentRate}%` : '—'} sub="ustawowe za opóźnienie" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-2 px-3">Umowa</th>
                <th className="py-2 px-3">Nabywca</th>
                <th className="py-2 px-3 text-right">Kwota raty</th>
                <th className="py-2 px-3">Termin</th>
                <th className="py-2 px-3">Zapłata</th>
                <th className="py-2 px-3 text-right">Dni</th>
                <th className="py-2 px-3 text-right">Odsetki</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.rows.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-gray-400">Brak naliczonych odsetek — wszystkie wpłaty w terminie.</td></tr>
              )}
              {data.rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className={r.status === 'UMORZONE' ? 'opacity-50' : ''}>
                    <td className="py-2 px-3">
                      <Link href={`/sales/${r.contractId}`} className="text-blue-600 hover:underline font-medium">{r.contractNumber}</Link>
                      {r.paymentTitle ? <div className="text-xs text-gray-500">{r.paymentTitle}</div> : null}
                    </td>
                    <td className="py-2 px-3">{r.buyerName || '—'}</td>
                    <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">{fmtMoney(r.principal)}</td>
                    <td className="py-2 px-3 tabular-nums whitespace-nowrap">{r.dueDate}</td>
                    <td className="py-2 px-3 tabular-nums whitespace-nowrap">{r.paidDate}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{r.daysLate}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium text-amber-700 whitespace-nowrap">{fmtMoney(r.amount)}</td>
                    <td className="py-2 px-3"><span className={`text-xs rounded px-1.5 py-0.5 ${r.status === 'NALICZONE' ? 'bg-amber-100 text-amber-800' : r.status === 'UMORZONE' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-800'}`}>{STATUS_LABELS[r.status] || r.status}</span></td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center gap-2 justify-end">
                        {r.breakdown && r.breakdown.length > 1 && (
                          <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="text-xs text-gray-500 hover:text-gray-700">
                            {expanded === r.id ? 'ukryj' : `${r.breakdown.length} okr.`}
                          </button>
                        )}
                        {r.status === 'NALICZONE' && (
                          <button onClick={() => setStatus(r.id, 'UMORZONE')} disabled={busy === r.id} className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50">Umórz</button>
                        )}
                        {r.status === 'UMORZONE' && (
                          <button onClick={() => setStatus(r.id, 'NALICZONE')} disabled={busy === r.id} className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50">Przywróć</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === r.id && r.breakdown && (
                    <tr className="bg-gray-50">
                      <td colSpan={9} className="py-2 px-3">
                        <div className="text-xs text-gray-600">
                          <span className="font-semibold">Rozbicie na okresy stawek:</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {r.breakdown.map((s, i) => (
                              <span key={i} className="bg-white border border-gray-200 rounded px-2 py-1 tabular-nums">
                                {s.from}–{s.to}: {s.days} dni × {s.ratePct}% = {fmtMoney(s.amount)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Odsetki ustawowe za opóźnienie liczone metodą okresową (art. 481 KC, stopa referencyjna NBP + 5,5 p.p.),
        z rozbiciem na zmiany stawki w czasie. Stawki weryfikuj z obwieszczeniami Ministra Sprawiedliwości.
      </p>
    </div>
  )
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'amber' }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <div className="text-xs text-gray-500 uppercase font-semibold tracking-wide">{label}</div>
      <div className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">{value}</div>
      {sub ? <div className="text-xs text-gray-400">{sub}</div> : null}
    </div>
  )
}
