'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Preview = {
  sheetName: string
  warnings: string[]
  counts: { stagesNew: number; stagesExisting: number; tasksNew: number; tasksExisting: number }
  stages: { number: string; name: string; status: string; plannedStart: string | null; plannedEnd: string | null }[]
  tasks: {
    number: string
    name: string
    stageNumber: string | null
    status: string
    plannedStart: string | null
    plannedEnd: string | null
    progress: number
  }[]
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pl-PL')
}

export function HarmonogramImport() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [phase, setPhase] = useState<'pick' | 'previewing' | 'preview' | 'committing' | 'done'>('pick')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function doPreview(f: File) {
    setError(null)
    setPhase('previewing')
    try {
      const form = new FormData()
      form.append('file', f)
      const res = await fetch('/api/budowa/import?mode=preview', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd podglądu')
      setPreview(data)
      setPhase('preview')
    } catch (e: any) {
      setError(e?.message || 'Nie udało się odczytać pliku')
      setPhase('pick')
    }
  }

  async function doCommit() {
    if (!file) return
    setError(null)
    setPhase('committing')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/budowa/import?mode=commit', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd importu')
      setResult(
        `Zaimportowano: ${data.stagesCreated} nowych etapów, ${data.tasksCreated} nowych zadań. ` +
          `Zaktualizowano: ${data.stagesUpdated} etapów, ${data.tasksUpdated} zadań.`,
      )
      setPhase('done')
    } catch (e: any) {
      setError(e?.message || 'Nie udało się zaimportować')
      setPhase('preview')
    }
  }

  if (phase === 'done') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 text-center">
        <div className="text-5xl mb-3">✅</div>
        <p className="text-lg font-semibold mb-2">Harmonogram zaimportowany</p>
        <p className="text-gray-500 mb-6">{result}</p>
        <button
          onClick={() => router.push('/budowa/harmonogram')}
          className="px-5 py-3 rounded-xl text-white font-semibold"
          style={{ background: '#1F2D3F' }}
        >
          Przejdź do harmonogramu — popraw terminy
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Wybór pliku */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0] || null
            setFile(f)
            setPreview(null)
            if (f) doPreview(f)
          }}
          className="block w-full text-sm"
        />
        {phase === 'previewing' && <p className="mt-3 text-amber-600 text-sm">Analizuję plik…</p>}
      </div>

      {error && <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

      {/* Podgląd */}
      {preview && phase !== 'previewing' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-3">
            Arkusz: <span className="font-mono">{preview.sheetName}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Nowe etapy" value={preview.counts.stagesNew} />
            <Stat label="Nowe zadania" value={preview.counts.tasksNew} />
            <Stat label="Istniejące etapy" value={preview.counts.stagesExisting} muted />
            <Stat label="Istniejące zadania" value={preview.counts.tasksExisting} muted />
          </div>

          {preview.warnings.length > 0 && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 text-amber-800 text-sm">
              <div className="font-semibold mb-1">Uwagi ({preview.warnings.length}):</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {preview.warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="max-h-80 overflow-auto border border-gray-100 rounded-lg">
            <table className="w-full min-w-[640px] lg:min-w-0 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Nr</th>
                  <th className="px-3 py-2 font-medium">Nazwa</th>
                  <th className="px-3 py-2 font-medium">Od</th>
                  <th className="px-3 py-2 font-medium">Do</th>
                  <th className="px-3 py-2 font-medium">Stan</th>
                </tr>
              </thead>
              <tbody>
                {preview.stages.map((s) => (
                  <tr key={'s' + s.number} className="bg-gray-50/60 border-t border-gray-100 font-semibold">
                    <td className="px-3 py-1.5 font-mono">{s.number}</td>
                    <td className="px-3 py-1.5">{s.name}</td>
                    <td className="px-3 py-1.5">{fmt(s.plannedStart)}</td>
                    <td className="px-3 py-1.5">{fmt(s.plannedEnd)}</td>
                    <td className="px-3 py-1.5">
                      <Badge status={s.status} />
                    </td>
                  </tr>
                ))}
                {preview.tasks.map((t) => (
                  <tr key={'t' + t.number} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-mono text-gray-400">{t.number}</td>
                    <td className="px-3 py-1.5">{t.name}</td>
                    <td className="px-3 py-1.5">{fmt(t.plannedStart)}</td>
                    <td className="px-3 py-1.5">{fmt(t.plannedEnd)}</td>
                    <td className="px-3 py-1.5">
                      <Badge status={t.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button
              onClick={doCommit}
              disabled={phase === 'committing'}
              className="px-5 py-3 rounded-xl text-white font-semibold disabled:opacity-60"
              style={{ background: '#1F2D3F' }}
            >
              {phase === 'committing' ? 'Importowanie…' : 'Zatwierdź import'}
            </button>
            <span className="text-sm text-gray-400">
              Istniejące pozycje zachowają Twoje ręczne poprawki terminów.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="text-xs uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-xl font-bold ${muted ? 'text-gray-400' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function Badge({ status }: { status: string }) {
  const isNew = status === 'nowy' || status === 'nowe'
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
        isNew ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {isNew ? 'nowe' : 'istnieje'}
    </span>
  )
}
