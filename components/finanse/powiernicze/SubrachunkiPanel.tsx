'use client'
import { useEffect, useMemo, useState } from 'react'

type Row = {
  contractId: string
  number: string
  investmentName: string
  buyers: string[]
  escrowSubaccount: string | null
  unitNumbers: string[]
  unitSubaccounts: string[]
  paymentsTotal: number
  paymentsPaid: number
}

// Subrachunki OMRP nabywcow. ING nadaje kazdemu nabywcy indywidualny numer
// rachunku powierniczego — wpisany tutaj daje PEWNE dopasowanie wplat z
// wyciagu (sygnal decydujacy), niezaleznie od tytulu przelewu.
export function SubrachunkiPanel({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/finanse/powiernicze/subaccounts')
      .then((r) => r.json())
      .then((d) => { if (alive) { Array.isArray(d) ? setRows(d) : setError(d.error || 'Błąd pobierania') } })
      .catch((e) => { if (alive) setError(e.message || 'Błąd sieci') })
    return () => { alive = false }
  }, [refreshKey])

  const filtered = useMemo(() => {
    if (!rows) return null
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) =>
      r.number.toLowerCase().includes(needle) ||
      r.investmentName.toLowerCase().includes(needle) ||
      r.buyers.some((b) => b.toLowerCase().includes(needle)) ||
      r.unitNumbers.some((u) => u.toLowerCase().includes(needle))
    )
  }, [rows, q])

  const missing = rows ? rows.filter((r) => !r.escrowSubaccount && r.unitSubaccounts.length === 0).length : 0

  return (
    <div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 text-sm text-blue-900">
        <p className="font-medium">Indywidualne subrachunki OMRP (rachunki wirtualne ING)</p>
        <p className="text-blue-800 mt-1">
          Numer rachunku wirtualnego jest przypisany do <strong>lokalu</strong> (edycja na karcie lokalu lub
          hurtowo skryptem) — umowa dziedziczy go automatycznie. Pole poniżej to ręczne <strong>nadpisanie
          na umowie</strong> (używaj tylko w nietypowych przypadkach). Numer daje <strong>pewne</strong> dopasowanie
          wpłat z wyciągu, nawet przy pustym tytule przelewu. Format dowolny — spacje/myślniki ignorowane.
          {missing > 0 && <> Bez żadnego numeru: <strong>{missing}</strong> {missing === 1 ? 'umowa' : 'umów'} — dopasowanie działa wtedy po numerze umowy / nazwisku / kwocie.</>}
        </p>
      </div>

      <div className="mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Szukaj: nabywca, nr umowy, inwestycja..."
          className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {!rows && !error && <p className="text-sm text-gray-400">Ładowanie…</p>}

      {filtered && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px] lg:min-w-0">
              <thead className="bg-gray-50 border-b border-gray-200 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-700">Nabywca</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Umowa</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Lokal</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Inwestycja</th>
                  <th className="px-4 py-3 font-medium text-gray-700 text-right" title="Raty opłacone / wszystkie">Raty</th>
                  <th className="px-4 py-3 font-medium text-gray-700 w-[340px]" title="Numer dziedziczony z lokalu; pole = ręczne nadpisanie na umowie">Subrachunek OMRP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {q ? 'Brak umów pasujących do wyszukiwania.' : 'Brak umów.'}
                  </td></tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.contractId} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.buyers.join(', ') || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{r.number}</td>
                    <td className="px-4 py-2.5 text-gray-700">{r.unitNumbers.join(', ') || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.investmentName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{r.paymentsTotal > 0 ? `${r.paymentsPaid}/${r.paymentsTotal}` : '—'}</td>
                    <td className="px-4 py-2.5">
                      <SubaccountInput
                        contractId={r.contractId}
                        initial={r.escrowSubaccount}
                        onSaved={(v) => setRows((rs) => rs!.map((x) => x.contractId === r.contractId ? { ...x, escrowSubaccount: v } : x))}
                      />
                      {!r.escrowSubaccount && r.unitSubaccounts.length > 0 && (
                        <p className="text-[11px] text-green-700 mt-1">✓ z lokalu: <span className="font-mono tabular-nums">{r.unitSubaccounts.join(', ')}</span></p>
                      )}
                      {r.escrowSubaccount && r.unitSubaccounts.length > 0 && (
                        <p className="text-[11px] text-gray-400 mt-1" title="Nadpisanie na umowie ma pierwszeństwo przy dopasowaniu (oba numery są rozpoznawane)">lokal ma: <span className="font-mono tabular-nums">{r.unitSubaccounts.join(', ')}</span></p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Input z zapisem na blur/Enter. Stan: idle → saving → saved(✓)/error.
function SubaccountInput({
  contractId, initial, onSaved,
}: {
  contractId: string
  initial: string | null
  onSaved: (v: string | null) => void
}) {
  const [value, setValue] = useState(initial || '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const trimmed = value.trim()
    if (trimmed === (initial || '')) return // bez zmian
    setState('saving')
    setError(null)
    try {
      const r = await fetch('/api/finanse/powiernicze/subaccounts', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contractId, escrowSubaccount: trimmed || null }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setState('error'); setError(data.error || 'Błąd zapisu'); return }
      setState('saved')
      onSaved(data.escrowSubaccount ?? null)
      setTimeout(() => setState('idle'), 2000)
    } catch (e: any) {
      setState('error')
      setError(e.message || 'Błąd sieci')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); if (state !== 'idle') setState('idle') }}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="np. 12 1050 0000 0000 00XX XXXX XXXX"
          className="w-full max-w-[300px] px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-mono tabular-nums"
          title="Indywidualny numer subrachunku nabywcy w OMRP (z umowy ING / listy subrachunków). Zapis przy wyjściu z pola lub Enter. Wyczyść pole aby usunąć."
        />
        <span className="text-xs w-4 shrink-0">
          {state === 'saving' && <span className="text-gray-400">…</span>}
          {state === 'saved' && <span className="text-green-600">✓</span>}
          {state === 'error' && <span className="text-red-600">✗</span>}
        </span>
      </div>
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  )
}
