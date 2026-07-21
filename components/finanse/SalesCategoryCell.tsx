'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  SALES_INVOICE_CATEGORIES,
  SALES_INVOICE_CATEGORY_LABELS,
  SALES_INVOICE_CATEGORY_COLORS,
  type SalesInvoiceCategory,
} from '@/lib/types'

// Kategoria przychodu inline (lista FV przychodowych) — klik na badge/"+ ustaw"
// otwiera select (Tynki / Inwestycja / brak), wybor zapisuje sie od razu.
export function SalesCategoryCell({ invoiceId, category }: { invoiceId: string; category: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save(next: string) {
    setSaving(true)
    try {
      const r = await fetch(`/api/finanse/sales-invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category: next || null }),
      })
      if (r.ok) { setEditing(false); router.refresh() }
      else {
        const data = await r.json().catch(() => ({}))
        alert(data.error || 'Błąd zapisu kategorii')
      }
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={category || ''}
        disabled={saving}
        onChange={(e) => save(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
        className="w-full px-1 py-0.5 border border-blue-300 rounded text-xs disabled:opacity-50"
      >
        <option value="">— brak —</option>
        {SALES_INVOICE_CATEGORIES.map((c) => (
          <option key={c} value={c}>{SALES_INVOICE_CATEGORY_LABELS[c]}</option>
        ))}
      </select>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block text-left"
      title={category ? 'Kliknij aby zmienić kategorię' : 'Kliknij aby ustawić kategorię (Tynki / Inwestycja)'}
    >
      {category ? (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
          SALES_INVOICE_CATEGORY_COLORS[category as SalesInvoiceCategory] || 'bg-gray-100 text-gray-600'
        }`}>
          {SALES_INVOICE_CATEGORY_LABELS[category as SalesInvoiceCategory] || category}
        </span>
      ) : (
        <span className="text-gray-300 text-xs hover:text-blue-500">+ ustaw</span>
      )}
    </button>
  )
}
