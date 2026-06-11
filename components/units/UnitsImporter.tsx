'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Plus,
  RefreshCw,
  Trash2,
  ShieldCheck,
  XCircle,
  Loader2,
  Users,
} from 'lucide-react'

type DiffResult = {
  newRows: { rowIndex: number; data: any }[]
  updateRows: {
    rowIndex: number
    number: string
    changes: Record<string, { old: unknown; new: unknown }>
    data: any
  }[]
  skipRows: { rowIndex: number; number: string; reason: string }[]
  deleteRows: {
    id: string
    number: string
    type: string
    area: number
    priceGross: number
    isProtected: boolean
    protectedReasons: string[]
  }[]
  clientAssignments: {
    unitNumber: string
    clientName: string
    resolvedClientId: string | null
    alreadyAssigned: boolean
  }[]
  unresolvedClients: { unitNumber: string; clientName: string }[]
  totalRowsInFile: number
  applied?: {
    created: number
    updated: number
    deleted: number
    skipped: number
    protectedKept: number
    clientsAssigned: number
  }
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 2 }).format(n)
const fmtNum = (n: unknown) =>
  typeof n === 'number' ? new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(n) : String(n ?? '—')

export function UnitsImporter() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [syncStatusAndClients, setSyncStatusAndClients] = useState(false)

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
      fd.append('syncStatusAndClients', String(syncStatusAndClients))
      const res = await fetch('/api/units/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Błąd analizy pliku')
      setDiff(data)
    } catch (e: any) {
      setError(e.message || 'Błąd analizy pliku')
    } finally {
      setPreviewLoading(false)
    }
  }

  // Re-run preview when checkbox changes (statusy/klienci wpływają na diff)
  async function handleSyncToggle(v: boolean) {
    setSyncStatusAndClients(v)
    if (file) {
      setPreviewLoading(true)
      setError(null)
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('mode', 'preview')
        fd.append('syncStatusAndClients', String(v))
        const res = await fetch('/api/units/import', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Błąd analizy pliku')
        setDiff(data)
      } catch (e: any) {
        setError(e.message || 'Błąd analizy pliku')
      } finally {
        setPreviewLoading(false)
      }
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
      fd.append('syncStatusAndClients', String(syncStatusAndClients))
      const res = await fetch('/api/units/import', { method: 'POST', body: fd })
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

  // ====== Po commit — pokaż summary ======
  if (committed?.applied) {
    const a = committed.applied
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-green-900">Import zakończony</h2>
              <p className="text-sm text-green-800 mt-1">
                Wszystkie zmiany zostały zapisane do bazy.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 text-sm">
            <Stat label="Dodano" value={a.created} accent="green" />
            <Stat label="Zaktualizowano" value={a.updated} accent="blue" />
            <Stat label="Usunięto" value={a.deleted} accent="red" />
            <Stat label="Pominięto (błędy)" value={a.skipped} accent="amber" />
            <Stat label="Chronione (zachowano)" value={a.protectedKept} accent="gray" />
            {syncStatusAndClients && (
              <Stat label="Przypisań klientów" value={a.clientsAssigned} accent="purple" />
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/units')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            Przejdź do listy lokali
          </button>
          <button
            onClick={reset}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-5 py-2 rounded-lg text-sm font-medium"
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
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-gray-500" />
              Plik xlsx
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Limit: 5 MB. Format zgodny z eksportem CRM (kolumny: Numer, Typ, Status, Klient, Budynek, Klatka, Kondygnacja, Pokoje, Powierzchnia, Cena brutto). Kolumna I „Pokoje" zasila statystykę „co schodzi najszybciej" (mieszkania wg liczby pokoi). Opcjonalna kolumna P „Data wystawienia" backfill-uje datę utworzenia lokalu (potrzebna do statystyki „czas do sprzedaży").
            </p>
          </div>
          {file && (
            <button
              onClick={reset}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <XCircle className="w-3.5 h-3.5" />
              Zmień plik
            </button>
          )}
        </div>

        {!file ? (
          <label className="block">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 cursor-pointer transition-colors">
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

        {/* Sync option */}
        <label className="flex items-start gap-3 mt-5 p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
          <input
            type="checkbox"
            checked={syncStatusAndClients}
            onChange={(e) => handleSyncToggle(e.target.checked)}
            className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
          />
          <div className="text-sm">
            <p className="font-medium text-amber-900">
              Nadpisz też statusy i przypisania klientów (jednorazowo)
            </p>
            <p className="text-amber-800 text-xs mt-1">
              Włącz tylko przy <strong>pierwszej synchronizacji</strong>. Mapuje statusy z xlsx (Wolny, Sprzedany, Rezerwacja, Wyłączony ze sprzedaży)
              i dopina klientów do lokali (po imieniu i nazwisku — klient musi już być w bazie).
              Nie usuwa istniejących przypisań — tylko dodaje brakujące.
            </p>
          </div>
        </label>
      </div>

      {/* Loading */}
      {previewLoading && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
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
          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Podsumowanie zmian</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Nowe" value={diff.newRows.length} accent="green" />
              <Stat label="Aktualizacje" value={diff.updateRows.length} accent="blue" />
              <Stat label="Pominięte" value={diff.skipRows.length} accent="amber" />
              <Stat label="Do usunięcia" value={diff.deleteRows.filter((d) => !d.isProtected).length} accent="red" />
            </div>
            {diff.deleteRows.some((d) => d.isProtected) && (
              <p className="text-xs text-gray-500 mt-3">
                + {diff.deleteRows.filter((d) => d.isProtected).length} chronionych lokali (nie zostaną ruszone)
              </p>
            )}
          </div>

          {/* Banner ostrzeżenia gdy będą usunięcia */}
          {diff.deleteRows.some((d) => !d.isProtected) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-red-900">
                  Uwaga: {diff.deleteRows.filter((d) => !d.isProtected).length} lokali zostanie usuniętych z bazy
                </p>
                <p className="text-red-800 mt-0.5">
                  Tych lokali nie ma w pliku xlsx. Lokale „w użyciu" (umowa / klient / oferta / zgłoszenie) nie zostaną ruszone.
                </p>
              </div>
            </div>
          )}

          {/* NOWE */}
          {diff.newRows.length > 0 && (
            <Section
              icon={<Plus className="w-5 h-5 text-green-600" />}
              title={`Nowe lokale (${diff.newRows.length})`}
              tone="green"
            >
              <Table
                head={['Wiersz', 'Numer', 'Typ', 'Powierzchnia', 'Cena brutto', 'Lokalizacja']}
                rows={diff.newRows.map((n) => [
                  String(n.rowIndex),
                  n.data.number,
                  n.data.type,
                  `${fmtNum(n.data.area)} m²`,
                  fmtMoney(n.data.priceGross),
                  [n.data.building, n.data.floor !== null ? `kond. ${n.data.floor}` : null].filter(Boolean).join(' / '),
                ])}
              />
            </Section>
          )}

          {/* UPDATE */}
          {diff.updateRows.length > 0 && (
            <Section
              icon={<RefreshCw className="w-5 h-5 text-blue-600" />}
              title={`Aktualizacje (${diff.updateRows.length})`}
              tone="blue"
            >
              <div className="space-y-2">
                {diff.updateRows.map((u) => (
                  <div key={u.number} className="border border-gray-200 rounded-lg p-3 bg-white">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-900">{u.number}</span>
                      <span className="text-xs text-gray-500">wiersz {u.rowIndex}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                      {Object.entries(u.changes).map(([field, ch]) => (
                        <div key={field} className="flex items-baseline gap-2">
                          <span className="text-gray-500 min-w-[110px]">{field}:</span>
                          <span className="text-red-600 line-through">{fmtNum(ch.old)}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-green-700 font-medium">{fmtNum(ch.new)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* DELETE — nie chronione */}
          {diff.deleteRows.filter((d) => !d.isProtected).length > 0 && (
            <Section
              icon={<Trash2 className="w-5 h-5 text-red-600" />}
              title={`Do usunięcia (${diff.deleteRows.filter((d) => !d.isProtected).length})`}
              tone="red"
            >
              <Table
                head={['Numer', 'Typ', 'Powierzchnia', 'Cena brutto']}
                rows={diff.deleteRows
                  .filter((d) => !d.isProtected)
                  .map((d) => [
                    d.number,
                    d.type,
                    `${fmtNum(d.area)} m²`,
                    fmtMoney(d.priceGross),
                  ])}
              />
            </Section>
          )}

          {/* CHRONIONE — informacyjnie */}
          {diff.deleteRows.filter((d) => d.isProtected).length > 0 && (
            <Section
              icon={<ShieldCheck className="w-5 h-5 text-gray-600" />}
              title={`Chronione lokale (${diff.deleteRows.filter((d) => d.isProtected).length}) — nie zostaną ruszone`}
              tone="gray"
            >
              <Table
                head={['Numer', 'Typ', 'Dlaczego chroniony']}
                rows={diff.deleteRows
                  .filter((d) => d.isProtected)
                  .map((d) => [d.number, d.type, d.protectedReasons.join(', ')])}
              />
            </Section>
          )}

          {/* SKIP */}
          {diff.skipRows.length > 0 && (
            <Section
              icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
              title={`Pominięte wiersze (${diff.skipRows.length})`}
              tone="amber"
            >
              <Table
                head={['Wiersz', 'Numer', 'Powód']}
                rows={diff.skipRows.map((s) => [String(s.rowIndex), s.number || '—', s.reason])}
              />
            </Section>
          )}

          {/* CLIENT ASSIGNMENTS */}
          {syncStatusAndClients && (diff.clientAssignments.length > 0 || diff.unresolvedClients.length > 0) && (
            <Section
              icon={<Users className="w-5 h-5 text-purple-600" />}
              title="Przypisania klientów"
              tone="purple"
            >
              {diff.clientAssignments.filter((a) => !a.alreadyAssigned).length > 0 && (
                <>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Do dodania: {diff.clientAssignments.filter((a) => !a.alreadyAssigned).length}
                  </p>
                  <Table
                    head={['Lokal', 'Klient']}
                    rows={diff.clientAssignments
                      .filter((a) => !a.alreadyAssigned)
                      .map((a) => [a.unitNumber, a.clientName])}
                  />
                </>
              )}
              {diff.unresolvedClients.length > 0 && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded p-3">
                  <p className="text-sm font-medium text-amber-900 mb-2">
                    ⚠️ Klienci których nie ma w bazie ({diff.unresolvedClients.length}) — pominięci, dodaj ich ręcznie i ponów import:
                  </p>
                  <ul className="text-xs text-amber-800 space-y-0.5">
                    {diff.unresolvedClients.map((u, i) => (
                      <li key={i}>
                        <span className="font-mono">{u.unitNumber}</span> — {u.clientName}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* Action buttons */}
          {diff.newRows.length + diff.updateRows.length + diff.deleteRows.filter((d) => !d.isProtected).length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 sticky bottom-4 shadow-sm">
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={committing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {committing ? 'Zapisuję...' : 'Zatwierdź import'}
              </button>
              <button
                onClick={reset}
                disabled={committing}
                className="text-gray-600 hover:text-gray-900 text-sm px-3"
              >
                Anuluj
              </button>
              <span className="text-xs text-gray-500 ml-auto">
                Plik zostanie przetworzony ponownie przy zapisie
              </span>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
              Brak zmian do zastosowania — baza jest już zgodna z plikiem.
            </div>
          )}
        </>
      )}

      {/* Confirmation modal */}
      {confirmOpen && diff && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-lg mb-2">Czy na pewno?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Zmiany zostaną zapisane do bazy danych. Tej operacji <strong>nie można cofnąć</strong>.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm mb-5">
              {diff.newRows.length > 0 && (
                <div className="flex justify-between"><span>Dodanych:</span><span className="font-medium text-green-700">+{diff.newRows.length}</span></div>
              )}
              {diff.updateRows.length > 0 && (
                <div className="flex justify-between"><span>Zaktualizowanych:</span><span className="font-medium text-blue-700">~{diff.updateRows.length}</span></div>
              )}
              {diff.deleteRows.filter((d) => !d.isProtected).length > 0 && (
                <div className="flex justify-between"><span>Usuniętych:</span><span className="font-medium text-red-700">−{diff.deleteRows.filter((d) => !d.isProtected).length}</span></div>
              )}
              {syncStatusAndClients && diff.clientAssignments.filter((a) => !a.alreadyAssigned).length > 0 && (
                <div className="flex justify-between"><span>Przypisań klientów:</span><span className="font-medium text-purple-700">+{diff.clientAssignments.filter((a) => !a.alreadyAssigned).length}</span></div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Anuluj
              </button>
              <button
                onClick={commit}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Tak, zapisz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ====== Pomocnicze komponenty ======

function Stat({ label, value, accent }: { label: string; value: number; accent: 'green' | 'blue' | 'red' | 'amber' | 'gray' | 'purple' }) {
  const colors: Record<string, string> = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }
  return (
    <div className={`rounded-lg border p-3 ${colors[accent]}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
    </div>
  )
}

function Section({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode
  title: string
  tone: 'green' | 'blue' | 'red' | 'amber' | 'gray' | 'purple'
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
            {head.map((h) => (
              <th key={h} className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className="px-2 py-2 text-gray-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
