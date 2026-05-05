'use client'
import { useState, useEffect } from 'react'

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function SettingsForm() {
  const [settings, setSettings] = useState<Record<string, string>>({
    companyName: '',
    investmentName: '',
    emailSignature: '',
    bankAccount: '',
    smtpHost: '',
    smtpPort: '587',
    smtpSecure: 'false',
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    smtpFromName: '',
    smtpAllowSelfSigned: 'false',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // SMTP test state
  const [showPass, setShowPass] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; log?: string[]; code?: string; command?: string; response?: string } | null>(null)
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings || {}
        setSettings({
          companyName: s.companyName || '',
          investmentName: s.investmentName || '',
          emailSignature: s.emailSignature || '',
          bankAccount: s.bankAccount || '',
          smtpHost: s.smtpHost || '',
          smtpPort: s.smtpPort || '587',
          smtpSecure: s.smtpSecure || 'false',
          smtpUser: s.smtpUser || '',
          smtpPass: s.smtpPass || '',
          smtpFrom: s.smtpFrom || '',
          smtpFromName: s.smtpFromName || '',
          smtpAllowSelfSigned: s.smtpAllowSelfSigned || 'false',
        })
        setLoading(false)
      })
  }, [])

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

  function presetHomePl() {
    setSettings((s) => ({
      ...s,
      smtpHost: 'maraf.home.pl',
      smtpPort: '465',
      smtpSecure: 'true',
      smtpAllowSelfSigned: 'true',
    }))
  }

  async function sendTest() {
    if (!testEmail) return
    setTesting(true)
    setTestResult(null)
    // Save first to ensure server reads current values
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    const res = await fetch('/api/mailing/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: testEmail }),
    })
    const data = await res.json()
    setTesting(false)
    if (res.ok) setTestResult({ ok: true, msg: `Wysłano test na ${testEmail}`, log: data.log })
    else setTestResult({
      ok: false,
      msg: data.error || 'Błąd wysyłki',
      log: data.log,
      code: data.code,
      command: data.command,
      response: data.response,
    })
    setShowLog(false)
  }

  if (loading) return null

  return (
    <div className="space-y-5">
      {/* Company / investment */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Dane firmy i inwestycji</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa firmy</label>
            <input value={settings.companyName}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              className={inputCls} placeholder="np. MARAF Development Sp. z o.o." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa inwestycji</label>
            <input value={settings.investmentName}
              onChange={(e) => setSettings({ ...settings, investmentName: e.target.value })}
              className={inputCls} placeholder="np. Nova Staffa" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Numer konta bankowego (na umowę)</label>
            <input value={settings.bankAccount}
              onChange={(e) => setSettings({ ...settings, bankAccount: e.target.value })}
              className={inputCls} placeholder="12 3456 7890 1234 5678 9012 3456" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stopka emaili</label>
            <textarea value={settings.emailSignature}
              onChange={(e) => setSettings({ ...settings, emailSignature: e.target.value })}
              rows={4}
              className={inputCls + ' resize-none'}
              placeholder="Pozdrawiam,&#10;Jan Kowalski&#10;Dział sprzedaży" />
          </div>
        </div>
      </div>

      {/* SMTP */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Serwer poczty (SMTP)</h2>
            <p className="text-xs text-gray-500 mt-1">Konfiguracja używana przy wysyłce mailingu i powiadomień.</p>
          </div>
          <button type="button" onClick={presetHomePl}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Użyj presetu home.pl
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Host SMTP</label>
            <input value={settings.smtpHost}
              onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
              className={inputCls} placeholder="smtp.home.pl" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
            <input type="number" value={settings.smtpPort}
              onChange={(e) => setSettings({ ...settings, smtpPort: e.target.value })}
              className={inputCls} placeholder="465" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Szyfrowanie</label>
            <select value={settings.smtpSecure}
              onChange={(e) => setSettings({ ...settings, smtpSecure: e.target.value })}
              className={inputCls + ' bg-white'}>
              <option value="true">SSL (port 465)</option>
              <option value="false">STARTTLS (port 587)</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Login (pełny adres email)</label>
            <input value={settings.smtpUser}
              onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
              className={inputCls} placeholder="biuro@novastaffa.pl" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasło</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={settings.smtpPass}
                onChange={(e) => setSettings({ ...settings, smtpPass: e.target.value })}
                className={inputCls + ' pr-20'} placeholder="••••••••" autoComplete="new-password" />
              <button type="button" onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-700 px-2 py-1">
                {showPass ? 'Ukryj' : 'Pokaż'}
              </button>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Adres nadawcy (From)</label>
            <input value={settings.smtpFrom}
              onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value })}
              className={inputCls} placeholder="biuro@novastaffa.pl" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa nadawcy</label>
            <input value={settings.smtpFromName}
              onChange={(e) => setSettings({ ...settings, smtpFromName: e.target.value })}
              className={inputCls} placeholder="Nova Staffa" />
          </div>
          <div className="col-span-2">
            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox"
                checked={settings.smtpAllowSelfSigned === 'true'}
                onChange={(e) => setSettings({ ...settings, smtpAllowSelfSigned: e.target.checked ? 'true' : 'false' })}
                className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span>
                Ignoruj błędy certyfikatu TLS
                <span className="block text-xs text-gray-500 mt-0.5">
                  Włącz, jeśli serwer SMTP używa self-signed certyfikatu (np. home.pl). Komunikat „self-signed certificate in certificate chain" zniknie po zaznaczeniu.
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Test */}
        <div className="mt-5 pt-5 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-2">Wyślij test maila</p>
          <div className="flex gap-2 flex-wrap">
            <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
              className={inputCls + ' flex-1 min-w-[200px]'} placeholder="adres@testowy.pl" />
            <button type="button" onClick={sendTest} disabled={testing || !testEmail}
              className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              {testing ? 'Wysyłanie...' : 'Wyślij test'}
            </button>
          </div>
          {testResult && (
            <div className="mt-2 space-y-2">
              <p className={`text-sm ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
              </p>
              {!testResult.ok && (testResult.code || testResult.command || testResult.response) && (
                <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 font-mono space-y-0.5">
                  {testResult.code && <div>code: {testResult.code}</div>}
                  {testResult.command && <div>command: {testResult.command}</div>}
                  {testResult.response && <div>response: {testResult.response}</div>}
                </div>
              )}
              {testResult.log && testResult.log.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowLog((v) => !v)}
                    className="text-xs text-blue-600 hover:text-blue-700 underline"
                  >
                    {showLog ? 'Ukryj log SMTP' : `Pokaż log SMTP (${testResult.log.length} linii)`}
                  </button>
                  {showLog && (
                    <pre className="mt-2 text-[11px] bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto max-h-80 leading-relaxed">
                      {testResult.log.join('\n')}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
          {saving ? 'Zapisywanie...' : 'Zapisz ustawienia'}
        </button>
        {saved && <span className="text-sm text-green-600">✓ Zapisano</span>}
      </div>
    </div>
  )
}
