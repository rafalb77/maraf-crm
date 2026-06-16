'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Props = {
  company: string
  companyLabel: string
  nip: string
  hasToken: boolean
  tokenMasked: string | null
  environment: string
  enabled: boolean
  syncFromDate: string
  lastSyncAt: string | null
  lastSyncStatus: string
  lastSyncError: string | null
  lastSyncCount: number | null
}

export function KsefConfigCard(p: Props) {
  const router = useRouter()
  const [nip, setNip] = useState(p.nip)
  const [token, setToken] = useState('')
  const [environment, setEnvironment] = useState(p.environment)
  const [enabled, setEnabled] = useState(p.enabled)
  const [syncFromDate, setSyncFromDate] = useState(p.syncFromDate)
  const [editingToken, setEditingToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true); setError(null); setMsg(null)
    try {
      const body: any = { nip, environment, enabled, syncFromDate: syncFromDate || null }
      if (editingToken && token.trim()) body.token = token.trim()
      const r = await fetch(`/api/finanse/ksef/config/${p.company}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Blad'); return }
      setMsg('Zapisano')
      setToken(''); setEditingToken(false)
      router.refresh()
    } catch (e: any) { setError(e.message || 'Blad sieci') } finally { setSaving(false) }
  }

  async function sync(full = false) {
    const prompt = full
      ? `Pełna synchronizacja KSeF dla ${p.companyLabel}?\n\nPobierze ponownie cały zakres od daty startu i uzupełni pełne dane (pozycje, dane podmiotów) oraz status opłacenia dla już pobranych faktur. Może chwilę potrwać.`
      : `Uruchomić synchronizację KSeF dla ${p.companyLabel}?`
    if (!confirm(prompt)) return
    setSyncing(true); setError(null); setMsg(null)
    try {
      const r = await fetch(`/api/finanse/ksef/sync/${p.company}${full ? '?full=1' : ''}`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error || 'Blad')
        router.refresh()
        return
      }
      setMsg(`Zsynchronizowano ${data.count} ${full ? '(pełna synchronizacja)' : ''}`)
      router.refresh()
    } catch (e: any) { setError(e.message || 'Blad sieci') } finally { setSyncing(false) }
  }

  const isMD = p.company === 'MARAF_DEVELOPMENT'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6"
      style={isMD ? { borderColor: '#e9d5ff', backgroundColor: '#faf5ff' } : {}}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{p.companyLabel}</h2>
        <div className="flex items-center gap-2">
          {enabled ? (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Aktywny</span>
          ) : (
            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Wyłączony</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">NIP</label>
          <input value={nip} onChange={(e) => setNip(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Środowisko</label>
          <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="PROD">Produkcja (ksef.podatki.gov.pl)</option>
            <option value="TEST">Test</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Token KSeF</label>
          {p.hasToken && !editingToken ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">{p.tokenMasked}</code>
              <button onClick={() => setEditingToken(true)} className="text-sm text-blue-600 hover:text-blue-800 px-3">Zmień</button>
            </div>
          ) : (
            <input
              type="password"
              value={token}
              onChange={(e) => { setToken(e.target.value); setEditingToken(true) }}
              placeholder={p.hasToken ? 'Wpisz nowy token (zostawi stary jeśli puste)' : 'Wklej token z ksef.podatki.gov.pl'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            />
          )}
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Pobierz faktury od</label>
          <input type="date" value={syncFromDate} onChange={(e) => setSyncFromDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Aktywny (gotowy do synchronizacji)
          </label>
        </div>
      </div>

      {p.lastSyncAt && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Ostatnia synchronizacja</p>
          <p className="text-gray-800">
            {new Date(p.lastSyncAt).toLocaleString('pl-PL')}
            {' • '}
            <span className={p.lastSyncStatus === 'OK' ? 'text-green-700' : p.lastSyncStatus === 'ERROR' ? 'text-red-700' : 'text-gray-500'}>
              {p.lastSyncStatus}
            </span>
            {p.lastSyncCount !== null && <span> • {p.lastSyncCount} faktur</span>}
          </p>
          {p.lastSyncError && <p className="text-xs text-red-600 mt-1">{p.lastSyncError}</p>}
        </div>
      )}

      {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-2 mb-3">{msg}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">{error}</p>}

      <div className="flex gap-2 pt-3 border-t border-gray-100">
        <button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? 'Zapisuję...' : 'Zapisz konfigurację'}
        </button>
        <button onClick={() => sync(false)} disabled={syncing || !enabled || !p.hasToken} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {syncing ? 'Synchronizuję...' : 'Synchronizuj teraz'}
        </button>
        <button onClick={() => sync(true)} disabled={syncing || !enabled || !p.hasToken} title="Pobiera ponownie cały zakres od daty startu — uzupełnia dane i status opłacenia już pobranych faktur" className="bg-white border border-purple-300 text-purple-700 hover:bg-purple-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          Pełna synchronizacja
        </button>
      </div>
    </div>
  )
}
