'use client'
import { useState, useEffect } from 'react'
import { DANE_GOV_SETTING_FIELDS, type DaneGovField } from '@/lib/dane-gov-fields'

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

type Snapshot = { date: string; md5: string; rowCount: number; createdAt: string }
type Preview = { date: string; lines: string[] } | null

const GROUPS: DaneGovField['group'][] = ['Deweloper', 'Biuro sprzedaży', 'Inwestycja']

export function DaneGovPanel() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [preview, setPreview] = useState<Preview>(null)
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings || {}
        const init: Record<string, string> = {}
        for (const f of DANE_GOV_SETTING_FIELDS) init[f.key] = s[f.key] || ''
        setSettings(init)
        setLoading(false)
      })
    loadSnapshots()
  }, [])

  function loadSnapshots() {
    fetch('/api/settings/dane-gov')
      .then((r) => r.json())
      .then((data) => {
        setSnapshots(data.snapshots || [])
        setPreview(data.preview || null)
      })
  }

  async function save() {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function generateNow() {
    setGenerating(true)
    setGenResult(null)
    const res = await fetch('/api/settings/dane-gov', { method: 'POST' })
    const data = await res.json()
    setGenerating(false)
    if (res.ok) {
      setGenResult(`✓ Wygenerowano snapshot ${data.date} — ${data.rowCount} lokali w ofercie`)
      loadSnapshots()
    } else {
      setGenResult(`✗ ${data.error || 'Błąd generowania'}`)
    }
  }

  if (loading) return null

  const missing = DANE_GOV_SETTING_FIELDS.filter((f) => !settings[f.key]?.trim())

  return (
    <div className="space-y-5">
      {/* Snapshoty + harvester */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Publikacja danych</h2>
        <p className="text-xs text-gray-500 mb-4">
          dane.gov.pl pobiera dane automatycznie (harvester). Zarejestruj raz adres katalogu
          mailem na <span className="font-mono">kontakt@dane.gov.pl</span>, dalej cron generuje
          dzienne pliki sam.
        </p>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-500 w-32 shrink-0">Katalog (rejestracja):</span>
            <a href="/api/public/dane-gov/catalog" target="_blank" rel="noopener noreferrer"
              className="font-mono text-blue-600 hover:text-blue-700 break-all">
              /api/public/dane-gov/catalog
            </a>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-500 w-32 shrink-0">Plik dzienny:</span>
            <span className="font-mono text-gray-600 break-all">
              /api/public/dane-gov/file/&lt;data&gt;.csv (+ .csv.md5)
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3 flex-wrap">
          <button onClick={generateNow} disabled={generating}
            className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {generating ? 'Generowanie...' : 'Generuj snapshot na dziś'}
          </button>
          {genResult && (
            <span className={genResult.startsWith('✓') ? 'text-sm text-green-600' : 'text-sm text-red-600'}>
              {genResult}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          W produkcji snapshot generuje cron (Coolify scheduled task → POST /api/public/dane-gov/snapshot).
        </p>

        {snapshots.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-2">Ostatnie snapshoty ({snapshots.length})</p>
            <div className="max-h-48 overflow-auto border border-gray-100 rounded-lg">
              <table className="w-full min-w-[480px] lg:min-w-0 text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">Data</th>
                    <th className="text-right px-3 py-1.5 font-medium">Lokali</th>
                    <th className="text-left px-3 py-1.5 font-medium">MD5</th>
                    <th className="text-left px-3 py-1.5 font-medium">Plik</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.date} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-mono">{s.date}</td>
                      <td className="px-3 py-1.5 text-right">{s.rowCount}</td>
                      <td className="px-3 py-1.5 font-mono text-gray-400">{s.md5.slice(0, 12)}…</td>
                      <td className="px-3 py-1.5">
                        <a href={`/api/public/dane-gov/file/${s.date}.csv`} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700">CSV</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {preview && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-2">Podgląd snapshotu {preview.date}</p>
            <pre className="text-[11px] bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto max-h-64 leading-relaxed">
              {preview.lines.join('\n')}
            </pre>
          </div>
        )}
      </div>

      {/* Dane dewelopera / inwestycji */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Dane do raportu</h2>
        <p className="text-xs text-gray-500 mb-4">
          Stałe dane dewelopera, biura sprzedaży i inwestycji — trafiają do każdego wiersza raportu.
          Dane lokali (ceny, metraż, status) brane są automatycznie z modułu Lokale.
        </p>

        {missing.length > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
            Niewypełnione pola ({missing.length}) trafią do raportu jako <span className="font-mono">X</span>.
            Uzupełnij komplet przed rejestracją u ministerstwa.
          </div>
        )}

        <div className="space-y-6">
          {GROUPS.map((group) => (
            <div key={group}>
              <h3 className="text-sm font-semibold text-gray-600 mb-3">{group}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DANE_GOV_SETTING_FIELDS.filter((f) => f.group === group).map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                    <input
                      value={settings[f.key] || ''}
                      onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                      className={inputCls}
                      placeholder={f.placeholder || ''}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button onClick={save} disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Zapisywanie...' : 'Zapisz dane'}
          </button>
          {saved && <span className="text-sm text-green-600">✓ Zapisano</span>}
        </div>
      </div>
    </div>
  )
}
