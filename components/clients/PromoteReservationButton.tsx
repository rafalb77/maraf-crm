'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CONTRACT_TYPE_LABELS } from '@/lib/types'

/**
 * Przekształca rezerwację klienta (jego przypisane lokale) w umowę-deal jednym
 * krokiem — bez ręcznego przepisywania lokali. Deal startuje od wybranego etapu
 * (rezerwacyjna domyślnie; może od razu deweloperska). Po utworzeniu przenosi na
 * kartę umowy.
 */
export function PromoteReservationButton({
  clientId,
  unitCount,
  variant = 'full',
}: {
  clientId: string
  unitCount?: number
  /**
   * 'full'    = przycisk pełnej szerokości (karta klienta),
   * 'compact' = mała akcja w wierszu tabeli,
   * 'button'  = zwykły przycisk do paska akcji (np. nagłówek karty lokalu).
   */
  variant?: 'full' | 'compact' | 'button'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<'REZERWACYJNA' | 'DEWELOPERSKA'>('REZERWACYJNA')
  const [reservationFee, setReservationFee] = useState('')
  const [plannedSignDate, setPlannedSignDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: stage,
          reservationFee: stage === 'REZERWACYJNA' && reservationFee ? reservationFee : undefined,
          plannedSignDate: plannedSignDate || undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Nie udało się utworzyć umowy')
      router.push(`/sales/${d.id}`)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'full' && unitCount === 0) return null

  return (
    <>
      {variant === 'full' ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full px-3 py-2 border border-dashed border-green-300 text-green-700 hover:bg-green-50 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          Przekształć rezerwację w umowę
        </button>
      ) : variant === 'button' ? (
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Przekształć w umowę
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          title="Przekształć rezerwację w umowę"
          className="px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-300 rounded hover:bg-emerald-50 inline-flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Umowa
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Przekształć rezerwację w umowę</h2>
            <p className="text-xs text-gray-500 mb-4">
              {unitCount != null
                ? `${unitCount} ${unitCount === 1 ? 'lokal' : 'lokale'} klienta zostaną przeniesione do umowy.`
                : 'Wszystkie przypisane lokale klienta zostaną przeniesione do umowy.'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Etap startowy</label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as 'REZERWACYJNA' | 'DEWELOPERSKA')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="REZERWACYJNA">{CONTRACT_TYPE_LABELS.REZERWACYJNA}</option>
                  <option value="DEWELOPERSKA">{CONTRACT_TYPE_LABELS.DEWELOPERSKA}</option>
                </select>
              </div>
              {stage === 'REZERWACYJNA' && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Opłata rezerwacyjna (opcjonalnie)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={reservationFee}
                    onChange={(e) => setReservationFee(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-600 mb-1">Planowana data podpisania (opcjonalnie)</label>
                <input
                  type="date"
                  value={plannedSignDate}
                  onChange={(e) => setPlannedSignDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Anuluj
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium"
              >
                {busy ? 'Tworzę...' : 'Utwórz umowę'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
