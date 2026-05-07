'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  XCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react'

type SectionDiff = {
  key: string
  floor: string
  floorLabel: string
  marafFloor: string
  wallsArea: number
  colsVol: number
  sourceRow: number
  existing: { wallsArea: number | null; colsVol: number | null } | null
  isNew: boolean
  changes: {
    wallsArea?: { old: number; new: number }
    colsVol?: { old: number; new: number }
  }
}

type PreviewResult = {
  sections: SectionDiff[]
  unmappedSheets: string[]
  workScopeMissing: boolean
  applied?: {
    summariesCreated: number
    summariesReplaced: number
    itemsCreated: number
  }
}

const fmtNum = (n: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(n)

export function PrzedmiarKonradUploader({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [diff, setDiff] = useState<PreviewResult | null>(null)
  const [committed, setCommitted] = useState<PreviewResult | null>(null)
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
      const res = await fetch('/api/przeroby/przedmiary/upload', {
        method: 'POST',
        body: fd,
      })
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
      const res = await fetch('/api/przeroby/przedmiary/upload', {
        method: 'POST',
        body: fd,
      })
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
      <Modal onClose={onClose} title="Import zakończony">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-900">
              <p className="font-medium">Przedmiar Konrada zaimportowany.</p>
              <ul className="mt-2 space-y-0.5 text-green-800 text-xs">
                {a.summariesCreated > 0 && (
                  <li>+ {a.summariesCreated} nowych kondygnacji</li>
                )}
                {a.summariesReplaced > 0 && (
                  <li>↻ {a.summariesReplaced} kondygnacji zaktualizowano</li>
                )}
                <li>{a.itemsCreated} pozycji łącznie (ściany + słupy)</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Zamknij
          </button>
        </div>
      </Modal>
    )
  }

  // ====== Preview / upload ======
  return (
    <Modal onClose={onClose} title="Wgraj przedmiar Konrada">
      <p className="text-sm text-gray-600 mb-4">
        Wybierz plik xlsx z eksportu Konrada (arkusz <strong>„Ściany i słupy żelb."</strong>). Plik
        zostanie przeanalizowany — zobaczysz podgląd zmian zanim cokolwiek zostanie zapisane.
      </p>

      {/* Upload box */}
      {!file ? (
        <label className="block mb-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 cursor-pointer transition-colors">
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">Kliknij, aby wybrać plik</p>
            <p className="text-xs text-gray-500 mt-1">.xlsx (limit 5 MB)</p>
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
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3 text-sm mb-4">
          <FileSpreadsheet className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="font-medium text-gray-900 truncate flex-1">{file.name}</span>
          <span className="text-gray-500 flex-shrink-0">{(file.size / 1024).toFixed(1)} KB</span>
          <button
            onClick={reset}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            disabled={committing}
          >
            <XCircle className="w-3.5 h-3.5" />
            Zmień
          </button>
        </div>
      )}

      {/* Loading */}
      {previewLoading && (
        <div className="text-center py-4">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-600">Analizuję plik…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 mb-4">
          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-900">
            <p className="font-medium">Błąd</p>
            <p className="text-red-800 mt-0.5 text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* Workscope missing */}
      {diff?.workScopeMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Brak obmiaru Maraf w bazie</p>
            <p className="text-amber-800 mt-0.5 text-xs">
              Najpierw zaimportuj obmiar Maraf przez skrypt CLI (zakres „konstrukcja-zelbetowa").
              Bez niego porównanie Konrada nie będzie miało punktu odniesienia.
            </p>
          </div>
        </div>
      )}

      {/* Preview */}
      {diff && !previewLoading && diff.sections.length > 0 && (
        <>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Znaleziono {diff.sections.length} kondygnacji w pliku
          </h4>
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Kondygnacja</th>
                  <th className="px-3 py-2 font-medium text-right">Ściany [m²]</th>
                  <th className="px-3 py-2 font-medium text-right">Słupy [m³]</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {diff.sections.map((s) => (
                  <tr key={s.floor}>
                    <td className="px-3 py-2 font-medium text-gray-900">{s.floorLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {s.changes.wallsArea ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-red-600 line-through text-xs">
                            {fmtNum(s.changes.wallsArea.old)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className="font-medium">{fmtNum(s.changes.wallsArea.new)}</span>
                        </span>
                      ) : (
                        fmtNum(s.wallsArea)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {s.changes.colsVol ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-red-600 line-through text-xs">
                            {fmtNum(s.changes.colsVol.old)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className="font-medium">{fmtNum(s.changes.colsVol.new)}</span>
                        </span>
                      ) : (
                        fmtNum(s.colsVol)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {s.isNew ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                          + Nowa
                        </span>
                      ) : Object.keys(s.changes).length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                          ↻ Zmiana
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                          = Bez zmian
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Unmapped sheets info */}
          {diff.unmappedSheets.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded p-2 text-xs text-gray-600 mb-4">
              <p className="font-medium mb-1">Pozostałe arkusze w pliku (niezaimportowane):</p>
              <p className="font-mono break-all">{diff.unmappedSheets.join(', ')}</p>
              <p className="mt-1">
                Importujemy tylko „Ściany i słupy żelb." — pozostałe arkusze nie pasują do obmiaru Maraf.
              </p>
            </div>
          )}

          {/* Action */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              disabled={committing}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Anuluj
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={committing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {committing ? 'Zapisuję…' : 'Zatwierdź import'}
            </button>
          </div>
        </>
      )}

      {/* No sections found */}
      {diff && !previewLoading && diff.sections.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
          W pliku nie znaleziono żadnej kondygnacji w arkuszu „Ściany i słupy żelb.". Sprawdź czy
          format jest zgodny z oczekiwaniem (label kondygnacji w kol B + „ściany" w kol C).
        </div>
      )}

      {/* Confirmation modal */}
      {confirmOpen && diff && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-lg mb-2">Czy na pewno?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Dla każdej kondygnacji <strong>istniejące dane Konrada zostaną zastąpione</strong>
              {' '}wartościami z pliku. Tej operacji nie można cofnąć.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm mb-5">
              <div className="flex justify-between">
                <span>Nowych kondygnacji:</span>
                <span className="font-medium text-green-700">
                  +{diff.sections.filter((s) => s.isNew).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Aktualizowanych:</span>
                <span className="font-medium text-blue-700">
                  ↻{diff.sections.filter((s) => !s.isNew && Object.keys(s.changes).length > 0).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Bez zmian:</span>
                <span className="font-medium text-gray-700">
                  ={diff.sections.filter((s) => !s.isNew && Object.keys(s.changes).length === 0).length}
                </span>
              </div>
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
    </Modal>
  )
}

// =====================================================================
// Modal wrapper
// =====================================================================

function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="font-semibold text-gray-900 text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Zamknij">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
