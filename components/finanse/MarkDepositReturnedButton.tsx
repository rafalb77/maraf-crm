'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function MarkDepositReturnedButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function mark() {
    if (!confirm('Oznaczyć kaucję jako zwróconą?')) return
    setLoading(true)
    try {
      const r = await fetch(`/api/finanse/invoices/${invoiceId}/deposit`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ markReturned: true }),
      })
      if (r.ok) router.refresh()
      else alert('Błąd')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={mark}
      disabled={loading}
      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? '...' : 'Zwrócona ✓'}
    </button>
  )
}
