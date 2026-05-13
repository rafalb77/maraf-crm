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
  Lock,
} from 'lucide-react'

type PreviewItem = {
  position: number
  name: string
  unit: string
  matchMode: string
  konradValue: number | null
  konradNote: string | null
  existingManualValue: number | null
  willBeReplaced: boolean
}

type PreviewFloor = {
  floor: string
  floorLabel: string
  fromXlsx: boolean
  isNew: boolean
  items: PreviewItem[]
}

type PreviewResult = {
  floors: PreviewFloor[]
  unmappedSheets: string[]
  workScopeMissing: boolean
  totalItemsInPlan: number
  totalManualValuesPreserved: number
  applied?: {
    summariesCreated: number
    summariesReplaced: number
    itemsCreated: number
    manualValuesPreserved: number
  }
}

const fmtNum = (n: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(n)

const MATCH_MODE_BADGE: Record<string, { label: string; cls: string }> = {
  AUTO_OK: { label: 'AUTO', cls: 'bg-blue-100 text-blue-700' },
  MANUAL_NOT_FOUND: { label: 'MANUAL', cls: 'bg-amber-100 text-amber-700' },
  MANUAL_FLOOR_SPLIT: { label: 'PODZIAŁ', cls: 'bg-purple-100 text-purple-700' },
  MANUAL_DIFF_UNIT: { label: 'JEDN.', cls: 'bg-orange-100 text-orange-700' },
  MANUAL_OUT_OF_SCOPE: { label: 'POZA', cls: 'bg-gray-100 text-gray-700' },
  MANUAL_OVERRIDE: { label: 'OVERRIDE', cls: 'bg-pink-100 text-pink-700' },
}

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
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set())

  function reset() {
    setFile(null)
    setDiff(null)
    setCommitted(null)
    setError(null)
    setExpandedFloors(new Set())
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
      // Domyślnie rozwiń pierwsze 2 kondygnacje (parter + Ip)
      const initial = new Set<string>()
      data.floors.slice(0, 2).forEach((f: PreviewFloor) => initial.add(f.floor))
      setExpandedFloors(initial)
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

  function toggleFloor(floor: string) {
    setExpandedFloors((prev) => {
      const next = new Set(prev)
      if (next.has(floor)) next.delete(floor)
      else next.add(floor)
      return next
    })
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
              <p className="font-medium">Przedmiar kierownika zaimportowany.</p>
              <ul className="mt-2 space-y-0.5 text-green-800 text-xs">
                {a.summariesCreated > 0 && (
                  <li>+ {a.summariesCreated} nowych kondygnacji</li>
                )}
                {a.summariesReplaced > 0 && (
                  <li>↻ {a.summariesReplaced} kondygnacji zaktualizowano</li>
                )}
                <li>{a.itemsCreated} pozycji łącznie</li>
                {a.manualValuesPreserved > 0 && (
                  <li>
                    🔒 {a.manualValuesPreserved} wartości ręcznych (manualValue) zostało zachowanych z poprzedniego importu
                  </li>
                )}
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
    <Modal onClose={onClose} title="Wgraj przedmiar kierownika">
      <p className="text-sm text-gray-600 mb-4">
        Wybierz plik xlsx kierownika (arkusz <strong>„Ściany i słupy żelb."</strong>).
        System utworzy pełną strukturę porównania <strong>6 kondygnacji × 5–7 pozycji</strong>:
        ściany i słupy z xlsx kierownika (auto), pozostałe pozycje (stropy, belki, fundamenty,
        biegi, szyby, atyki) jako <strong>do uzupełnienia ręcznie</strong> przez kierownika w UI porównania.
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

      {previewLoading && (
        <div className="text-center py-4">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-600">Analizuję plik…</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 mb-4">
          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-900">
            <p className="font-medium">Błąd</p>
            <p className="text-red-800 mt-0.5 text-xs">{error}</p>
          </div>
        </div>
      )}

      {diff?.workScopeMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Brak obmiaru Maraf w bazie</p>
            <p className="text-amber-800 mt-0.5 text-xs">
              Najpierw zaimportuj obmiar Maraf przez skrypt CLI (zakres „konstrukcja-zelbetowa").
              Bez niego porównanie kierownika nie będzie miało punktu odniesienia.
            </p>
          </div>
        </div>
      )}

      {/* Summary header */}
      {diff && !previewLoading && diff.floors.length > 0 && (
        <>
          <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span><strong>{diff.floors.length}</strong> kondygnacji</span>
              <span><strong>{diff.totalItemsInPlan}</strong> pozycji łącznie</span>
              {diff.totalManualValuesPreserved > 0 && (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <Lock className="w-3.5 h-3.5" />
                  <strong>{diff.totalManualValuesPreserved}</strong> ręcznych wartości zachowanych
                </span>
              )}
            </div>
          </div>

          {/* Floors with items */}
          <div className="space-y-2 mb-4">
            {diff.floors.map((f) => {
              const expanded = expandedFloors.has(f.floor)
              const autoCount = f.items.filter((i) => i.matchMode === 'AUTO_OK').length
              return (
                <div key={f.floor} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleFloor(f.floor)}
                    className="w-full px-4 py-2.5 bg-white hover:bg-gray-50 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-xs">{expanded ? '▼' : '▶'}</span>
                      <span className="font-medium text-gray-900">{f.floorLabel}</span>
                      {!f.fromXlsx && (
                        <span className="text-xs text-gray-500 italic">
                          (brak w xlsx — wszystkie pozycje ręczne)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {autoCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                          {autoCount} AUTO
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                        {f.items.length - autoCount} MANUAL
                      </span>
                      {f.isNew ? (
                        <span className="px-2 py-0.5 rounded bg-green-100 text-green-700">+ Nowa</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">↻ Zastąpienie</span>
                      )}
                    </div>
                  </button>
                  {expanded && (
                    <div className="border-t border-gray-100 bg-gray-50">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-gray-500 uppercase tracking-wide">
                            <th className="px-3 py-2 font-medium">Pozycja</th>
                            <th className="px-3 py-2 font-medium text-right">Kierownik</th>
                            <th className="px-3 py-2 font-medium">Tryb</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {f.items.map((item, idx) => {
                            const badge = MATCH_MODE_BADGE[item.matchMode] || {
                              label: item.matchMode,
                              cls: 'bg-gray-100 text-gray-700',
                            }
                            const hasKonrad = item.konradValue != null
                            return (
                              <tr key={idx}>
                                <td className="px-3 py-2 text-gray-900">{item.name}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {hasKonrad && item.konradValue! > 0 ? (
                                    <span>
                                      {fmtNum(item.konradValue!)} {item.unit === 'm2' ? 'm²' : 'm³'}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded font-medium ${badge.cls}`}>
                                    {badge.label}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-gray-500">
                                  {item.existingManualValue != null && (
                                    <span className="inline-flex items-center gap-1 text-green-700" title={`Manualnie: ${item.existingManualValue}`}>
                                      <Lock className="w-3 h-3" />
                                      ręczna wartość zostanie zachowana
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

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

      {/* Confirmation modal */}
      {confirmOpen && diff && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-lg mb-2">Czy na pewno?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Zostanie utworzonych <strong>{diff.totalItemsInPlan} pozycji</strong> w {diff.floors.length} kondygnacjach.
              Wszystkie wartości kierownika (ściany w m³, słupy w m³) zostaną zaktualizowane,
              a pozycje bez detalu (stropy, belki, fundamenty, biegi, szyby) będą czekać na ręczne uzupełnienie.
            </p>
            {diff.totalManualValuesPreserved > 0 && (
              <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-800 mb-4 flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>{diff.totalManualValuesPreserved}</strong> wartości ręcznych z poprzedniego importu zostanie zachowanych.
                </span>
              </div>
            )}
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
        className="bg-white rounded-xl shadow-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
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
