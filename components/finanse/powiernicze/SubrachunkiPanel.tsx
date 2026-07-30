'use client'
import { useEffect, useMemo, useState } from 'react'

type ApplyPreview = {
  committed: boolean
  total: number
  toSet: { lokal: number; unit: string; nrb: string; contract: string | null; overwrites: string | null }[]
  same: number
  conflicts: { lokal: number; unit: string; existing: string }[]
  ambiguous: { lokal: number; units: string[] }[]
  notFound: number[]
}

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
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    fetch('/api/finanse/powiernicze/subaccounts')
      .then((r) => r.json())
      .then((d) => { if (alive) { Array.isArray(d) ? setRows(d) : setError(d.error || 'Błąd pobierania') } })
      .catch((e) => { if (alive) setError(e.message || 'Błąd sieci') })
    return () => { alive = false }
  }, [refreshKey, reloadKey])

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

      {/* Zbiorcze przypisanie z listy ING (Zgierz) — bez terminala */}
      <ApplyIngSection onApplied={() => setReloadKey((k) => k + 1)} />

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

// Zbiorcze przypisanie rachunkow wirtualnych ING (Zgierz, 59 lokali) do
// lokali — podglad (dry-run) i zapis, bez terminala. Dane: lista ING
// wbudowana po stronie serwera (apply-ing).
function ApplyIngSection({ onApplied }: { onApplied: () => void }) {
  const [open, setOpen] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [preview, setPreview] = useState<ApplyPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  async function run(commit: boolean) {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/finanse/powiernicze/subaccounts/apply-ing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commit, prefix: prefix.trim() || null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Błąd'); return }
      if (commit) { setDone(d.toSet.length); setPreview(null); onApplied() }
      else { setPreview(d); setDone(null) }
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="mb-4">
        <button
          onClick={() => { setOpen(true); setDone(null); run(false) }}
          className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          title="Przypisuje 59 rachunków wirtualnych ING (Zgierz dz. 43/1 i 44/6) do lokali wg końcówki numeru lokalu. Najpierw podgląd, zapis dopiero po potwierdzeniu."
        >
          ⚡ Przypisz rachunki ING (Zgierz) do lokali
        </button>
        {done != null && <span className="ml-3 text-sm text-green-700">✓ Zapisano {done} {done === 1 ? 'lokal' : 'lokali'}</span>}
      </div>
    )
  }

  return (
    <div className="mb-4 bg-white border border-amber-300 rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <p className="font-semibold text-gray-900 text-sm">Rachunki wirtualne ING — Zgierz (lista z załącznika, 59 lokali)</p>
        <div className="flex items-center gap-2">
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="filtr numeru lokalu (opc.)"
            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs w-44"
            title="Np. Z. — tylko lokale o numerze zaczynającym się od Z. (gdy CRM ma lokale wielu inwestycji z powtarzającymi się końcówkami)"
          />
          <button onClick={() => run(false)} disabled={busy} className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50">↻ odśwież podgląd</button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {busy && !preview && <p className="text-sm text-gray-400">Analizuję…</p>}
      {preview && (
        <div className="text-sm space-y-2">
          <p className="text-gray-700">
            Do zapisania: <strong className="text-green-700">{preview.toSet.length}</strong>
            {' • '}już ustawione: <strong>{preview.same}</strong>
            {' • '}konflikty (inny numer): <strong className={preview.conflicts.length ? 'text-red-600' : ''}>{preview.conflicts.length}</strong>
            {' • '}niejednoznaczne: <strong className={preview.ambiguous.length ? 'text-amber-600' : ''}>{preview.ambiguous.length}</strong>
            {' • '}bez lokalu w CRM: <strong>{preview.notFound.length}</strong>
          </p>
          {preview.toSet.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-gray-50">
                  {preview.toSet.map((t) => (
                    <tr key={t.lokal}>
                      <td className="px-2 py-1 font-medium">{t.unit}</td>
                      <td className="px-2 py-1 font-mono tabular-nums text-gray-600">{t.nrb}</td>
                      <td className="px-2 py-1 text-gray-500">{t.contract || 'bez umowy'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.ambiguous.length > 0 && (
            <p className="text-xs text-amber-700">
              ⚠ Ta sama końcówka w wielu lokalach: {preview.ambiguous.map((a) => `${a.lokal} (${a.units.join(', ')})`).join('; ')} — zawęź filtrem albo wpisz ręcznie na karcie lokalu.
            </p>
          )}
          {preview.notFound.length > 0 && (
            <p className="text-xs text-gray-400">Pozycje z listy bez lokalu w CRM: {preview.notFound.join(', ')}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => run(true)}
              disabled={busy || preview.toSet.length === 0}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Zapisuję…' : `Zapisz przypisania (${preview.toSet.length})`}
            </button>
            <button onClick={() => { setOpen(false); setPreview(null) }} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Zamknij</button>
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
