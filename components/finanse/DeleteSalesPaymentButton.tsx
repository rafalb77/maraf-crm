'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function DeleteSalesPaymentButton({ invoiceId, paymentId }: { invoiceId: string; paymentId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  async function del() {
    if (!confirm('Usunąć tę wpłatę?')) return
    setLoading(true)
    try {
      const r = await fetch(`/api/finanse/sales-invoices/${invoiceId}/payments/${paymentId}`, { method: 'DELETE' })
      if (r.ok) router.refresh(); else alert('Błąd')
    } finally { setLoading(false) }
  }
  return <button onClick={del} disabled={loading} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50" title="Usuń wpłatę">{loading ? '...' : '✗'}</button>
}
