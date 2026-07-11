'use client'
import { useEffect, useState } from 'react'

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

/**
 * Sekcja w /settings — automatyczne powiadomienia o wygasających rezerwacjach
 * miękkich (e-mail/SMS do klienta + zadanie „Zadzwoń" na pulpicie).
 *
 * Klucze w tabeli Settings (czytane przez lib/reservation-alerts.ts):
 *  - reservationAlerts.hoursBefore / emailEnabled / smsEnabled / taskEnabled
 *  - reservationAlerts.quietStart / quietEnd (okno wysyłki SMS, czas PL)
 *  - reservationAlerts.emailSubject / emailBody / smsBody (placeholdery {imie}…)
 *  - sms.apiToken / sms.from (bramka SMSAPI.pl — czytane przez lib/sms.ts)
 *
 * Wysyłką steruje cron POST /api/public/reservations/alerts (Coolify, co 15 min).
 */

const PLACEHOLDERS = '{imie} {nazwisko} {lokal} {data} {godzina}'

export function ReservationAlertsSection() {
  const [hoursBefore, setHoursBefore] = useState('48')
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [taskEnabled, setTaskEnabled] = useState(true)
  const [quietStart, setQuietStart] = useState('8')
  const [quietEnd, setQuietEnd] = useState('20')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [smsBody, setSmsBody] = useState('')
  const [smsToken, setSmsToken] = useState('')
  const [smsFrom, setSmsFrom] = useState('')
  const [showToken, setShowToken] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState<'' | 'EMAIL' | 'SMS'>('')
  const [testResult, setTestResult] = useState('')

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings || {}
        if (s['reservationAlerts.hoursBefore']) setHoursBefore(s['reservationAlerts.hoursBefore'])
        if (s['reservationAlerts.emailEnabled']) setEmailEnabled(s['reservationAlerts.emailEnabled'] === 'true')
        if (s['reservationAlerts.smsEnabled']) setSmsEnabled(s['reservationAlerts.smsEnabled'] === 'true')
        if (s['reservationAlerts.taskEnabled']) setTaskEnabled(s['reservationAlerts.taskEnabled'] === 'true')
        if (s['reservationAlerts.quietStart']) setQuietStart(s['reservationAlerts.quietStart'])
        if (s['reservationAlerts.quietEnd']) setQuietEnd(s['reservationAlerts.quietEnd'])
        setEmailSubject(s['reservationAlerts.emailSubject'] || '')
        setEmailBody(s['reservationAlerts.emailBody'] || '')
        setSmsBody(s['reservationAlerts.smsBody'] || '')
        setSmsToken(s['sms.apiToken'] || '')
        setSmsFrom(s['sms.from'] || '')
        setLoading(false)
      })
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'reservationAlerts.hoursBefore': hoursBefore,
        'reservationAlerts.emailEnabled': String(emailEnabled),
        'reservationAlerts.smsEnabled': String(smsEnabled),
        'reservationAlerts.taskEnabled': String(taskEnabled),
        'reservationAlerts.quietStart': quietStart,
        'reservationAlerts.quietEnd': quietEnd,
        'reservationAlerts.emailSubject': emailSubject,
        'reservationAlerts.emailBody': emailBody,
        'reservationAlerts.smsBody': smsBody,
        'sms.apiToken': smsToken,
        'sms.from': smsFrom,
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function sendTest(channel: 'EMAIL' | 'SMS') {
    if (!testTo.trim()) {
      setTestResult('Podaj adres e-mail lub numer telefonu do testu.')
      return
    }
    setTesting(channel)
    setTestResult('')
    try {
      const res = await fetch('/api/settings/reservation-alerts-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, to: testTo.trim() }),
      })
      const data = await res.json()
      setTestResult(res.ok ? `✓ Wysłano test (${channel}) na ${data.to}` : `✗ ${data.error}`)
    } catch {
      setTestResult('✗ Błąd połączenia podczas testu.')
    }
    setTesting('')
  }

  // Ostrzeżenie o polskich znakach w SMS (UCS-2 skraca segment 160 → 70 znaków)
  const smsHasDiacritics = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(smsBody)
  const smsLen = smsBody.length

  if (loading) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Powiadomienia o rezerwacjach</h2>
        <p className="text-xs text-gray-500 mt-1">
          Automatyczny e-mail/SMS do klienta przed wygaśnięciem rezerwacji miękkiej + zadanie
          „Zadzwoń" na pulpicie. Wysyłką steruje cron (Coolify, co 15 min) — patrz{' '}
          <code className="bg-gray-100 px-1 rounded">docs/rezerwacje-powiadomienia-decyzje.md</code>.
        </p>
      </div>

      <div className="space-y-4">
        {/* Próg + kanały */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Wyprzedzenie (godzin przed wygaśnięciem)
            </label>
            <input
              type="number"
              min={1}
              max={720}
              value={hoursBefore}
              onChange={(e) => setHoursBefore(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kanały</label>
            <div className="flex flex-col gap-1.5 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
                E-mail do klienta
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={smsEnabled} onChange={(e) => setSmsEnabled(e.target.checked)} />
                SMS do klienta <span className="text-xs text-gray-400">(wymaga tokenu SMSAPI poniżej)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={taskEnabled} onChange={(e) => setTaskEnabled(e.target.checked)} />
                Zadanie „Zadzwoń" na pulpicie
              </label>
            </div>
          </div>
        </div>

        {/* Szablony */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Temat e-maila</label>
          <input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            className={inputCls}
            placeholder="Przypomnienie: rezerwacja lokalu {lokal} wygasa {data} o {godzina}"
          />
          <p className="text-xs text-gray-500 mt-1">
            Placeholdery: <code className="bg-gray-100 px-1 rounded">{PLACEHOLDERS}</code>. Puste pole = szablon domyślny.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Treść e-maila</label>
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            rows={6}
            className={inputCls}
            placeholder={'Dzień dobry {imie},\n\nprzypominamy, że Państwa rezerwacja lokalu {lokal} obowiązuje do {data} do godz. {godzina}...'}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Treść SMS <span className="text-gray-400 font-normal">({smsLen} znaków)</span>
          </label>
          <textarea
            value={smsBody}
            onChange={(e) => setSmsBody(e.target.value)}
            rows={3}
            maxLength={300}
            className={inputCls}
            placeholder="Przypominamy: rezerwacja lokalu {lokal} wygasa {data} o godz. {godzina}..."
          />
          {smsHasDiacritics && (
            <p className="text-xs text-amber-600 mt-1">
              ⚠ Polskie znaki skracają segment SMS ze 160 do 70 znaków (wyższy koszt) — rozważ treść bez ogonków.
            </p>
          )}
        </div>

        {/* Okno ciszy SMS */}
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SMS od godziny</label>
            <input type="number" min={0} max={23} value={quietStart} onChange={(e) => setQuietStart(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SMS do godziny</label>
            <input type="number" min={1} max={24} value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} className={inputCls} />
          </div>
        </div>
        <p className="text-xs text-gray-500 -mt-2">
          SMS-y wychodzą tylko w tym oknie (czas polski) — poza nim wysyłka czeka na kolejny przebieg crona. E-maile bez ograniczeń.
        </p>
        {Number(quietStart) >= Number(quietEnd) && (
          <p className="text-xs text-amber-600 -mt-2">
            ⚠ „Od" musi być mniejsze niż „do" — przy niepoprawnym oknie system użyje domyślnych 8–20.
          </p>
        )}

        {/* Bramka SMS */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Bramka SMS (SMSAPI.pl)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Token API</label>
              <div className="flex gap-2">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={smsToken}
                  onChange={(e) => setSmsToken(e.target.value)}
                  className={inputCls + ' font-mono text-xs'}
                  placeholder="token OAuth z panelu SMSAPI"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="text-xs px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {showToken ? 'Ukryj' : 'Pokaż'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nazwa nadawcy <span className="text-gray-400 font-normal">(opcjonalnie)</span>
              </label>
              <input
                value={smsFrom}
                onChange={(e) => setSmsFrom(e.target.value)}
                className={inputCls}
                placeholder="MARAF (zarejestrowana w panelu SMSAPI)"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Konto: <a href="https://ssl.smsapi.pl" target="_blank" rel="noopener noreferrer" className="underline">ssl.smsapi.pl</a> →
            Ustawienia API → Tokeny. Nazwę nadawcy trzeba zarejestrować (akceptacja 1-3 dni robocze); pusta = bramka testowa.
          </p>
        </div>

        {/* Test */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Wysyłka testowa</h3>
          <p className="text-xs text-gray-500 mb-2">
            Używa <strong>zapisanych</strong> szablonów (najpierw kliknij „Zapisz") i przykładowych danych klienta.
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              className={inputCls + ' flex-1 min-w-[220px]'}
              placeholder="adres e-mail lub numer telefonu"
            />
            <button
              type="button"
              onClick={() => sendTest('EMAIL')}
              disabled={testing !== ''}
              className="text-xs px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {testing === 'EMAIL' ? 'Wysyłanie…' : 'Test e-mail'}
            </button>
            <button
              type="button"
              onClick={() => sendTest('SMS')}
              disabled={testing !== ''}
              className="text-xs px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {testing === 'SMS' ? 'Wysyłanie…' : 'Test SMS'}
            </button>
          </div>
          {testResult && (
            <p className={`text-sm mt-2 ${testResult.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{testResult}</p>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? 'Zapisywanie...' : 'Zapisz powiadomienia'}
        </button>
        {saved && <span className="text-sm text-green-600">✓ Zapisano</span>}
      </div>
    </div>
  )
}
