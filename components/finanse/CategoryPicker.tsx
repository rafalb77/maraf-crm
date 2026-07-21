'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  purchaseCategoriesFor,
  PURCHASE_INVOICE_CATEGORY_LABELS,
  PURCHASE_INVOICE_CATEGORY_COLORS,
  type PurchaseInvoiceCategory,
} from '@/lib/types'

// Szybkie przypisanie faktury do kategorii kosztowej. Zestaw kategorii
// zalezy od spolki (Maraf: Tynki; MD: Grunwaldzka). Klik w kafelek zapisuje
// od razu (PATCH); ponowny klik w aktywny — czyści.
export function CategoryPicker({ invoiceId, category, company }: { invoiceId: string; category: string | null; company: string }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setCategory(next: PurchaseInvoiceCategory | null) {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/finanse/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category: next }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setError(data.error || 'Błąd zapisu'); return }
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 uppercase font-semibold">Kategoria kosztowa</p>
        {category && (
          <button
            onClick={() => setCategory(null)}
            disabled={saving}
            className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            wyczyść
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {purchaseCategoriesFor(company).map((c) => {
          const active = category === c
          return (
            <button
              key={c}
              onClick={() => setCategory(active ? null : c)}
              disabled={saving}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                active
                  ? `${PURCHASE_INVOICE_CATEGORY_COLORS[c]} border-transparent ring-2 ring-offset-1 ring-gray-300`
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {PURCHASE_INVOICE_CATEGORY_LABELS[c]}
            </button>
          )
        })}
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
