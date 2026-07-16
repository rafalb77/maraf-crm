'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Przycisk „Oznacz jako podpisaną" — szybka ścieżka podpisania umowy bez
 * grzebania w rozwijanym menu statusu. Ustawia status PODPISANA + datę
 * podpisania. API (PATCH /api/contracts/[id]) blokuje lokale (twarda
 * rezerwacja / sprzedaż) i podnosi status klienta na UMOWA.
 */
export function MarkSignedButton({ contractId }: { contractId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PODPISANA', signedAt: date || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się oznaczyć umowy jako podpisanej')
      }
      setOpen(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Oznacz jako podpisaną
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Oznacz umowę jako podpisaną</h2>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Data podpisania</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-gray-500 mt-3 leading-snug">
              Lokale z umowy zostaną zablokowane (twarda rezerwacja / sprzedaż), a klient otrzyma
              status <span className="font-medium">UMOWA</span>.
            </p>
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
                {busy ? 'Zapisuję...' : 'Podpisz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
