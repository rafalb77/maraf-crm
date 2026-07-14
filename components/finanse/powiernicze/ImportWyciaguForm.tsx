'use client'
import { useState } from 'react'
import { fmtMoney } from '@/lib/finanse-format'

type Preview = {
  mode: 'preview'
  format: string
  fileName: string
  accountNumber: string | null
  matchedAccount: { id: string; name: string } | null
  alreadyImported: boolean
  period: { from: string | null; to: string | null }
  openingBalance: number | null
  closingBalance: number | null
  currency: string
  totals: { transactions: number; credits: number; debits: number; creditSum: number; matched: number; suggested: number; unmatched: number }
  warnings: string[]
  preview: {
    bookingDate: string; side: string; amount: number; counterpartyName: string | null; title: string | null
    matchStatus: string | null; matchReason: string | null; contractNumber: string | null
  }[]
}

const FORMAT_LABELS: Record<string, string> = { MT940: 'MT940 (SWIFT)', CSV: 'CSV (Moje ING)', CAMT053: 'camt.053 (XML)' }

export function ImportWyciaguForm({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState<'preview' | 'commit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function doPreview() {
    if (!file) return
    setLoading('preview'); setError(null); setPreview(null); setDone(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/finanse/powiernicze/statements?mode=preview', { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Błąd podglądu'); return }
      setPreview(data)
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally { setLoading(null) }
  }

  async function doCommit() {
    if (!file || !preview) return
    if (!confirm(`Zaimportować wyciąg (${preview.totals.credits} wpłat, ${fmtMoney(preview.totals.creditSum)})? System dopasuje wpłaty do harmonogramu.`)) return
    setLoading('commit'); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/finanse/powiernicze/statements?mode=commit', { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Błąd zapisu'); return }
      if (data.alreadyImported) {
        setDone('Ten plik był już zaimportowany — pominięto (idempotencja po sumie kontrolnej).')
      } else {
        setDone(`Zaimportowano ${data.txCreated} pozycji. Dopasowano automatycznie: ${data.reconcile.matched}, do przeglądu: ${data.reconcile.suggested}, niedopasowanych: ${data.reconcile.unmatched}.`)
      }
      setPreview(null); setFile(null)
      onImported()
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally { setLoading(null) }
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-semibold mb-1">Jak pobrać plik z ING:</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-800">
          <li><strong>ING Business</strong> → Wyciągi → eksport <strong>MT940</strong> (.sta/.txt) lub <strong>camt.053</strong> (.xml)</li>
          <li><strong>Moje ING</strong> → Historia → Eksportuj → <strong>CSV</strong></li>
          <li>Format wykrywany automatycznie. Najpierw <strong>podgląd</strong>, potem <strong>import</strong>.</li>
        </ul>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Plik wyciągu (MT940 / CSV / camt.053)</label>
        <input
          type="file"
          accept=".sta,.mt940,.txt,.csv,.xml,.camt"
          onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setDone(null) }}
          className="block w-full text-sm border border-gray-300 rounded-lg file:bg-gray-100 file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
        />
        <div className="flex gap-2 mt-4">
          <button onClick={doPreview} disabled={!file || loading !== null}
            className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {loading === 'preview' ? 'Analizuję…' : 'Podgląd'}
          </button>
          {preview && (
            <button onClick={doCommit} disabled={loading !== null || preview.totals.transactions === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {loading === 'commit' ? 'Importuję…' : `Importuj (${preview.totals.credits} wpłat)`}
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900">{error}</div>}
      {done && <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-900">✓ {done}</div>}

      {preview && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-gray-900">Podgląd wyciągu</h2>
            <span className="text-xs bg-gray-100 text-gray-700 rounded px-2 py-1 font-medium">{FORMAT_LABELS[preview.format] || preview.format}</span>
          </div>

          {preview.alreadyImported && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
              ⚠ Ten plik już był zaimportowany (identyczna suma kontrolna). Ponowny import zostanie pominięty.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <Info label="Rachunek" value={preview.accountNumber || '—'} mono />
            <Info label="Okres" value={`${preview.period.from || '?'} – ${preview.period.to || '?'}`} />
            <Info label="Saldo otwarcia" value={preview.openingBalance != null ? fmtMoney(preview.openingBalance) : '—'} />
            <Info label="Saldo zamknięcia" value={preview.closingBalance != null ? fmtMoney(preview.closingBalance) : '—'} />
          </div>

          <div className="text-sm">
            {preview.matchedAccount ? (
              <span className="text-green-700">✓ Dopasowano do rachunku powierniczego: <strong>{preview.matchedAccount.name}</strong></span>
            ) : (
              <span className="text-amber-700">⚠ Nie rozpoznano rachunku powierniczego po numerze — przypiszesz go po imporcie w zakładce Dopasowanie.</span>
            )}
          </div>

          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            <Stat label="Wpłaty" value={preview.totals.credits} accent="gray" />
            <Stat label="Suma wpłat" value={fmtMoney(preview.totals.creditSum)} accent="gray" />
            <Stat label="Auto-dopasowane" value={preview.totals.matched} accent="green" />
            <Stat label="Do przeglądu" value={preview.totals.suggested} accent="blue" />
            <Stat label="Niedopasowane" value={preview.totals.unmatched} accent="amber" />
          </div>

          {preview.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-900 mb-1">Ostrzeżenia parsera ({preview.warnings.length}):</p>
              <ul className="text-xs text-amber-800 space-y-0.5 list-disc list-inside">
                {preview.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Pozycje (pierwsze {Math.min(preview.preview.length, 200)})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="py-1 px-2">Data</th>
                    <th className="py-1 px-2">Kontrahent</th>
                    <th className="py-1 px-2">Tytuł</th>
                    <th className="py-1 px-2 text-right">Kwota</th>
                    <th className="py-1 px-2">Dopasowanie</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.preview.map((p, i) => (
                    <tr key={i} className={p.side === 'DEBIT' ? 'text-gray-400' : ''}>
                      <td className="py-1 px-2 tabular-nums">{p.bookingDate}</td>
                      <td className="py-1 px-2">{p.counterpartyName || '—'}</td>
                      <td className="py-1 px-2 max-w-[240px] truncate" title={p.title || ''}>{p.title || '—'}</td>
                      <td className={`py-1 px-2 text-right tabular-nums ${p.side === 'CREDIT' ? 'text-green-700 font-medium' : ''}`}>
                        {p.side === 'DEBIT' ? '−' : ''}{fmtMoney(p.amount)}
                      </td>
                      <td className="py-1 px-2">{p.side === 'CREDIT' ? <MatchBadge status={p.matchStatus} reason={p.matchReason} /> : <span className="text-gray-300">obciążenie</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MatchBadge({ status, reason }: { status: string | null; reason: string | null }) {
  const map: Record<string, { t: string; label: string }> = {
    MATCHED: { t: 'bg-green-100 text-green-800', label: 'dopasowana' },
    SUGGESTED: { t: 'bg-blue-100 text-blue-800', label: 'do przeglądu' },
    UNMATCHED: { t: 'bg-amber-100 text-amber-800', label: 'niedopasowana' },
  }
  const m = status ? map[status] : null
  if (!m) return <span className="text-gray-400">—</span>
  return <span className={`inline-block rounded px-1.5 py-0.5 ${m.t}`} title={reason || ''}>{m.label}</span>
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent: 'gray' | 'green' | 'blue' | 'amber' }) {
  const color = {
    gray: 'text-gray-700 bg-gray-50 border-gray-200',
    green: 'text-green-700 bg-green-50 border-green-200',
    blue: 'text-blue-700 bg-blue-50 border-blue-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
  }[accent]
  return (
    <div className={`rounded-lg p-2.5 border ${color}`}>
      <p className="text-[11px] uppercase font-semibold tracking-wide">{label}</p>
      <p className="text-lg font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  )
}
