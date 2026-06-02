'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Props = {
  vendorId: string
  field: 'defaultDepositPct' | 'defaultBuildingCostsPct'
  initial: number | null
}

// Inline edycja domyslnego % (kaucji lub KB) per kontrahent. Klik -> input -> Enter zapis.
export function VendorDefaultsCell({ vendorId, field, initial }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initial != null ? String(initial) : '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const raw = value.trim().replace(',', '.')
      const r = await fetch(`/api/finanse/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: raw === '' ? null : raw }),
      })
      if (r.ok) { setEditing(false); router.refresh() }
      else alert('Błąd zapisu')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setValue(initial != null ? String(initial) : '') } }}
          placeholder="0-100"
          className="w-16 px-2 py-1 border border-blue-300 rounded text-xs tabular-nums"
        />
        <span className="text-xs text-gray-400">%</span>
        <button onClick={save} disabled={saving} className="text-green-600 text-xs">{saving ? '...' : '✓'}</button>
        <button onClick={() => { setEditing(false); setValue(initial != null ? String(initial) : '') }} className="text-gray-400 text-xs">✗</button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-gray-700 hover:text-blue-600 tabular-nums"
      title="Kliknij aby ustawić %"
    >
      {initial != null ? `${initial}%` : <span className="text-gray-300 italic">—</span>}
    </button>
  )
}
