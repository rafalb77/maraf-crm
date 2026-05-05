'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'

type Props = {
  id: string
  status: string
  label: string // np. "Marzec 2026"
  subName: string
}

export function ProtocolRowActions({ id, status, label, subName }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function remove() {
    const ok = window.confirm(
      `Usunąć protokół „${label}" dla ${subName}?\n\nTej operacji nie można cofnąć — pozycje protokołu zostaną usunięte, a postęp obmiaru rozliczony w tym protokole zostanie zwolniony.`,
    )
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/przeroby/protocols/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Błąd usuwania')
      }
      router.refresh()
    } catch (e: any) {
      alert(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={`/przeroby/protokoly/${id}/edycja`}
        className="px-2 py-1 text-xs rounded text-gray-600 hover:text-blue-600 hover:bg-blue-50"
        title="Edytuj pozycje"
      >
        ✏ Edytuj
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="px-2 py-1 text-xs rounded text-gray-600 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
        title={status === 'SZKIC' ? 'Usuń protokół' : 'Można usunąć — uwaga, zwalnia % obmiaru'}
      >
        {busy ? '…' : '🗑 Usuń'}
      </button>
    </div>
  )
}
