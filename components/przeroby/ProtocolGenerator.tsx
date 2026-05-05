'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  summaryId: string
  floor: string
  scopeId: string
  ready: number
  total: number
}

export function ProtocolGenerator({ summaryId, floor, ready, total }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allReady = ready === total

  return (
    <div className={`mb-6 rounded-xl border p-4 ${allReady ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold ${allReady ? 'text-green-800' : 'text-amber-800'}`}>
            {allReady
              ? '✓ Wszystkie pozycje gotowe — możesz utworzyć protokół na bazie tego podsumowania'
              : `Gotowych ${ready} z ${total} pozycji. Pozostałe wymagają uzupełnienia (ręcznej wartości lub akceptacji różnicy).`}
          </p>
          <p className={`text-xs mt-1 ${allReady ? 'text-green-700' : 'text-amber-700'}`}>
            Po utworzeniu szkicu protokołu pozycje umowne (kosztorysu) zostaną wypełnione na podstawie ilości z podsumowania kierownika.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${allReady ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'}`}
        >
          {open ? 'Anuluj' : '→ Utwórz protokół'}
        </button>
      </div>

      {open && (
        <ProtocolGeneratorForm
          summaryId={summaryId}
          floor={floor}
          busy={busy}
          setBusy={setBusy}
          error={error}
          setError={setError}
          onCreated={(id) => router.push(`/przeroby/protokoly/${id}`)}
        />
      )}
    </div>
  )
}

function ProtocolGeneratorForm({
  summaryId,
  floor,
  busy,
  setBusy,
  error,
  setError,
  onCreated,
}: {
  summaryId: string
  floor: string
  busy: boolean
  setBusy: (v: boolean) => void
  error: string | null
  setError: (s: string | null) => void
  onCreated: (id: string) => void
}) {
  const [contracts, setContracts] = useState<{ id: string; title: string; subName: string }[]>([])
  const [contractId, setContractId] = useState('')
  const [number, setNumber] = useState('')
  const now = new Date()
  const [periodFrom, setPeriodFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
  const [periodTo, setPeriodTo] = useState(now.toISOString().slice(0, 10))
  const [loaded, setLoaded] = useState(false)

  // Lazy-load umów po pierwszym otwarciu
  if (!loaded) {
    setLoaded(true)
    fetch('/api/przeroby/contracts')
      .then((r) => r.json())
      .then((data) => {
        setContracts(data || [])
        if (data?.[0]) setContractId(data[0].id)
      })
      .catch(() => {})
  }

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/przeroby/protocols/from-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summaryId,
          contractId,
          number: number || null,
          periodFrom,
          periodTo,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd')
      onCreated(data.id)
    } catch (e: any) {
      setError(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="mt-4 pt-4 border-t border-amber-200/60 grid grid-cols-1 lg:grid-cols-4 gap-3" onClick={(e) => e.stopPropagation()}>
      <div className="lg:col-span-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">Umowa z podwykonawcą</label>
        {contracts.length === 0 ? (
          <p className="text-xs text-gray-500 py-2">
            Ładuję... (jeśli brak umów, dodaj podwykonawcę i umowę najpierw)
          </p>
        ) : (
          <select
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>{c.subName} · {c.title}</option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Okres od</label>
        <input
          type="date"
          value={periodFrom}
          onChange={(e) => setPeriodFrom(e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Okres do</label>
        <input
          type="date"
          value={periodTo}
          onChange={(e) => setPeriodTo(e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Numer (opcjonalnie)</label>
        <input
          type="text"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="np. 8"
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="lg:col-span-3 flex items-end gap-2">
        <button
          onClick={generate}
          disabled={busy || !contractId}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          {busy ? 'Tworzę...' : `📋 Utwórz szkic protokołu (${floor})`}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
