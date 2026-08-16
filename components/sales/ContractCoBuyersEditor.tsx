'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Plus, X } from 'lucide-react'
import { isSessionExpired, SESSION_EXPIRED_HINT } from '@/lib/api-client'

type PersonOption = { id: string; firstName: string; lastName: string }

/**
 * Współrezerwujący/współkupujący na karcie umowy — dodawanie i usuwanie
 * (ContractClient). Umowy z konwersji oferty/rezerwacji powstają z jednym
 * klientem, więc drugą osobę dopisuje się właśnie tutaj. Do .docx trafia
 * pierwszy dopisany (placeholder client2 w szablonie).
 */
export function ContractCoBuyersEditor({
  contractId,
  contractType,
  coBuyers,
  availableClients,
}: {
  contractId: string
  contractType: string
  coBuyers: PersonOption[]
  /** Klienci możliwi do dopisania (bez głównego i już dopisanych). */
  availableClients: PersonOption[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roleLabel = contractType === 'REZERWACYJNA' ? 'współrezerwującego' : 'współkupującego'

  async function add() {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedId }),
      })
      if (!res.ok) {
        if (isSessionExpired(res)) { setError(SESSION_EXPIRED_HINT); return }
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się dopisać klienta')
      }
      setSelectedId('')
      setAdding(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(person: PersonOption) {
    if (!confirm(`Usunąć ${person.firstName} ${person.lastName} z tej umowy?`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/clients?clientId=${encodeURIComponent(person.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        if (isSessionExpired(res)) { setError(SESSION_EXPIRED_HINT); return }
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się usunąć klienta')
      }
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {coBuyers.map((cc, idx) => (
        <div key={cc.id} className="flex items-center justify-between gap-2 py-1.5">
          <span className="text-sm text-gray-500">Współrezerwujący {coBuyers.length > 1 ? idx + 1 : ''}</span>
          <span className="inline-flex items-center gap-1.5">
            <Link href={`/clients/${cc.id}`} className="text-sm text-blue-600 hover:text-blue-700 text-right">
              {cc.firstName} {cc.lastName}
            </Link>
            <button
              onClick={() => remove(cc)}
              disabled={busy}
              className="text-gray-300 hover:text-red-600 disabled:opacity-50"
              title={`Usuń ${roleLabel} z umowy`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      ))}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="mt-1 text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Dodaj {roleLabel}
        </button>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={busy}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">— wybierz klienta —</option>
              {availableClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.lastName} {c.firstName}
                </option>
              ))}
            </select>
            <button
              onClick={add}
              disabled={busy || !selectedId}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1.5 flex-shrink-0"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Dodaj
            </button>
            <button
              onClick={() => { setAdding(false); setSelectedId(''); setError(null) }}
              disabled={busy}
              className="text-sm text-gray-500 hover:text-gray-700 flex-shrink-0"
            >
              Anuluj
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            Osoby nie ma na liście? <Link href={`/clients/new?returnTo=${encodeURIComponent(`/sales/${contractId}`)}`} className="text-blue-600 hover:underline">Dodaj nowego klienta</Link>, potem wróć tutaj.
            Do wygenerowanej umowy (.docx) trafia pierwszy {roleLabel === 'współrezerwującego' ? 'współrezerwujący' : 'współkupujący'}.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </div>
  )
}
