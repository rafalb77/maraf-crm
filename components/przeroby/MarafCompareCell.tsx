'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MarafMatch } from '@/lib/protokol-maraf-match'

/**
 * Komórka kolumny "Maraf (obmiar)" w widoku protokołu przerobowego.
 *
 * Pokazuje wartość z obmiaru inżynierskiego Maraf dopasowaną do pozycji
 * rozliczenia wykonawcy. Priorytet wyświetlanej wartości:
 *   1. marafManualValue (wpisana ręcznie) — nadpisuje wszystko
 *   2. match.value (auto-dopasowanie z lib/protokol-maraf-match.ts)
 *   3. brak → zachęta "wpisz ręcznie"
 *
 * Klik w komórkę → tryb edycji (input wartości + komentarz). Zapis przez
 * PATCH /api/przeroby/protocols/items/[id], potem router.refresh().
 */

const STATUS_BADGE: Record<MarafMatch['status'], { label: string; cls: string }> = {
  AUTO: { label: 'z obmiaru', cls: 'bg-green-50 text-green-700' },
  CONVERTED: { label: 'przeliczone', cls: 'bg-blue-50 text-blue-700' },
  APPROX: { label: 'przybliżone', cls: 'bg-amber-50 text-amber-700' },
  MANUAL: { label: 'brak', cls: 'bg-gray-100 text-gray-500' },
}

function fmtQty(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function MarafCompareCell({
  itemId,
  match,
  totalQty,
  protocolUnit,
  manualValue,
  manualNote,
}: {
  itemId: string
  match: MarafMatch
  totalQty: number
  protocolUnit: string
  manualValue: number | null
  manualNote: string | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(manualValue != null ? String(manualValue) : '')
  const [note, setNote] = useState(manualNote ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isManual = manualValue != null
  const effectiveValue = isManual ? manualValue : match.value

  async function save(clear: boolean) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/przeroby/protocols/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marafManualValue: clear ? null : val,
          marafManualNote: clear ? null : note,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Błąd zapisu (${res.status})`)
      }
      setEditing(false)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Błąd zapisu')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setEditing(false)
    setError(null)
    setVal(manualValue != null ? String(manualValue) : '')
    setNote(manualNote ?? '')
  }

  // ---------------------------------------------------------------- EDYCJA
  if (editing) {
    return (
      <div className="space-y-1 min-w-[170px] text-right">
        <div className="flex items-center gap-1 justify-end">
          <input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save(false)
              if (e.key === 'Escape') cancel()
            }}
            placeholder={match.value != null ? String(match.value) : '0,00'}
            className="w-24 px-1.5 py-1 text-right text-sm border border-gray-300 rounded tabular-nums"
          />
          <span className="text-xs text-gray-500">{protocolUnit}</span>
        </div>
        {match.rawValue != null && (
          <p className="text-[10px] text-gray-400">
            obmiar Maraf: {fmtQty(match.rawValue)} {match.rawUnit}
          </p>
        )}
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save(false)
            if (e.key === 'Escape') cancel()
          }}
          placeholder="komentarz (opcjonalnie)"
          className="w-full px-1.5 py-1 text-xs border border-gray-300 rounded"
        />
        {error && <p className="text-[10px] text-red-500">{error}</p>}
        <div className="flex items-center gap-1 justify-end">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={saving}
            className="px-2 py-0.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '…' : 'Zapisz'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Anuluj
          </button>
          {isManual && (
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving}
              title="Wyczyść wartość ręczną — wróć do auto-dopasowania"
              className="px-1.5 py-0.5 text-xs rounded text-red-500 hover:bg-red-50"
            >
              Wyczyść
            </button>
          )}
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------ WYŚWIETLANIE
  const diff =
    effectiveValue != null && effectiveValue > 0
      ? ((totalQty - effectiveValue) / effectiveValue) * 100
      : null

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={
        isManual
          ? manualNote || 'Wartość wpisana ręcznie — kliknij aby edytować'
          : `${match.note}\n\nKliknij aby wpisać/poprawić ręcznie.`
      }
      className="w-full text-right group cursor-pointer"
    >
      {effectiveValue != null ? (
        <>
          <span className="tabular-nums font-medium text-gray-900 group-hover:underline">
            {fmtQty(effectiveValue)}
          </span>
          <span className="block text-[10px] mt-0.5 leading-tight">
            <span
              className={`inline-block px-1 py-px rounded font-medium ${
                isManual ? 'bg-violet-100 text-violet-700' : STATUS_BADGE[match.status].cls
              }`}
            >
              {isManual ? 'ręcznie' : STATUS_BADGE[match.status].label}
            </span>
            {diff != null && Math.abs(diff) >= 1 && (
              <span
                className={`ml-1 tabular-nums ${
                  Math.abs(diff) > 10 ? 'text-red-600 font-medium' : 'text-gray-400'
                }`}
              >
                Δ {diff > 0 ? '+' : ''}
                {diff.toFixed(0)}%
              </span>
            )}
          </span>
        </>
      ) : (
        <span className="text-xs text-violet-600 group-hover:underline">+ wpisz ręcznie</span>
      )}
    </button>
  )
}
