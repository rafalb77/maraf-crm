'use client'
import { useCallback, useEffect, useState } from 'react'
import { fmtMoney } from '@/lib/finanse-format'
import type { EscrowAccountLite } from './PowiernniczeView'

type StatementLite = {
  id: string; format: string; fileName: string; periodFrom: string | null; periodTo: string | null
  txCount: number; matchedCount: number; escrowAccount: { id: string; name: string } | null; createdAt: string
}
type Tx = {
  id: string; bookingDate: string; side: string; amount: number
  counterpartyName: string | null; title: string | null; bankRef: string | null
  matchStatus: string; matchScore: number | null; matchReason: string | null; booked: boolean
  payment: { id: string; title: string | null; plannedAmount: number; plannedDate: string | null; status: string } | null
  contract: { id: string; number: string } | null
}
type Detail = {
  id: string; escrowAccount: { id: string; name: string } | null
  transactions: Tx[]
}

export function DopasowaniePanel({
  accounts, refreshKey, onChanged,
}: {
  accounts: EscrowAccountLite[]; refreshKey: number; onChanged: () => void
}) {
  const [statements, setStatements] = useState<StatementLite[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadStatements = useCallback(() => {
    fetch('/api/finanse/powiernicze/statements')
      .then((r) => r.json())
      .then((d: StatementLite[]) => {
        setStatements(d)
        setSelectedId((cur) => cur || (d[0]?.id ?? null))
      })
      .catch(() => setStatements([]))
  }, [])

  const loadDetail = useCallback((id: string) => {
    fetch(`/api/finanse/powiernicze/statements/${id}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [])

  useEffect(() => { loadStatements() }, [loadStatements, refreshKey])
  useEffect(() => { if (selectedId) loadDetail(selectedId) }, [selectedId, loadDetail, refreshKey])

  async function assignAccount(accountId: string) {
    if (!selectedId) return
    setBusy('assign'); setError(null)
    try {
      const r = await fetch(`/api/finanse/powiernicze/statements/${selectedId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escrowAccountId: accountId || null }),
      })
      if (!r.ok) { const d = await r.json(); setError(d.error || 'Błąd'); return }
      loadStatements(); loadDetail(selectedId)
    } finally { setBusy(null) }
  }

  async function reconcile(autoApply: boolean) {
    if (!selectedId) return
    setBusy(autoApply ? 'apply-all' : 'reconcile'); setError(null)
    try {
      const r = await fetch('/api/finanse/powiernicze/reconcile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statementId: selectedId, autoApply }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Błąd'); return }
      if (autoApply && d.applyErrors?.length) setError(d.applyErrors.join('; '))
      loadDetail(selectedId); loadStatements(); onChanged()
    } finally { setBusy(null) }
  }

  async function txAction(txId: string, action: string, paymentId?: string) {
    setBusy(txId); setError(null)
    try {
      const r = await fetch(`/api/finanse/powiernicze/transactions/${txId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, paymentId }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Błąd'); return }
      if (selectedId) loadDetail(selectedId)
      loadStatements(); onChanged()
    } finally { setBusy(null) }
  }

  if (statements === null) return <div className="text-sm text-gray-400 py-8 text-center">Ładowanie…</div>
  if (statements.length === 0) {
    return <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-500">
      Brak zaimportowanych wyciągów. Przejdź do zakładki <strong>Import wyciągu</strong>.
    </div>
  }

  const credits = detail?.transactions.filter((t) => t.side === 'CREDIT') || []
  const matchableCount = credits.filter((t) => t.matchStatus === 'MATCHED' && !t.booked).length

  return (
    <div className="space-y-4">
      {/* Wybór wyciągu */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-600">Wyciąg:</label>
        <select value={selectedId || ''} onChange={(e) => setSelectedId(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 min-w-[280px]">
          {statements.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fileName} • {s.periodFrom || '?'}–{s.periodTo || '?'} • {s.txCount} poz. ({s.matchedCount} dop.)
            </option>
          ))}
        </select>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">{error}</div>}

      {detail && (
        <>
          {/* Pasek akcji */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Rachunek powierniczy:</span>
              <select
                value={detail.escrowAccount?.id || ''}
                onChange={(e) => assignAccount(e.target.value)}
                disabled={busy === 'assign'}
                className={`text-sm border rounded-lg px-3 py-1.5 ${detail.escrowAccount ? 'border-gray-300' : 'border-amber-400 bg-amber-50'}`}
              >
                <option value="">— wybierz konto —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex-1" />
            <button onClick={() => reconcile(false)} disabled={busy !== null}
              className="text-sm border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-1.5 disabled:opacity-50">
              {busy === 'reconcile' ? 'Przeliczam…' : 'Przelicz dopasowania'}
            </button>
            <button onClick={() => reconcile(true)} disabled={busy !== null || matchableCount === 0 || !detail.escrowAccount}
              title={!detail.escrowAccount ? 'Najpierw przypisz rachunek powierniczy' : ''}
              className="text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5 font-medium disabled:opacity-50">
              {busy === 'apply-all' ? 'Księguję…' : `Zaksięguj dopasowane (${matchableCount})`}
            </button>
          </div>

          {/* Tabela wpłat */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-3">Wpłacający / tytuł</th>
                    <th className="py-2 px-3 text-right">Kwota</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Dopasowana rata</th>
                    <th className="py-2 px-3 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {credits.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-gray-400">Brak wpłat (CREDIT) w tym wyciągu.</td></tr>
                  )}
                  {credits.map((t) => (
                    <tr key={t.id} className={t.matchStatus === 'IGNORED' ? 'opacity-50' : ''}>
                      <td className="py-2 px-3 tabular-nums whitespace-nowrap">{t.bookingDate}</td>
                      <td className="py-2 px-3">
                        <div className="font-medium text-gray-900">{t.counterpartyName || '—'}</div>
                        <div className="text-xs text-gray-500 max-w-[260px] truncate" title={t.title || ''}>{t.title || '—'}</div>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium text-green-700 whitespace-nowrap">{fmtMoney(t.amount)}</td>
                      <td className="py-2 px-3"><StatusBadge status={t.matchStatus} booked={t.booked} reason={t.matchReason} /></td>
                      <td className="py-2 px-3">
                        {t.payment ? (
                          <div>
                            <span className="font-medium">{t.contract?.number}</span>
                            <span className="text-gray-500"> — {t.payment.title || 'rata'}</span>
                            <div className="text-xs text-gray-500">
                              plan {fmtMoney(t.payment.plannedAmount)}{t.payment.plannedDate ? `, termin ${t.payment.plannedDate}` : ''}
                            </div>
                          </div>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <RowActions t={t} busy={busy === t.id} onAction={txAction} hasAccount={!!detail.escrowAccount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatusBadge({ status, booked, reason }: { status: string; booked: boolean; reason: string | null }) {
  if (booked) return <span className="inline-block rounded px-2 py-0.5 text-xs bg-green-600 text-white">zaksięgowana</span>
  const map: Record<string, string> = {
    MATCHED: 'bg-green-100 text-green-800',
    SUGGESTED: 'bg-blue-100 text-blue-800',
    UNMATCHED: 'bg-amber-100 text-amber-800',
    IGNORED: 'bg-gray-100 text-gray-500',
  }
  const label: Record<string, string> = { MATCHED: 'dopasowana', SUGGESTED: 'do przeglądu', UNMATCHED: 'niedopasowana', IGNORED: 'zignorowana' }
  return <span className={`inline-block rounded px-2 py-0.5 text-xs ${map[status] || 'bg-gray-100'}`} title={reason || ''}>{label[status] || status}</span>
}

function RowActions({
  t, busy, onAction, hasAccount,
}: {
  t: Tx; busy: boolean; onAction: (id: string, action: string, paymentId?: string) => void; hasAccount: boolean
}) {
  if (t.booked) {
    return <button onClick={() => onAction(t.id, 'unapply')} disabled={busy}
      className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50">Cofnij księgowanie</button>
  }
  if (t.matchStatus === 'IGNORED') {
    return <button onClick={() => onAction(t.id, 'unignore')} disabled={busy} className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50">Przywróć</button>
  }
  return (
    <div className="flex items-center gap-2 justify-end">
      {t.payment && (
        <button onClick={() => onAction(t.id, 'apply', t.payment!.id)} disabled={busy || !hasAccount}
          title={!hasAccount ? 'Najpierw przypisz rachunek powierniczy' : 'Zaksięguj wpłatę na tę ratę'}
          className="text-xs bg-green-600 hover:bg-green-700 text-white rounded px-2 py-1 disabled:opacity-50">Zaksięguj</button>
      )}
      <button onClick={() => onAction(t.id, 'ignore')} disabled={busy}
        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50">Ignoruj</button>
    </div>
  )
}
