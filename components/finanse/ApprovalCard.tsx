'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { fmtMoney } from '@/lib/finanse-format'

type Invoice = {
  id: string
  vendorName: string
  subVendor: string | null
  number: string
  issueDate: string
  dueDate: string
  amountGross: number
  description: string | null
}

export function ApprovalCard({ invoice, canApprove }: { invoice: Invoice; canApprove: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'APPROVE' | 'REJECT' | null>(null)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function act(action: 'APPROVE' | 'REJECT', comment: string | null) {
    setBusy(action)
    setError(null)
    try {
      const r = await fetch(`/api/finanse/invoices/${invoice.id}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, comment }),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error || 'Blad')
        setBusy(null)
        return
      }
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Blad sieci')
      setBusy(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{invoice.vendorName}</h3>
            {invoice.subVendor && <span className="text-sm text-gray-500">/ {invoice.subVendor}</span>}
            <Link href={`/finanse/faktury/${invoice.id}`} className="text-sm text-blue-600 hover:underline font-mono">
              {invoice.number}
            </Link>
          </div>
          <div className="text-sm text-gray-600 mt-1 flex flex-wrap gap-x-4">
            <span>Wystawiona: <strong>{invoice.issueDate}</strong></span>
            <span>Termin: <strong>{invoice.dueDate}</strong></span>
          </div>
          {invoice.description && (
            <p className="text-sm text-gray-500 mt-1 truncate">{invoice.description}</p>
          )}
        </div>

        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtMoney(invoice.amountGross)}</p>
        </div>
      </div>

      {canApprove && (
        <div className="mt-4 flex gap-2 pt-4 border-t border-gray-100">
          <button
            onClick={() => act('APPROVE', null)}
            disabled={busy !== null}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {busy === 'APPROVE' ? '...' : '✓ Zatwierdź'}
          </button>
          <button
            onClick={() => setShowReject(!showReject)}
            disabled={busy !== null}
            className="bg-white border border-red-300 text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            ✗ Odrzuć
          </button>
          <Link
            href={`/finanse/faktury/${invoice.id}`}
            className="ml-auto px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Szczegóły →
          </Link>
        </div>
      )}

      {showReject && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <label className="block text-xs text-red-700 uppercase font-semibold mb-2">Powód odrzucenia (wymagany)</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-white"
            placeholder="np. Niezgodne z zamówieniem, błędna kwota..."
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => act('REJECT', rejectReason.trim())}
              disabled={busy !== null || !rejectReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {busy === 'REJECT' ? '...' : 'Potwierdź odrzucenie'}
            </button>
            <button
              onClick={() => { setShowReject(false); setRejectReason('') }}
              className="px-3 py-1.5 text-sm text-gray-600"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}
    </div>
  )
}
