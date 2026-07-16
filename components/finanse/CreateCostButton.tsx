'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { COMPANY_LABELS, type Company } from '@/lib/types'

type Props = {
  invoiceId: string
  recipientCompany: string | null
  linkedPurchaseInvoiceId: string | null
}

export function CreateCostButton({ invoiceId, recipientCompany, linkedPurchaseInvoiceId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!recipientCompany) return null

  if (linkedPurchaseInvoiceId) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-900 flex items-center justify-between flex-wrap gap-2">
        <span>✓ Utworzono koszt u odbiorcy ({COMPANY_LABELS[recipientCompany as Company] || recipientCompany}).</span>
        <Link href={`/finanse/faktury/${linkedPurchaseInvoiceId}`} className="text-blue-600 hover:underline font-medium">Zobacz koszt →</Link>
      </div>
    )
  }

  async function create() {
    if (!confirm(`Utworzyć fakturę kosztową w ${COMPANY_LABELS[recipientCompany as Company] || recipientCompany}? Pojawi się tam jako "Wprowadzona" do akceptacji.`)) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/finanse/sales-invoices/${invoiceId}/create-cost`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Blad'); setLoading(false); return }
      router.refresh()
    } catch (e: any) { setError(e.message || 'Blad sieci'); setLoading(false) }
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-purple-900">
          Odbiorca to firma grupy (<strong>{COMPANY_LABELS[recipientCompany as Company] || recipientCompany}</strong>) — możesz utworzyć u niej koszt z tej faktury.
        </p>
        <button onClick={create} disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? 'Tworzę...' : 'Utwórz koszt u odbiorcy'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
