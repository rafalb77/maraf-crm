'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function UnassignUnitButton({ clientId, unitId }: { clientId: string; unitId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleUnassign() {
    if (!confirm('Usunąć przypisanie lokalu?')) return
    setLoading(true)
    await fetch(`/api/clients/${clientId}/units?unitId=${unitId}`, { method: 'DELETE' })
    router.refresh()
    setLoading(false)
  }

  return (
    <button onClick={handleUnassign} disabled={loading}
      className="text-gray-400 hover:text-red-500 transition-colors p-1" title="Usuń przypisanie">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}
