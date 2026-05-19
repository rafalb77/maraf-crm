'use client'
import { useEffect, useState } from 'react'

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

/**
 * Sekcja w /settings — konfiguracja integracji z 3D Estate (matryca 3D).
 *
 * Pola w tabeli Settings:
 *  - threeDEstateApiKey     — klucz, który 3DE wysyła w nagłówku X-API-Key
 *  - threeDEstateAllowedIp  — opcjonalny IP whitelist (3DE stałe IP: 213.189.56.203)
 *  - prospektInformacyjnyUrl — URL do PDF z prospektem (jeden dla inwestycji)
 *
 * Patrz: docs/integracja-3destate-decyzje.md.
 */
export function IntegrationsSection() {
  const [apiKey, setApiKey] = useState<string>('')
  const [allowedIp, setAllowedIp] = useState<string>('')
  const [prospektUrl, setProspektUrl] = useState<string>('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState<string>('')

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin)
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings || {}
        setApiKey(s.threeDEstateApiKey || '')
        setAllowedIp(s.threeDEstateAllowedIp || '')
        setProspektUrl(s.prospektInformacyjnyUrl || '')
        setLoading(false)
      })
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threeDEstateApiKey: apiKey,
        threeDEstateAllowedIp: allowedIp,
        prospektInformacyjnyUrl: prospektUrl,
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function generateKey() {
    const res = await fetch('/api/integrations/3destate/generate-key', { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setApiKey(data.key)
      setShowKey(true)
    }
  }

  async function copyKey() {
    if (!apiKey) return
    await navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const endpointUrl = origin ? `${origin}/api/integrations/3destate/units` : '/api/integrations/3destate/units'
  const maskedKey = apiKey ? apiKey.slice(0, 8) + '…' + apiKey.slice(-4) : ''

  if (loading) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Integracja z 3D Estate (matryca 3D)</h2>
        <p className="text-xs text-gray-500 mt-1">
          3D Estate odpytuje nasz endpoint co 15-30 min i pobiera aktualne ceny + statusy lokali.
          Patrz <code className="bg-gray-100 px-1 rounded">docs/integracja-3destate-decyzje.md</code>.
        </p>
      </div>

      <div className="space-y-4">
        {/* Endpoint URL — copy-paste do przekazania 3DE */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL endpointu (przekaż do 3DE)
          </label>
          <input value={endpointUrl} readOnly className={inputCls + ' bg-gray-50 font-mono text-xs'} />
        </div>

        {/* API key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Klucz API <span className="text-gray-400 font-normal">(nagłówek X-API-Key)</span>
          </label>
          {apiKey ? (
            <div className="flex gap-2 flex-wrap">
              <input
                value={showKey ? apiKey : maskedKey}
                readOnly
                className={inputCls + ' flex-1 min-w-[280px] font-mono text-xs bg-gray-50'}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="text-xs px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {showKey ? 'Ukryj' : 'Pokaż'}
              </button>
              <button
                type="button"
                onClick={copyKey}
                className="text-xs px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {copied ? '✓ Skopiowano' : 'Kopiuj'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Wygenerować nowy klucz? Aktualny przestanie działać — 3DE dostanie 401 do czasu otrzymania nowego.')) {
                    generateKey()
                  }
                }}
                className="text-xs px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
              >
                Zrotuj klucz
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Brak klucza — endpoint wyłączony.</span>
              <button
                type="button"
                onClick={generateKey}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-2 rounded-lg font-medium transition-colors"
              >
                Wygeneruj klucz
              </button>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Klucz przekaż 3DE bezpiecznym kanałem (nie mailem otwartym tekstem — np. zaszyfrowany załącznik lub SMS).
          </p>
        </div>

        {/* Allowed IP */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dozwolone IP <span className="text-gray-400 font-normal">(opcjonalnie)</span>
          </label>
          <input
            value={allowedIp}
            onChange={(e) => setAllowedIp(e.target.value)}
            className={inputCls + ' font-mono text-xs'}
            placeholder="213.189.56.203 (stałe IP 3DE — można zostawić puste)"
          />
          <p className="text-xs text-gray-500 mt-1">
            Jeśli wypełnione, endpoint odrzuca requesty z innych IP. 3DE deklaruje stałe IP <code>213.189.56.203</code>.
            Zostaw puste żeby polegać tylko na kluczu API (prostsze, ale mniej warstw obrony).
          </p>
        </div>

        {/* Prospekt URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL prospektu informacyjnego (PDF)
          </label>
          <input
            value={prospektUrl}
            onChange={(e) => setProspektUrl(e.target.value)}
            className={inputCls}
            placeholder="/uploads/prospekt.pdf lub https://novastaffa.pl/prospekt.pdf"
          />
          <p className="text-xs text-gray-500 mt-1">
            Jeden plik dla całej inwestycji — wgraj go do <code>public/uploads/</code> (np. przez Coolify) i wklej tu względny path.
            Endpoint zwraca pełny URL do każdego lokalu.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? 'Zapisywanie...' : 'Zapisz integrację'}
        </button>
        {saved && <span className="text-sm text-green-600">✓ Zapisano</span>}
      </div>
    </div>
  )
}
