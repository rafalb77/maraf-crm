'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CONTRACT_STATUS_LABELS, type ContractStatus } from '@/lib/types'
import { isSessionExpired } from '@/lib/api-client'
import { SignContractDialog } from './SignContractDialog'

/**
 * Rozwijany status umowy. Wybór „Podpisana" NIE podpisuje od razu — otwiera
 * okno z datą podpisania (jak „Oznacz jako podpisaną"); bez daty umowa nie
 * zmienia statusu. Rozwiązanie / anulowanie zwalnia lokale (po potwierdzeniu).
 */
export function ContractStatusChanger({
  contractId,
  currentStatus,
  contractType,
}: {
  contractId: string
  currentStatus: ContractStatus
  contractType?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [signOpen, setSignOpen] = useState(false)

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as ContractStatus
    if (newStatus === currentStatus) return
    if (newStatus === 'PODPISANA') {
      // Podpisanie wymaga daty — okno; select wraca do bieżącego statusu do czasu zapisu.
      e.target.value = currentStatus
      setSignOpen(true)
      return
    }
    if (newStatus === 'ROZWIAZANA' || newStatus === 'ANULOWANA') {
      if (!confirm('To zwolni zarezerwowane lokale. Kontynuować?')) {
        e.target.value = currentStatus
        return
      }
    }
    setLoading(true)
    const res = await fetch(`/api/contracts/${contractId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setLoading(false)
    if (!res.ok) {
      if (!isSessionExpired(res)) {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Nie udało się zmienić statusu umowy. Spróbuj ponownie.')
      }
      e.target.value = currentStatus
      return
    }
    router.refresh()
  }

  return (
    <>
      <select
        disabled={loading}
        value={currentStatus}
        onChange={onChange}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map((s) => (
          <option key={s} value={s}>
            {CONTRACT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {signOpen && <SignContractDialog contractId={contractId} contractType={contractType} onClose={() => setSignOpen(false)} />}
    </>
  )
}
