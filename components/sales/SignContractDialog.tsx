'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CONTRACT_TYPE_LABELS, type ContractType } from '@/lib/types'
import { isSessionExpired, SESSION_EXPIRED_HINT } from '@/lib/api-client'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Jedno okno podpisania umowy (bieżącego etapu) — używane przez „Oznacz jako
 * podpisaną” i przez wybór statusu „Podpisana”. Umowa staje się podpisana
 * DOPIERO po podaniu daty podpisania (pole puste na starcie, nie z przyszłości);
 * numer aktu / repertorium opcjonalny. PATCH /api/contracts/[id] blokuje lokale
 * (twarda rezerwacja / sprzedaż), podnosi status klienta na UMOWA i zapisuje
 * datę + numer w osi etapów.
 */
export function SignContractDialog({
  contractId,
  contractType,
  onClose,
}: {
  contractId: string
  contractType?: ContractType | string
  onClose: () => void
}) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [number, setNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isNotarial = contractType === 'DEWELOPERSKA' || contractType === 'PRZENIESIENIA'
  const stageLabel = contractType && CONTRACT_TYPE_LABELS[contractType as ContractType]

  async function submit() {
    if (!date) { setError('Podaj datę podpisania — bez niej umowa nie zostanie oznaczona jako podpisana'); return }
    if (date > todayIso()) { setError('Data podpisania nie może być z przyszłości'); return }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PODPISANA', signedAt: date, stageNumber: number.trim() || undefined }),
      })
      if (!res.ok) {
        if (isSessionExpired(res)) { setError(SESSION_EXPIRED_HINT); return }
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się oznaczyć umowy jako podpisanej')
      }
      onClose()
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Oznacz umowę jako podpisaną{stageLabel ? `: ${stageLabel}` : ''}</h2>
        <p className="text-xs text-gray-500 mb-4">Umowa zostanie oznaczona jako podpisana dopiero po podaniu daty podpisania.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Data podpisania *</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                max={todayIso()}
                onChange={(e) => setDate(e.target.value)}
                autoFocus
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" onClick={() => setDate(todayIso())} className="px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50">
                Dziś
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">{isNotarial ? 'Numer aktu / repertorium (opcjonalnie)' : 'Numer umowy / aktu (opcjonalnie)'}</label>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={isNotarial ? 'np. Rep. A 1234/2026' : 'np. UR/2026/10/001'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3 leading-snug">
          Lokale z umowy zostaną zablokowane ({isNotarial ? 'sprzedaż' : 'twarda rezerwacja'}), a klient otrzyma status{' '}
          <span className="font-medium">UMOWA</span>.
        </p>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Anuluj
          </button>
          <button
            onClick={submit}
            disabled={busy || !date}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium"
            title={!date ? 'Najpierw podaj datę podpisania' : undefined}
          >
            {busy ? 'Zapisuję...' : 'Podpisz'}
          </button>
        </div>
      </div>
    </div>
  )
}
