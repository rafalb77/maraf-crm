'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

// Akcje faktury przychodowej: konwersja zaliczki na zwykla, anulowanie.
export function SalesInvoiceActions({ invoiceId, isAdvance, status }: { invoiceId: string; isAdvance: boolean; status: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function patch(body: Record<string, any>, action: string) {
    setLoading(action); setError(null)
    try {
      const r = await fetch(`/api/finanse/sales-invoices/${invoiceId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Blad'); return }
      router.refresh()
    } catch (e: any) { setError(e.message || 'Blad sieci') } finally { setLoading(null) }
  }

  if (status === 'ANULOWANA') return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-2 items-center">
      {isAdvance && (
        <button
          onClick={() => { if (confirm('Zamienić fakturę zaliczkową na zwykłą? Od teraz będzie wliczana do CIT/VAT.')) patch({ isAdvance: false }, 'convert') }}
          disabled={loading !== null}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading === 'convert' ? '...' : 'Zamień na fakturę zwykłą'}
        </button>
      )}
      <button
        onClick={() => { if (confirm('Anulować fakturę?')) patch({ status: 'ANULOWANA' }, 'cancel') }}
        disabled={loading !== null}
        className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        Anuluj fakturę
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  )
}
