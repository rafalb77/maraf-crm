'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Plus,
  XCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react'

type ClientData = {
  firstName: string
  lastName: string
  city: string | null
  address: string | null
  email: string | null
  phone: string | null
  pesel: string | null
}

type DiffResult = {
  newRows: { rowIndex: number; data: ClientData; hasPesel: boolean }[]
  skipRows: { rowIndex: number; name: string; reason: string }[]
  totalRowsInFile: number
  withoutPeselCount: number
  applied?: { created: number }
}

export function ClientsImporter() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [committed, setCommitted] = useState<DiffResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function reset() {
    setFile(null)
    setDiff(null)
    setCommitted(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(f: File) {
    setFile(f)
    setDiff(null)
    setCommitted(null)
    setError(null)
    setPreviewLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('mode', 'preview')
      const res = await fetch('/api/clients/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Błąd analizy pliku')
      setDiff(data)
    } catch (e: any) {
      setError(e.message || 'Błąd analizy pliku')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function commit() {
    if (!file) return
    setConfirmOpen(false)
    setCommitting(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mode', 'commit')
      const res = await fetch('/api/clients/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Błąd zapisu')
      setCommitted(data)
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Błąd zapisu')
    } finally {
      setCommitting(false)
    }
  }

  // ====== Po commit — summary ======
  if (committed?.applied) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-green-900">Import zakończony</h2>
              <p className="text-sm text-green-800 mt-1">
                Dodano {committed.applied.created} nowych klientów. Dane wrażliwe (PESEL, adres) zapisane zaszyfrowane.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 text-sm">
            <Stat label="Dodano" value={committed.applied.created} accent="green" />
            <Stat label="Pominięto" value={committed.skipRows.length} accent="amber" />
            <Stat label="Bez PESEL" value={committed.withoutPeselCount} accent="gray" />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => router.push('/clients')}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            Przejdź do listy klientów
          </button>
          <button
            onClick={reset}
            className="w-full sm:w-auto bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-5 py-2 rounded-lg text-sm font-medium"
          >
            Importuj kolejny plik
          </button>
        </div>
      </div>
    )
  }

  // ====== Stan początkowy / podgląd ======
  return (
    <div className="space-y-5">
      {/* Upload box */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-gray-500" />
              Plik xlsx
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Limit: 5 MB. Rozpoznawane kolumny (po nagłówku): Imiona, Nazwisko, Miasto, Ulica, E-mail, Numer telefonu, PESEL.
            </p>
          </div>
          {file && (
            <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" />
              Zmień plik
            </button>
          )}
        </div>

        {!file ? (
          <label className="block">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 sm:p-8 text-center hover:bg-gray-50 cursor-pointer transition-colors">
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-900">Kliknij, aby wybrać plik</p>
              <p className="text-xs text-gray-500 mt-1">.xlsx — eksport z CRM</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </label>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3 text-sm">
            <FileSpreadsheet className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="font-medium text-gray-900 truncate">{file.name}</span>
            <span className="text-gray-500 flex-shrink-0">{(file.size / 1024).toFixed(1)} KB</span>
          </div>
        )}

        <div className="flex items-start gap-3 mt-5 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-blue-900 text-xs">
            Import dodaje <strong>tylko nowych</strong> klientów. Duplikaty rozpoznawane po <strong>PESEL</strong> — klient z PESEL-em już obecnym w bazie zostanie pominięty.
            Wiersze bez PESEL-a trafią jako nowi (nie da się ich zdeduplikować przy ponownym imporcie).
          </p>
        </div>
      </div>

      {/* Loading */}
      {previewLoading && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 text-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-600">Analizuję plik…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-900">
            <p className="font-medium">Błąd</p>
            <p className="text-red-800 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Preview */}
      {diff && !previewLoading && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Podsumowanie</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Nowi klienci" value={diff.newRows.length} accent="green" />
              <Stat label="Pominięci" value={diff.skipRows.length} accent="amber" />
              <Stat label="Bez PESEL" value={diff.withoutPeselCount} accent="gray" />
              <Stat label="Wierszy w pliku" value={diff.totalRowsInFile} accent="blue" />
            </div>
            {diff.withoutPeselCount > 0 && (
              <p className="text-xs text-gray-500 mt-3">
                {diff.withoutPeselCount} klientów bez PESEL-a zostanie dodanych, ale nie będą deduplikowani przy kolejnym imporcie.
              </p>
            )}
          </div>

          {/* NOWI */}
          {diff.newRows.length > 0 && (
            <Section icon={<Plus className="w-5 h-5 text-green-600" />} title={`Nowi klienci (${diff.newRows.length})`}>
              <Table
                head={['Wiersz', 'Imię', 'Nazwisko', 'PESEL', 'E-mail', 'Telefon', 'Miasto']}
                rows={diff.newRows.map((n) => [
                  String(n.rowIndex),
                  n.data.firstName,
                  n.data.lastName,
                  n.hasPesel ? (n.data.pesel as string) : '— brak —',
                  n.data.email || '—',
                  n.data.phone || '—',
                  n.data.city || '—',
                ])}
              />
            </Section>
          )}

          {/* POMINIĘCI */}
          {diff.skipRows.length > 0 && (
            <Section icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} title={`Pominięci (${diff.skipRows.length})`}>
              <Table
                head={['Wiersz', 'Klient', 'Powód']}
                rows={diff.skipRows.map((s) => [String(s.rowIndex), s.name || '—', s.reason])}
              />
            </Section>
          )}

          {/* Akcje */}
          {diff.newRows.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3 sticky bottom-4 shadow-sm">
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={committing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {committing ? 'Zapisuję...' : `Importuj ${diff.newRows.length} nowych klientów`}
              </button>
              <button onClick={reset} disabled={committing} className="text-gray-600 hover:text-gray-900 text-sm px-3">
                Anuluj
              </button>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
              Brak nowych klientów do dodania — wszyscy z pliku już są w bazie (lub pominięci).
            </div>
          )}
        </>
      )}

      {/* Confirmation modal */}
      {confirmOpen && diff && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-4 sm:p-6 max-w-md w-full max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-lg mb-2">Potwierdź import</h3>
            <p className="text-sm text-gray-600 mb-4">
              Zostanie dodanych <strong>{diff.newRows.length}</strong> nowych klientów. Dane wrażliwe zapisane zaszyfrowane.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">
                Anuluj
              </button>
              <button onClick={commit} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Tak, importuj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: 'green' | 'blue' | 'amber' | 'gray' }) {
  const colors: Record<string, string> = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  }
  return (
    <div className={`rounded-lg border p-3 ${colors[accent]}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  // Szerokość min. skalowana liczbą kolumn — na wąskim ekranie tabela scrolluje
  // się poziomo zamiast zgniatać komórki (7 kolumn dla "Nowi klienci" vs 3 dla "Pominięci").
  const minWidth = Math.max(head.length * 110, 420)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: `${minWidth}px` }}>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
            {head.map((h) => (
              <th key={h} className="px-2 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className="px-2 py-2 text-gray-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
