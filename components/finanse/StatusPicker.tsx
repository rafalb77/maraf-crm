'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PURCHASE_INVOICE_STATUS_LABELS, type PurchaseInvoiceStatus } from '@/lib/types'

const ALL_STATUSES: PurchaseInvoiceStatus[] = [
  'POBRANA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'ZATWIERDZONA',
  'ZAPLANOWANA', 'CZESCIOWO_OPLACONA', 'OPLACONA', 'ODRZUCONA', 'ANULOWANA',
]

// Reczna zmiana statusu faktury (zapis od razu, PATCH + audyt w historii).
export function StatusPicker({ invoiceId, status }: { invoiceId: string; status: string }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(next: string) {
    if (next === status || saving) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/finanse/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
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
      <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Status</p>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        disabled={saving}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
      >
        {ALL_STATUSES.map((s) => <option key={s} value={s}>{PURCHASE_INVOICE_STATUS_LABELS[s]}</option>)}
        {/* na wypadek statusu spoza listy (dane legacy) */}
        {!ALL_STATUSES.includes(status as PurchaseInvoiceStatus) && <option value={status}>{status}</option>}
      </select>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
