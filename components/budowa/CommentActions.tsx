'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Akcje komentarzy modułu Budowa:
 *  - FlagButton — „Do wyjaśnienia" (głównie tata z Widoku Prezesa): opcjonalny krótki
 *    tekst + flaga → POST /api/budowa/comments → Task dla Rafała
 *  - ResolveButton — „Wyjaśnione" (Rafał): PATCH → resolvedAt + auto-domknięcie Taska
 */

export function FlagButton({
  reportId,
  photoId,
  big = false,
}: {
  reportId?: string
  photoId?: string
  big?: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function flag() {
    const body = window.prompt('Co trzeba wyjaśnić? (możesz zostawić puste)')
    if (body === null) return // anulowano
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/budowa/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, photoId, body, needsClarification: true }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Błąd (${res.status})`)
      }
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Nie udało się zapisać')
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={flag}
        disabled={loading}
        className={
          big
            ? 'px-4 py-3 rounded-xl bg-amber-100 text-amber-900 text-base font-semibold disabled:opacity-60'
            : 'px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 text-xs font-semibold disabled:opacity-60'
        }
      >
        {loading ? '…' : '🚩 Do wyjaśnienia'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}

export function ResolveButton({ commentId }: { commentId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function resolve() {
    setLoading(true)
    try {
      await fetch(`/api/budowa/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: true }),
      })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={resolve}
      disabled={loading}
      className="px-2.5 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-semibold disabled:opacity-60"
    >
      {loading ? '…' : '✓ Wyjaśnione'}
    </button>
  )
}
