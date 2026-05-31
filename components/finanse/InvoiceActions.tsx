'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Props = {
  invoiceId: string
  status: string
  canApprove: boolean
  isAdmin: boolean
}

// Mapa akcji per status. Workflow uproszczony — Marta sama zatwierdza,
// faktury wpadaja od razu jako ZATWIERDZONA. Akcje glownie do cofania pomylek.
const ACTIONS_BY_STATUS: Record<string, ('APPROVE' | 'REJECT' | 'RESET' | 'CANCEL')[]> = {
  WPROWADZONA: ['APPROVE', 'REJECT', 'CANCEL'],
  DO_ZATWIERDZENIA: ['APPROVE', 'REJECT', 'CANCEL'], // legacy, gdy faktury miały starszy status
  ZATWIERDZONA: ['REJECT', 'RESET', 'CANCEL'],
  ODRZUCONA: ['APPROVE', 'RESET', 'CANCEL'],
  ZAPLANOWANA: ['CANCEL'],
  CZESCIOWO_OPLACONA: ['CANCEL'],
  OPLACONA: [],
  ANULOWANA: [],
}

const ACTION_CONFIG = {
  APPROVE: { label: 'Zatwierdź', color: 'bg-green-600 hover:bg-green-700', requireComment: false },
  REJECT: { label: 'Odrzuć', color: 'bg-red-600 hover:bg-red-700', requireComment: true },
  RESET: { label: 'Cofnij do edycji', color: 'bg-gray-600 hover:bg-gray-700', requireComment: false },
  CANCEL: { label: 'Anuluj fakturę', color: 'bg-gray-800 hover:bg-gray-900', requireComment: false },
}

export function InvoiceActions({ invoiceId, status, canApprove, isAdmin }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const availableActions = (ACTIONS_BY_STATUS[status] || []).filter((a) => {
    if ((a === 'APPROVE' || a === 'REJECT') && !canApprove) return false
    if (a === 'CANCEL' && !isAdmin) return false
    return true
  })

  if (availableActions.length === 0) return null

  async function execute(action: string, withComment: string | null) {
    setLoading(action)
    setError(null)
    try {
      const r = await fetch(`/api/finanse/invoices/${invoiceId}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, comment: withComment }),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error || 'Blad')
        setLoading(null)
        return
      }
      router.refresh()
      setPendingAction(null)
      setComment('')
    } catch (e: any) {
      setError(e.message || 'Blad sieci')
    } finally {
      setLoading(null)
    }
  }

  function startAction(action: string) {
    const cfg = ACTION_CONFIG[action as keyof typeof ACTION_CONFIG]
    if (cfg.requireComment) {
      setPendingAction(action)
      setComment('')
      setError(null)
    } else {
      execute(action, null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex flex-wrap gap-2">
        {availableActions.map((a) => {
          const cfg = ACTION_CONFIG[a]
          return (
            <button
              key={a}
              onClick={() => startAction(a)}
              disabled={loading !== null}
              className={`${cfg.color} text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50`}
            >
              {loading === a ? '...' : cfg.label}
            </button>
          )
        })}
      </div>

      {pendingAction && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Komentarz {ACTION_CONFIG[pendingAction as keyof typeof ACTION_CONFIG]?.requireComment ? '(wymagany)' : '(opcjonalny)'}
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="Powód decyzji..."
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => execute(pendingAction, comment.trim() || null)}
              disabled={loading !== null || !comment.trim()}
              className={`${ACTION_CONFIG[pendingAction as keyof typeof ACTION_CONFIG]?.color} text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50`}
            >
              Potwierdź
            </button>
            <button
              onClick={() => { setPendingAction(null); setComment(''); setError(null) }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
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
