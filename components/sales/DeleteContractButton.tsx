'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function DeleteContractButton({ id, number }: { id: string; number: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function onDelete() {
    if (!confirm(`Usunąć umowę ${number}? Tej operacji nie można cofnąć.`)) return
    setLoading(true)
    await fetch(`/api/contracts/${id}`, { method: 'DELETE' })
    router.push('/sales')
    router.refresh()
  }

  return (
    <button
      onClick={onDelete}
      disabled={loading}
      className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
    >
      Usuń
    </button>
  )
}
