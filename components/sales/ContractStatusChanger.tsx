'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CONTRACT_STATUS_LABELS, type ContractStatus } from '@/lib/types'

export function ContractStatusChanger({
  contractId,
  currentStatus,
}: {
  contractId: string
  currentStatus: ContractStatus
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as ContractStatus
    if (newStatus === currentStatus) return
    if (newStatus === 'PODPISANA') {
      if (!confirm('Zmiana statusu na PODPISANA zablokuje lokale (twarda rezerwacja / sprzedaż). Kontynuować?')) return
    }
    if (newStatus === 'ROZWIAZANA' || newStatus === 'ANULOWANA') {
      if (!confirm('To zwolni zarezerwowane lokale. Kontynuować?')) return
    }
    setLoading(true)
    await fetch(`/api/contracts/${contractId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
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
  )
}
