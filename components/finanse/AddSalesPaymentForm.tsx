'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function AddSalesPaymentForm({ invoiceId, remaining }: { invoiceId: string; remaining: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(remaining.toFixed(2))
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return <button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Dodaj wpłatę</button>
  }

  async function submit() {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/finanse/sales-invoices/${invoiceId}/payments`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amount.replace(',', '.')), paidAt, reference: reference || null }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Blad'); setLoading(false); return }
      router.refresh(); setOpen(false)
    } catch (e: any) { setError(e.message || 'Blad sieci') } finally { setLoading(false) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="font-medium text-gray-900 mb-3">Nowa wpłata</h3>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Kwota (zł)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
          <p className="text-xs text-gray-400 mt-1">Pozostało: {remaining.toFixed(2)} zł</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Data wpłaty</label>
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Tytuł (opc.)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={submit} disabled={loading || !amount} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">{loading ? 'Zapisuję...' : 'Zapisz wpłatę'}</button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Anuluj</button>
      </div>
    </div>
  )
}
