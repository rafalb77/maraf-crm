'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { fmtMoney } from '@/lib/finanse-format'

type PreviewResult = {
  mode: 'preview'
  perSheetCounts: Record<string, { invoices: number; payments: number; skipped: number }>
  newVendors: { name: string; category: string }[]
  existingVendorsCount: number
  newInvoicesCount: number
  duplicatesCount: number
  skippedCount: number
  skipped: { sheetName: string; rowIndex: number; reason: string; raw: string }[]
  sampleNewInvoices: any[]
  totalRowsScanned: number
}

type CommitResult = {
  mode: 'commit'
  vendorsCreated: number
  invoicesCreated: number
  paymentsCreated: number
  duplicatesSkipped: number
  warnings: string[]
}

export function ImportFinanseForm() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [committed, setCommitted] = useState<CommitResult | null>(null)
  const [loading, setLoading] = useState<'preview' | 'commit' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function doPreview() {
    if (!file) return
    setLoading('preview')
    setError(null)
    setPreview(null)
    setCommitted(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/finanse/import?mode=preview', { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error || 'Blad podgladu')
        return
      }
      setPreview(data)
    } catch (e: any) {
      setError(e.message || 'Blad sieci')
    } finally {
      setLoading(null)
    }
  }

  async function doCommit() {
    if (!file) return
    if (!confirm(`Zapisać ${preview?.newInvoicesCount} faktur + ${preview?.newVendors.length} kontrahentów do bazy? Tej operacji nie da się cofnąć jednym kliknięciem.`)) return
    setLoading('commit')
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/finanse/import?mode=commit', { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error || 'Blad zapisu')
        return
      }
      setCommitted(data)
      setPreview(null)
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Blad sieci')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Plik xlsx</label>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setCommitted(null) }}
          className="block w-full text-sm border border-gray-300 rounded-lg file:bg-gray-100 file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
        />
        <div className="flex gap-2 mt-4">
          <button
            onClick={doPreview}
            disabled={!file || loading !== null}
            className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading === 'preview' ? 'Analizuję...' : 'Podgląd'}
          </button>
          {preview && (
            <button
              onClick={doCommit}
              disabled={loading !== null || preview.newInvoicesCount === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading === 'commit' ? 'Zapisuję...' : `Zapisz do DB (${preview.newInvoicesCount} faktur)`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900">
          {error}
        </div>
      )}

      {preview && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Podgląd importu</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Nowych faktur" value={preview.newInvoicesCount} accent="blue" />
            <Stat label="Duplikatów (pomijamy)" value={preview.duplicatesCount} accent="gray" />
            <Stat label="Pominiętych wierszy" value={preview.skippedCount} accent="amber" />
            <Stat label="Nowych kontrahentów" value={preview.newVendors.length} accent="green" />
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Per zakładka</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px] lg:min-w-0">
                <thead className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="py-1 px-2">Zakładka</th>
                    <th className="py-1 px-2 text-right">Faktur</th>
                    <th className="py-1 px-2 text-right">Płatności</th>
                    <th className="py-1 px-2 text-right">Pominięto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(preview.perSheetCounts).map(([sheet, c]) => (
                    <tr key={sheet}>
                      <td className="py-1.5 px-2 font-mono text-xs">{sheet}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{c.invoices}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{c.payments}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{c.skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {preview.newVendors.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Nowi kontrahenci do utworzenia</h3>
              <div className="flex flex-wrap gap-2">
                {preview.newVendors.map((v) => (
                  <span key={v.name} className="bg-green-50 border border-green-200 text-green-800 text-xs px-2 py-1 rounded">
                    {v.name} <span className="text-green-600">({v.category})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {preview.sampleNewInvoices.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Przykładowe faktury (pierwsze 10 z {preview.newInvoicesCount})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px] lg:min-w-0">
                  <thead className="text-left text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="py-1 px-2">Vendor / Sub</th>
                      <th className="py-1 px-2">Nr FV</th>
                      <th className="py-1 px-2">Wystawiona</th>
                      <th className="py-1 px-2 text-right">Brutto</th>
                      <th className="py-1 px-2">Status</th>
                      <th className="py-1 px-2 text-right">Płat.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.sampleNewInvoices.map((inv, i) => (
                      <tr key={i}>
                        <td className="py-1 px-2">
                          {inv.vendor}{inv.subVendor && <span className="text-gray-500"> / {inv.subVendor}</span>}
                        </td>
                        <td className="py-1 px-2 font-mono">{inv.number}</td>
                        <td className="py-1 px-2 tabular-nums">{new Date(inv.issueDate).toLocaleDateString('pl-PL')}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{fmtMoney(inv.amountGross)}</td>
                        <td className="py-1 px-2 text-gray-600">{inv.status}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{inv.paymentsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.skipped.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Pominięte wiersze ({preview.skippedCount})</h3>
              <ul className="space-y-1 text-xs">
                {preview.skipped.map((s, i) => (
                  <li key={i} className="text-gray-600">
                    <span className="font-mono">{s.sheetName} R{s.rowIndex}</span>: {s.reason} <span className="text-gray-400">— {s.raw}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {committed && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <h2 className="font-semibold text-green-900 mb-2">✓ Import zakończony</h2>
          <ul className="text-sm text-green-800 space-y-1">
            <li>Kontrahentów utworzono: <strong>{committed.vendorsCreated}</strong></li>
            <li>Faktur utworzono: <strong>{committed.invoicesCreated}</strong></li>
            <li>Płatności utworzono: <strong>{committed.paymentsCreated}</strong></li>
            <li>Duplikatów pominięto: <strong>{committed.duplicatesSkipped}</strong></li>
          </ul>
          {committed.warnings.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-green-700 font-semibold uppercase">Ostrzeżenia:</p>
              <ul className="text-xs text-green-700">
                {committed.warnings.map((w, i) => <li key={i}>• {w}</li>)}
              </ul>
            </div>
          )}
          <a href="/finanse/faktury" className="inline-block mt-4 text-sm text-blue-600 hover:underline">
            Zobacz faktury →
          </a>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: 'blue' | 'gray' | 'amber' | 'green' }) {
  const color = {
    blue: 'text-blue-700 bg-blue-50 border-blue-200',
    gray: 'text-gray-600 bg-gray-50 border-gray-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    green: 'text-green-700 bg-green-50 border-green-200',
  }[accent]
  return (
    <div className={`rounded-lg p-3 border ${color}`}>
      <p className="text-xs uppercase font-semibold tracking-wider">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
    </div>
  )
}
