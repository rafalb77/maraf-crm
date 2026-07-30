'use client'
import { useState } from 'react'

// Rachunek wirtualny ING (OMRP) przypisany do lokalu — wyswietlanie + edycja
// inline na karcie lokalu. Numer sluzy do pewnego dopasowania wplat nabywcy
// w Finanse → Rozliczenia powiernicze (umowa lokalu dziedziczy ten numer).
export function UnitEscrowSubaccount({ unitId, initial }: { unitId: string; initial: string | null }) {
  const [value, setValue] = useState(initial || '')
  const [saved, setSaved] = useState(initial || '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const trimmed = value.trim()
    if (trimmed === saved) return
    setState('saving')
    setError(null)
    try {
      const r = await fetch(`/api/units/${unitId}/escrow-subaccount`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ escrowSubaccount: trimmed || null }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setState('error'); setError(data.error || 'Błąd zapisu'); return }
      setSaved(data.escrowSubaccount || '')
      setValue(data.escrowSubaccount || '')
      setState('saved')
      setTimeout(() => setState('idle'), 2000)
    } catch (e: any) {
      setState('error')
      setError(e.message || 'Błąd sieci')
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Rachunek wirtualny OMRP (powiernicze)</p>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); if (state !== 'idle') setState('idle') }}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="brak — wpisz numer z listy ING"
          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm font-mono tabular-nums"
          title="Indywidualny rachunek wirtualny tego lokalu (zestawienie ING). Wpłaty nabywcy na ten numer dopasowują się pewnie w Rozliczeniach powierniczych. Zapis przy wyjściu z pola / Enter."
        />
        <span className="text-sm w-4 shrink-0">
          {state === 'saving' && <span className="text-gray-400">…</span>}
          {state === 'saved' && <span className="text-green-600">✓</span>}
          {state === 'error' && <span className="text-red-600">✗</span>}
        </span>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
