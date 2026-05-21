'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import {
  CONTRACT_TYPE_LABELS, CONTRACT_STATUS_LABELS,
  type ContractType, type ContractStatus,
} from '@/lib/types'

type PreviewRow = {
  rowIndex: number
  number: string
  action: 'create' | 'update'
  type: ContractType
  status: ContractStatus
  primaryClient: string
  clientResolution: 'matched' | 'will-create' | 'ambiguous'
  unitsMatched: string[]
  unitsMissing: string[]
  signedAt: string | null
  valueGross: number | null
}
type ImportErrorRow = { rowIndex: number; number: string; reason: string }
type Diff = {
  rows: PreviewRow[]
  errors: ImportErrorRow[]
  totalRowsInFile: number
  willCreateClients: number
  missingUnits: string[]
  applied?: { contractsCreated: number; contractsUpdated: number; clientsCreated: number; unitsLinked: number }
}

const fmtPln = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 })

export function ContractsImporter() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [createMissingClients, setCreateMissingClients] = useState(true)
  const [diff, setDiff] = useState<Diff | null>(null)
  const [committed, setCommitted] = useState<Diff | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(mode: 'preview' | 'commit') {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mode', mode)
      fd.append('createMissingClients', String(createMissingClients))
      const res = await fetch('/api/sales/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Błąd importu')
      if (mode === 'preview') setDiff(data)
      else { setCommitted(data); setDiff(null); router.refresh() }
    } catch (e: any) {
      setError(e?.message || 'Błąd')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setFile(null); setDiff(null); setCommitted(null); setError(null)
  }

  const creates = diff?.rows.filter((r) => r.action === 'create').length ?? 0
  const updates = diff?.rows.filter((r) => r.action === 'update').length ?? 0

  return (
    <div className="space-y-5">
      {/* Szablon */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900">
        <p className="font-semibold mb-1">Format pliku .xlsx (nagłówek w 1. wierszu)</p>
        <p className="text-blue-800 text-xs leading-relaxed">
          <strong>A</strong> Nr umowy* · <strong>B</strong> Typ (Rezerwacyjna/Deweloperska/Przeniesienia) ·{' '}
          <strong>C</strong> Status (W przygotowaniu/Podpisana/Rozwiązana/Anulowana) · <strong>D</strong> Klient(zy, przecinkami) ·{' '}
          <strong>E</strong> Telefon · <strong>F</strong> Email · <strong>G</strong> Lokale (numery, przecinkami) ·{' '}
          <strong>H</strong> Inwestycja · <strong>I</strong> Data wprowadzenia · <strong>J</strong> Data podpisania ·{' '}
          <strong>K</strong> Wartość netto · <strong>L</strong> Wartość brutto · <strong>M</strong> Kaucja ·{' '}
          <strong>N</strong> Rabat · <strong>O</strong> Notatki · <strong>P</strong> Źródło
        </p>
        <p className="text-blue-700 text-xs mt-2">
          „Data wprowadzenia" trafia w datę utworzenia nowego klienta — dzięki temu policzy się też cykl sprzedaży dla historii.
          Lokale muszą być wcześniej zaimportowane (dopasowanie po numerze).
        </p>
      </div>

      {/* Sukces */}
      {committed?.applied && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-800 font-semibold mb-2">
            <CheckCircle2 className="w-5 h-5" /> Import zakończony
          </div>
          <ul className="text-sm text-green-900 space-y-0.5">
            <li>Utworzone umowy: <strong>{committed.applied.contractsCreated}</strong></li>
            <li>Zaktualizowane umowy: <strong>{committed.applied.contractsUpdated}</strong></li>
            <li>Utworzeni klienci: <strong>{committed.applied.clientsCreated}</strong></li>
            <li>Podpięte lokale: <strong>{committed.applied.unitsLinked}</strong></li>
          </ul>
          {committed.errors.length > 0 && (
            <p className="text-sm text-amber-700 mt-2">Pominięto {committed.errors.length} wierszy (błędy).</p>
          )}
          <button onClick={reset} className="mt-3 text-sm text-green-700 hover:text-green-900 font-medium">
            Importuj kolejny plik
          </button>
        </div>
      )}

      {!committed && (
        <>
          {/* Upload */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                <Upload className="w-4 h-4" /> Wybierz plik .xlsx
              </span>
              <span className="text-sm text-gray-500">{file?.name || 'nie wybrano'}</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setDiff(null) }}
              />
            </label>

            <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={createMissingClients}
                onChange={(e) => setCreateMissingClients(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span className="text-gray-700">Twórz brakujących klientów z danych umowy</span>
            </label>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => send('preview')}
                disabled={!file || loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                {loading && !diff ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Podgląd zmian
              </button>
            </div>
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          </div>

          {/* Preview */}
          {diff && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Nowe umowy" value={creates} />
                <Stat label="Aktualizacje" value={updates} />
                <Stat label="Nowi klienci" value={diff.willCreateClients} />
                <Stat label="Błędy" value={diff.errors.length} danger={diff.errors.length > 0} />
              </div>

              {diff.missingUnits.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Lokale spoza bazy (nie zostaną podpięte): {diff.missingUnits.join(', ')}. Zaimportuj je najpierw w module Lokale.
                  </span>
                </div>
              )}

              {diff.rows.length > 0 && (
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Nr</th>
                        <th className="text-left px-3 py-2 font-medium">Akcja</th>
                        <th className="text-left px-3 py-2 font-medium">Typ / status</th>
                        <th className="text-left px-3 py-2 font-medium">Klient</th>
                        <th className="text-left px-3 py-2 font-medium">Lokale</th>
                        <th className="text-right px-3 py-2 font-medium">Brutto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.rows.slice(0, 100).map((r) => (
                        <tr key={r.rowIndex} className="border-t border-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">{r.number}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${r.action === 'create' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                              {r.action === 'create' ? 'nowa' : 'update'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600 text-xs">
                            {CONTRACT_TYPE_LABELS[r.type]} · {CONTRACT_STATUS_LABELS[r.status]}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {r.primaryClient}
                            {r.clientResolution === 'will-create' && <span className="ml-1 text-xs text-green-600">(nowy)</span>}
                            {r.clientResolution === 'ambiguous' && <span className="ml-1 text-xs text-amber-600">(wielu!)</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600 text-xs">
                            {r.unitsMatched.join(', ') || '—'}
                            {r.unitsMissing.length > 0 && <span className="text-amber-600"> +{r.unitsMissing.length} brak</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtPln(r.valueGross)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {diff.rows.length > 100 && (
                    <p className="text-xs text-gray-400 px-3 py-2">…i {diff.rows.length - 100} kolejnych (zapis obejmie wszystkie).</p>
                  )}
                </div>
              )}

              {diff.errors.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-red-600 font-medium">Błędy ({diff.errors.length})</summary>
                  <ul className="mt-2 space-y-0.5 text-xs text-red-700">
                    {diff.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>wiersz {e.rowIndex} ({e.number || '—'}): {e.reason}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => send('commit')}
                  disabled={loading || diff.rows.length === 0}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Zapisz {diff.rows.length} umów do bazy
                </button>
                <button onClick={reset} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">
                  Anuluj
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${danger ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${danger ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
