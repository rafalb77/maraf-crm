'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeleteClientButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    await fetch(`/api/clients/${id}`, { method: 'DELETE' })
    router.push('/clients')
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Usuń {name}?</span>
        <button onClick={handleDelete} disabled={loading}
          className="px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50">
          {loading ? '...' : 'Tak, usuń'}
        </button>
        <button onClick={() => setConfirming(false)}
          className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
          Anuluj
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => setConfirming(true)}
      className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
      Usuń
    </button>
  )
}
