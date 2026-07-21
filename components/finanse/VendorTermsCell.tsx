'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type TermsRow = {
  investment: string          // '' = domyslne (wszystkie budowy)
  depositPct: number | null
  depositReturnMonths: number | null
  buildingCostsPct: number | null
  calcBasis?: string          // legacy: wspolna baza (fallback gdy per-pole null)
  depositBasis?: string | null       // baza % kaucji: BRUTTO | NETTO
  buildingCostsBasis?: string | null // baza % KB: BRUTTO | NETTO (moze byc inna niz kaucji)
  notes: string | null
}

type Props = {
  vendorId: string
  terms: TermsRow[]  // z bazy; wiersz '' moze nie istniec
  // legacy fallback (Vendor.default*) — pokazywany dopoki brak wiersza terms
  legacyDepositPct: number | null
  legacyKbPct: number | null
  // prominent = widok karty kontrahenta: podsumowanie + wyrazny przycisk
  // "Edytuj warunki" (na liscie klikalny jest sam tekst, dla kompaktu).
  prominent?: boolean
}

const emptyRow = (investment = ''): TermsRow => ({ investment, depositPct: null, depositReturnMonths: null, buildingCostsPct: null, depositBasis: 'BRUTTO', buildingCostsBasis: 'BRUTTO', notes: null })

// Efektywna baza pola: per-potracenie, fallback na legacy calcBasis.
const basisOf = (perField: string | null | undefined, legacy: string | undefined): 'NETTO' | 'BRUTTO' =>
  (perField ?? legacy) === 'NETTO' ? 'NETTO' : 'BRUTTO'

function fmtRow(r: { depositPct: number | null; depositReturnMonths: number | null; buildingCostsPct: number | null; calcBasis?: string; depositBasis?: string | null; buildingCostsBasis?: string | null }): string {
  const depNetto = basisOf(r.depositBasis, r.calcBasis) === 'NETTO'
  const kbNetto = basisOf(r.buildingCostsBasis, r.calcBasis) === 'NETTO'
  const bothNetto = depNetto && kbNetto
  const parts: string[] = []
  parts.push(r.depositPct != null ? `kaucja ${r.depositPct}%${!bothNetto && depNetto ? ' od netto' : ''}` : 'kaucja —')
  if (r.depositReturnMonths != null) parts.push(`zwrot ${r.depositReturnMonths} mc`)
  parts.push(r.buildingCostsPct != null ? `KB ${r.buildingCostsPct}%${!bothNetto && kbNetto ? ' od netto' : ''}` : 'KB —')
  if (bothNetto) parts.push('od netto')
  return parts.join(' • ')
}

// Warunki umowne kontrahenta: kaucja gwarancyjna (% + okres zwrotu z umowy)
// i % kosztow budowy. Wiersz "domyslne" + opcjonalne wiersze per budowa
// (rozne umowy na roznych budowach). Edycja inline w tabeli kontrahentow.
export function VendorTermsCell({ vendorId, terms, legacyDepositPct, legacyKbPct, prominent }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<TermsRow[]>([])
  const [deleted, setDeleted] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultRow = terms.find((t) => t.investment === '')
  const buildRows = terms.filter((t) => t.investment !== '')
  // Podsumowanie: terms > legacy
  const summary = defaultRow
    ? fmtRow(defaultRow)
    : (legacyDepositPct != null || legacyKbPct != null)
      ? fmtRow({ depositPct: legacyDepositPct, depositReturnMonths: null, buildingCostsPct: legacyKbPct })
      : null

  // Normalizacja wiersza do edycji: bazy per-potracenie jawne (fallback z legacy calcBasis).
  const normalizeRow = (r: TermsRow): TermsRow => ({
    ...r,
    depositBasis: basisOf(r.depositBasis, r.calcBasis),
    buildingCostsBasis: basisOf(r.buildingCostsBasis, r.calcBasis),
  })

  function openEditor() {
    const base = defaultRow ? normalizeRow({ ...defaultRow }) : { ...emptyRow(), depositPct: legacyDepositPct, buildingCostsPct: legacyKbPct }
    setRows([base, ...buildRows.map((r) => normalizeRow({ ...r }))])
    setDeleted([])
    setError(null)
    setOpen(true)
  }

  function setField(idx: number, field: keyof TermsRow, value: string) {
    setRows((rs) => rs.map((r, i) => {
      if (i !== idx) return r
      if (field === 'investment' || field === 'notes' || field === 'depositBasis' || field === 'buildingCostsBasis') return { ...r, [field]: value }
      const n = value.trim() === '' ? null : parseFloat(value.replace(',', '.'))
      return { ...r, [field]: n != null && isFinite(n) ? n : null }
    }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      // Walidacja nazw budow: niepuste (poza wierszem domyslnym) i unikalne
      const names = rows.slice(1).map((r) => r.investment.trim())
      if (names.some((n) => !n)) { setError('Podaj nazwę budowy dla każdego wiersza (albo usuń pusty).'); return }
      if (new Set(names).size !== names.length) { setError('Nazwy budów muszą być unikalne.'); return }

      for (const inv of deleted) {
        const r = await fetch(`/api/finanse/vendors/${vendorId}/terms?investment=${encodeURIComponent(inv)}`, { method: 'DELETE' })
        if (!r.ok && r.status !== 404) { const d = await r.json().catch(() => ({})); setError(d.error || 'Błąd usuwania'); return }
      }
      for (const row of rows) {
        const r = await fetch(`/api/finanse/vendors/${vendorId}/terms`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            investment: row.investment.trim(),
            depositPct: row.depositPct,
            depositReturnMonths: row.depositReturnMonths,
            buildingCostsPct: row.buildingCostsPct,
            depositBasis: row.depositBasis === 'NETTO' ? 'NETTO' : 'BRUTTO',
            buildingCostsBasis: row.buildingCostsBasis === 'NETTO' ? 'NETTO' : 'BRUTTO',
            notes: row.notes?.trim() || null,
          }),
        })
        if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Błąd zapisu'); return }
      }
      setOpen(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally {
      setSaving(false)
    }
  }

  function removeBuildRow(idx: number) {
    const row = rows[idx]
    // Istniejacy w bazie wiersz — do skasowania przy zapisie
    if (buildRows.some((b) => b.investment === row.investment)) setDeleted((d) => [...d, row.investment])
    setRows((rs) => rs.filter((_, i) => i !== idx))
  }

  if (!open) {
    const buildInfo = buildRows.length > 0 && (
      <p className={`text-gray-400 ${prominent ? 'text-xs mt-1' : 'text-[10px] mt-0.5'}`}>
        + {buildRows.length} {buildRows.length === 1 ? 'budowa' : 'budowy'}: {buildRows.map((b) => b.investment).join(', ')}
      </p>
    )
    // Widok karty — wyrazny przycisk edycji (na liscie klikalny jest sam tekst).
    if (prominent) {
      return (
        <div>
          {summary
            ? <p className="text-sm text-gray-700 tabular-nums">{summary}</p>
            : <p className="text-sm text-gray-400 italic">Brak warunków umownych</p>}
          {buildInfo}
          <button
            onClick={openEditor}
            className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {summary ? '✎ Edytuj warunki' : '+ Ustaw warunki umowne'}
          </button>
        </div>
      )
    }
    return (
      <div className="text-xs">
        <button onClick={openEditor} className="text-left hover:text-blue-600" title="Kliknij aby edytować warunki umowne">
          {summary ? (
            <span className="text-gray-700 tabular-nums">{summary}</span>
          ) : (
            <span className="text-gray-300 italic">+ ustaw warunki</span>
          )}
        </button>
        {buildInfo}
      </div>
    )
  }

  return (
    <div className="text-xs bg-white border border-gray-300 rounded-lg p-3 w-full sm:min-w-[430px] shadow-sm">
      <p className="font-semibold text-gray-900 mb-2">Warunki umowne (kaucja / zwrot / koszty budowy)</p>
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-1.5 flex-wrap">
            {idx === 0 ? (
              <span className="w-[110px] text-gray-500 shrink-0">Domyślne:</span>
            ) : (
              <input
                value={row.investment}
                onChange={(e) => setField(idx, 'investment', e.target.value)}
                placeholder="nazwa budowy"
                className="w-[110px] px-1.5 py-1 border border-gray-300 rounded shrink-0"
              />
            )}
            <label className="flex items-center gap-1">
              <span className="text-gray-400">kaucja</span>
              <input
                value={row.depositPct ?? ''}
                onChange={(e) => setField(idx, 'depositPct', e.target.value)}
                placeholder="—"
                className="w-12 px-1.5 py-1 border border-gray-300 rounded tabular-nums"
                title="Kaucja gwarancyjna — % zatrzymywany z każdej faktury"
              />
              <span className="text-gray-400">%</span>
            </label>
            <select
              value={row.depositBasis === 'NETTO' ? 'NETTO' : 'BRUTTO'}
              onChange={(e) => setField(idx, 'depositBasis', e.target.value)}
              className="px-1 py-1 border border-gray-300 rounded"
              title="Baza naliczania kaucji — od wartości brutto czy netto faktury (wg umowy)"
            >
              <option value="BRUTTO">od brutto</option>
              <option value="NETTO">od netto</option>
            </select>
            <label className="flex items-center gap-1">
              <span className="text-gray-400">zwrot</span>
              <input
                value={row.depositReturnMonths ?? ''}
                onChange={(e) => setField(idx, 'depositReturnMonths', e.target.value)}
                placeholder="—"
                className="w-12 px-1.5 py-1 border border-gray-300 rounded tabular-nums"
                title="Po ilu miesiącach od wystawienia FV zwrot kaucji (z umowy)"
              />
              <span className="text-gray-400">mc</span>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-gray-400">KB</span>
              <input
                value={row.buildingCostsPct ?? ''}
                onChange={(e) => setField(idx, 'buildingCostsPct', e.target.value)}
                placeholder="—"
                className="w-12 px-1.5 py-1 border border-gray-300 rounded tabular-nums"
                title="Koszty budowy — % naliczany podwykonawcy (zwykle 0,5–1%)"
              />
              <span className="text-gray-400">%</span>
            </label>
            <select
              value={row.buildingCostsBasis === 'NETTO' ? 'NETTO' : 'BRUTTO'}
              onChange={(e) => setField(idx, 'buildingCostsBasis', e.target.value)}
              className="px-1 py-1 border border-gray-300 rounded"
              title="Baza naliczania kosztów budowy — od brutto czy netto (może być inna niż kaucji)"
            >
              <option value="BRUTTO">od brutto</option>
              <option value="NETTO">od netto</option>
            </select>
            <input
              value={row.notes ?? ''}
              onChange={(e) => setField(idx, 'notes', e.target.value)}
              placeholder="nr umowy (opc.)"
              className="flex-1 min-w-[90px] px-1.5 py-1 border border-gray-300 rounded"
            />
            {idx > 0 && (
              <button onClick={() => removeBuildRow(idx)} className="text-red-400 hover:text-red-600 px-1" title="Usuń warunki tej budowy">✗</button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => setRows((rs) => [...rs, emptyRow('')])}
        className="text-blue-600 hover:text-blue-800 mt-2"
      >
        + inne warunki dla konkretnej budowy
      </button>
      <p className="text-[10px] text-gray-400 mt-1.5">
        Warunki prefilują nową fakturę i naliczają się przy synchronizacji KSeF.
        Termin zwrotu kaucji = data wystawienia FV + podane miesiące.
      </p>
      {error && <p className="text-red-600 mt-1.5">{error}</p>}
      <div className="flex gap-2 mt-2">
        <button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50">
          {saving ? 'Zapisuję…' : 'Zapisz'}
        </button>
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-gray-600 hover:text-gray-900">Anuluj</button>
      </div>
    </div>
  )
}
