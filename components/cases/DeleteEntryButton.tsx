'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeleteEntryButton({ caseId, entryId }: { caseId: string; entryId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm('Usunąć ten wpis korespondencji? Załączone skany pozostaną w archiwum sprawy.')) {
      return
    }
    setLoading(true)
    await fetch(`/api/cases/${caseId}/entries/${entryId}`, { method: 'DELETE' })
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      // Na dotyku nie ma :hover, więc poniżej sm przycisk jest zawsze widoczny (inaczej niedostępny na telefonie)
      className="text-xs text-red-500 hover:text-red-700 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
      title="Usuń wpis"
    >
      {loading ? '...' : 'Usuń'}
    </button>
  )
}
