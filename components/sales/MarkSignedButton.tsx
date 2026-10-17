'use client'
import { useState } from 'react'
import { SignContractDialog } from './SignContractDialog'

/**
 * Przycisk „Oznacz jako podpisaną" — szybka ścieżka podpisania umowy bez
 * grzebania w rozwijanym menu statusu. Otwiera wspólne okno podpisania
 * (SignContractDialog): data podpisania wymagana, numer aktu opcjonalny.
 */
export function MarkSignedButton({ contractId, contractType }: { contractId: string; contractType?: string }) {
  const [open, setOpen] = useState(false)

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
      {open && <SignContractDialog contractId={contractId} contractType={contractType} onClose={() => setOpen(false)} />}
    </>
  )
}
