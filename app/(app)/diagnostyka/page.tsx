'use client'
import { useState } from 'react'

type Sample = { roundTripMs: number; serverMs: number }
type Proc = { uptimeSec: number; rssMB: number; node: string }
type Result = {
  ping: Sample[]
  db: Sample[]
  invoiceCount: number | null
  user: { email: string | null; admin: boolean } | null
  breakdown: { countMs: number; sampleInvoiceMs: number } | null
  proc: Proc | null
  error: string | null
}

const RUNS = 8

function avg(arr: number[]) {
  if (arr.length === 0) return 0
  return Math.round(arr.reduce((s, n) => s + n, 0) / arr.length)
}
function median(arr: number[]) {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
function fmtUptime(sec: number) {
  if (sec < 90) return `${sec} s`
  if (sec < 5400) return `${Math.round(sec / 60)} min`
  if (sec < 172800) return `${Math.round(sec / 3600)} godz.`
  return `${Math.round(sec / 86400)} dni`
}

export default function DiagnostykaPage() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [copied, setCopied] = useState(false)

  async function callDiag(mode: 'ping' | 'db'): Promise<Sample & { extra?: any }> {
    const t0 = performance.now()
    const res = await fetch(`/api/diag?mode=${mode}`, { cache: 'no-store' })
    const roundTripMs = performance.now() - t0
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
    return { roundTripMs: Math.round(roundTripMs), serverMs: data.serverMs ?? 0, extra: data }
  }

  async function run() {
    setRunning(true)
    setResult(null)
    setProgress(0)
    setCopied(false)
    const ping: Sample[] = []
    const db: Sample[] = []
    let invoiceCount: number | null = null
    let user: Result['user'] = null
    let breakdown: Result['breakdown'] = null
    let proc: Proc | null = null
    let error: string | null = null

    try {
      // Rozgrzewka (nie liczona) — pierwszy request po bezczynności bywa wolniejszy.
      await callDiag('ping').catch(() => {})

      const total = RUNS * 2
      let done = 0
      for (let i = 0; i < RUNS; i++) {
        const p = await callDiag('ping')
        ping.push({ roundTripMs: p.roundTripMs, serverMs: p.serverMs })
        done++; setProgress(Math.round((done / total) * 100))

        const d = await callDiag('db')
        db.push({ roundTripMs: d.roundTripMs, serverMs: d.serverMs })
        if (d.extra) {
          invoiceCount = d.extra.invoiceCount ?? invoiceCount
          user = d.extra.user ?? user
          breakdown = d.extra.breakdown ?? breakdown
          proc = d.extra.proc ?? proc
        }
        done++; setProgress(Math.round((done / total) * 100))
      }
    } catch (e: any) {
      error = e?.message || 'Błąd testu'
    }

    setResult({ ping, db, invoiceCount, user, breakdown, proc, error })
    setRunning(false)
  }

  // ---- Analiza ----
  const networkMs = result ? median(result.ping.map((s) => s.roundTripMs)) : 0
  const serverDbMs = result ? median(result.db.map((s) => s.serverMs)) : 0
  const fullInvoiceMs = result ? median(result.db.map((s) => s.roundTripMs)) : 0

  const networkVerdict = verdictNetwork(networkMs)
  const serverVerdict = verdictServer(serverDbMs)

  function buildSummary(): string {
    if (!result) return ''
    return [
      `Diagnostyka CRM — ${new Date().toLocaleString('pl-PL')}`,
      `Konto: ${result.user?.email ?? '?'}${result.user?.admin ? ' (admin)' : ''}`,
      `Liczba faktur w bazie: ${result.invoiceCount ?? '?'}`,
      result.proc ? `Serwer działa od: ${fmtUptime(result.proc.uptimeSec)} · pamięć: ${result.proc.rssMB} MB · Node ${result.proc.node}` : '',
      ``,
      `Łącze (ping, mediana): ${networkMs} ms — ${networkVerdict.label}`,
      `Serwer/baza (mediana): ${serverDbMs} ms — ${serverVerdict.label}`,
      `Pełne pobranie faktury (mediana): ${fullInvoiceMs} ms`,
      result.breakdown
        ? `  • count faktur: ${result.breakdown.countMs} ms, pobranie 1 faktury: ${result.breakdown.sampleInvoiceMs} ms`
        : '',
      ``,
      `Próby ping (round-trip ms): ${result.ping.map((s) => s.roundTripMs).join(', ')}`,
      `Próby faktura (round-trip ms): ${result.db.map((s) => s.roundTripMs).join(', ')}`,
      result.error ? `BŁĄD: ${result.error}` : '',
    ].filter(Boolean).join('\n')
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildSummary())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Diagnostyka wydajności</h1>
      <p className="text-gray-500 text-sm mt-1 mb-6">
        Test sprawdza, gdzie jest wolno: w <strong>łączu internetowym</strong>, na <strong>serwerze/bazie</strong>,
        czy w <strong>przeglądarce/komputerze</strong>. Kliknij „Uruchom test" — potrwa kilka sekund.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-3">
          <button
            onClick={run}
            disabled={running}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium"
          >
            {running ? `Testowanie… ${progress}%` : 'Uruchom test'}
          </button>
          {running && (
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Wskazówka: jeśli podejrzewasz konkretny komputer/łącze — uruchom ten sam test na innym urządzeniu
          (np. telefon na danych komórkowych) i porównaj wyniki.
        </p>
      </div>

      {result && !result.error && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <MetricCard
              title="Łącze internetowe"
              value={`${networkMs} ms`}
              sub="czas dotarcia do serwera i z powrotem"
              tone={networkVerdict.tone}
              verdict={networkVerdict.label}
            />
            <MetricCard
              title="Serwer / baza danych"
              value={`${serverDbMs} ms`}
              sub="czas pracy serwera (bez sieci)"
              tone={serverVerdict.tone}
              verdict={serverVerdict.label}
            />
            <MetricCard
              title="Pełne otwarcie faktury"
              value={`${fullInvoiceMs} ms`}
              sub="łącze + serwer razem"
              tone={fullInvoiceMs > 1500 ? 'bad' : fullInvoiceMs > 700 ? 'warn' : 'good'}
              verdict={fullInvoiceMs > 1500 ? 'wolno' : fullInvoiceMs > 700 ? 'średnio' : 'szybko'}
            />
          </div>

          {result.proc && result.proc.uptimeSec < 180 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4 text-sm text-amber-800">
              ⚠️ Serwer uruchomił się <strong>{fmtUptime(result.proc.uptimeSec)} temu</strong>. Pierwsze wejścia tuż po
              restarcie/aktualizacji systemu są wolniejsze (kilka–kilkanaście sekund) — to normalne i mija po chwili.
              Jeśli wolne wejścia powtarzają się <em>mimo długiego czasu pracy serwera</em>, to znak realnego problemu (zasoby/baza).
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
            <h2 className="font-semibold text-gray-900 mb-2">Wniosek</h2>
            <p className="text-sm text-gray-700 leading-relaxed">{conclusion(networkMs, serverDbMs, fullInvoiceMs)}</p>
            <div className="mt-3 text-xs text-gray-500 space-y-0.5">
              <p>Konto: <strong>{result.user?.email}</strong>{result.user?.admin ? ' (administrator)' : ''}</p>
              <p>Faktur w bazie: <strong>{result.invoiceCount}</strong></p>
              {result.proc && (
                <p>
                  Serwer działa od: <strong>{fmtUptime(result.proc.uptimeSec)}</strong> · pamięć procesu:{' '}
                  <strong>{result.proc.rssMB} MB</strong> · Node {result.proc.node}
                </p>
              )}
              {result.breakdown && (
                <p>Rozkład serwera: liczenie faktur {result.breakdown.countMs} ms · pobranie 1 faktury {result.breakdown.sampleInvoiceMs} ms</p>
              )}
            </div>
            <button
              onClick={copy}
              className="mt-4 text-sm border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium text-gray-700"
            >
              {copied ? 'Skopiowano ✓' : 'Kopiuj wyniki (do wysłania)'}
            </button>
          </div>

          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-gray-500">Szczegółowe pomiary</summary>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <SampleList title="Ping (round-trip ms)" samples={result.ping.map((s) => s.roundTripMs)} />
              <SampleList title="Faktura (round-trip ms)" samples={result.db.map((s) => s.roundTripMs)} />
            </div>
          </details>
        </>
      )}

      {result?.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-6 text-sm text-red-700">
          Test napotkał błąd: {result.error}
        </div>
      )}
    </div>
  )
}

function MetricCard({ title, value, sub, tone, verdict }: {
  title: string; value: string; sub: string; tone: 'good' | 'warn' | 'bad'; verdict: string
}) {
  const map = {
    good: 'bg-green-50 border-green-200 text-green-700',
    warn: 'bg-amber-50 border-amber-200 text-amber-700',
    bad: 'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${map[tone]}`}>
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
      <p className="text-xs font-medium mt-0.5">{verdict}</p>
      <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
    </div>
  )
}

function SampleList({ title, samples }: { title: string; samples: number[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{title}</p>
      <p className="text-xs text-gray-600 tabular-nums">{samples.join(', ')}</p>
    </div>
  )
}

function verdictNetwork(ms: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (ms < 120) return { label: 'szybkie', tone: 'good' }
  if (ms < 350) return { label: 'średnie', tone: 'warn' }
  return { label: 'wolne', tone: 'bad' }
}
function verdictServer(ms: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (ms < 200) return { label: 'szybki', tone: 'good' }
  if (ms < 600) return { label: 'średni', tone: 'warn' }
  return { label: 'obciążony', tone: 'bad' }
}

function conclusion(network: number, server: number, full: number): string {
  const netBad = network >= 350
  const netWarn = network >= 120
  const srvBad = server >= 600
  const srvWarn = server >= 200

  if (srvBad && !netBad) {
    return 'Najwięcej czasu zajmuje serwer/baza danych, a łącze jest w porządku. To wskazuje na obciążenie serwera lub bazy (np. dużo danych, równoległy import) — nie na Twój komputer ani internet. Warto zgłosić to administratorowi.'
  }
  if (netBad && !srvBad) {
    return 'Najwięcej czasu zajmuje przesył przez internet, a serwer odpowiada szybko. To wskazuje na wolne łącze internetowe lub słaby sygnał WiFi po Twojej stronie — nie na sam system. Spróbuj kabla zamiast WiFi albo innego łącza.'
  }
  if (netBad && srvBad) {
    return 'Wolne są oba elementy — i łącze, i serwer. Sprawdź najpierw internet (kabel/inne łącze), a jeśli to nie pomoże, zgłoś administratorowi obciążenie serwera.'
  }
  if (!netWarn && !srvWarn && full < 700) {
    return 'Wszystko działa szybko — łącze i serwer odpowiadają sprawnie. Jeśli mimo to system „muli" przy klikaniu, przyczyną jest najpewniej sam komputer/przeglądarka (np. stara wersja strony w pamięci — pomaga Ctrl+Shift+R) albo bardzo dużo otwartych kart.'
  }
  return 'Wyniki są w normie lub lekko podwyższone. Jeśli odczuwasz spowolnienie, najczęstsze przyczyny to: chwilowe obciążenie serwera, słabszy sygnał WiFi, albo stara wersja strony w cache przeglądarki (odśwież Ctrl+Shift+R).'
}
