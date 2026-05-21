'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, Link2, Users, AlertTriangle } from 'lucide-react'

type Diff = {
  contractLinks: { unitNumber: string; contractNumber: string }[]
  clientLinks: { unitNumber: string; clientName: string }[]
  rows: { rowIndex: number; unitNumber: string; contractNumbers: string[]; clientName: string | null; clientResolved: boolean }[]
  unitNotFound: string[]
  contractNotFound: string[]
  clientNotFound: string[]
  alreadyLinkedContracts: number
  alreadyLinkedClients: number
  totalRowsInFile: number
  applied?: { contractLinksCreated: number; clientLinksCreated: number }
}

export function UnitsLinker() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [diff, setDiff] = useState<Diff | null>(null)
  const [committed, setCommitted] = useState<Diff | null>(null)
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setFile(null); setDiff(null); setCommitted(null); setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(f: File) {
    setFile(f); setDiff(null); setCommitted(null); setError(null); setLoading(true)
    try {
      const fd = new FormData(); fd.append('file', f); fd.append('mode', 'preview')
      const res = await fetch('/api/sales/link-units', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Błąd analizy pliku')
      setDiff(data)
    } catch (e: any) { setError(e.message || 'Błąd analizy pliku') } finally { setLoading(false) }
  }

  async function commit() {
    if (!file) return
    setCommitting(true); setError(null)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('mode', 'commit')
      const res = await fetch('/api/sales/link-units', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Błąd zapisu')
      setCommitted(data); router.refresh()
    } catch (e: any) { setError(e.message || 'Błąd zapisu') } finally { setCommitting(false) }
  }

  if (committed?.applied) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-green-900">Powiązania utworzone</h2>
              <p className="text-sm text-green-800 mt-1">Lokale podpięte do umów i klientów.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-5 text-sm">
            <Stat label="Lokal↔umowa (nowe)" value={committed.applied.contractLinksCreated} accent="green" />
            <Stat label="Lokal↔klient (nowe)" value={committed.applied.clientLinksCreated} accent="blue" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => router.push('/sales')} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium">Przejdź do umów</button>
          <button onClick={reset} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-5 py-2 rounded-lg text-sm font-medium">Wgraj kolejny plik</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-gray-500" />Eksport lokali z kolumną „Umowa"</h2>
            <p className="text-xs text-gray-500 mt-1">Rozpoznawane kolumny: Numer (lokalu), Umowa (numer umowy), Klient. Lokal łączony z umową rezerwacyjną i deweloperską tego samego numeru.</p>
          </div>
          {file && <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />Zmień plik</button>}
        </div>

        {!file ? (
          <label className="block">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 cursor-pointer">
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-900">Kliknij, aby wybrać plik</p>
              <p className="text-xs text-gray-500 mt-1">.xlsx — eksport lokali</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </label>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3 text-sm">
            <FileSpreadsheet className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="font-medium text-gray-900 truncate">{file.name}</span>
            <span className="text-gray-500 flex-shrink-0">{(file.size / 1024).toFixed(1)} KB</span>
          </div>
        )}
      </div>

      {loading && <div className="bg-white rounded-xl border border-gray-200 p-8 text-center"><Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" /><p className="text-sm text-gray-600">Analizuję plik…</p></div>}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-900"><p className="font-medium">Błąd</p><p className="text-red-800 mt-0.5">{error}</p></div>
        </div>
      )}

      {diff && !loading && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Podsumowanie</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Lokal↔umowa (nowe)" value={diff.contractLinks.length} accent="green" />
              <Stat label="Lokal↔klient (nowe)" value={diff.clientLinks.length} accent="blue" />
              <Stat label="Już powiązane (umowa)" value={diff.alreadyLinkedContracts} accent="gray" />
              <Stat label="Wierszy w pliku" value={diff.totalRowsInFile} accent="gray" />
            </div>
          </div>

          {(diff.unitNotFound.length > 0 || diff.contractNotFound.length > 0 || diff.clientNotFound.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-medium text-sm"><AlertTriangle className="w-4 h-4" />Do sprawdzenia</div>
              {diff.unitNotFound.length > 0 && <p className="text-xs text-amber-800">Lokale spoza bazy ({diff.unitNotFound.length}): {diff.unitNotFound.slice(0, 20).join(', ')}{diff.unitNotFound.length > 20 ? '…' : ''}</p>}
              {diff.contractNotFound.length > 0 && <p className="text-xs text-amber-800">Numery umów bez dopasowania ({diff.contractNotFound.length}): {diff.contractNotFound.slice(0, 20).join(', ')}{diff.contractNotFound.length > 20 ? '…' : ''}</p>}
              {diff.clientNotFound.length > 0 && <p className="text-xs text-amber-800">Klienci nierozpoznani/niejednoznaczni ({diff.clientNotFound.length}): {diff.clientNotFound.slice(0, 20).join(', ')}{diff.clientNotFound.length > 20 ? '…' : ''}</p>}
            </div>
          )}

          {diff.contractLinks.length > 0 && (
            <Section icon={<Link2 className="w-5 h-5 text-green-600" />} title={`Lokal ↔ umowa (${diff.contractLinks.length})`}>
              <Table head={['Lokal', 'Umowa']} rows={diff.contractLinks.map((l) => [l.unitNumber, l.contractNumber])} />
            </Section>
          )}
          {diff.clientLinks.length > 0 && (
            <Section icon={<Users className="w-5 h-5 text-blue-600" />} title={`Lokal ↔ klient (${diff.clientLinks.length})`}>
              <Table head={['Lokal', 'Klient']} rows={diff.clientLinks.map((l) => [l.unitNumber, l.clientName])} />
            </Section>
          )}

          {diff.contractLinks.length + diff.clientLinks.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 sticky bottom-4 shadow-sm">
              <button onClick={commit} disabled={committing} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2">
                {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {committing ? 'Zapisuję...' : `Utwórz ${diff.contractLinks.length + diff.clientLinks.length} powiązań`}
              </button>
              <button onClick={reset} disabled={committing} className="text-gray-600 hover:text-gray-900 text-sm px-3">Anuluj</button>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">Brak nowych powiązań — wszystko już połączone albo brak danych do połączenia.</div>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: 'green' | 'blue' | 'gray' }) {
  const colors: Record<string, string> = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  }
  return <div className={`rounded-lg border p-3 ${colors[accent]}`}><p className="text-xs opacity-80">{label}</p><p className="text-2xl font-bold mt-0.5">{value}</p></div>
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">{icon}<h3 className="font-semibold text-gray-900">{title}</h3></div>
      {children}
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white"><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">{head.map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-2 py-2 text-gray-700">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
