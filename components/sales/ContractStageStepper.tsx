'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  CONTRACT_TYPE_LABELS,
  CONTRACT_STAGE_ORDER,
  nextContractStage,
  type ContractType,
} from '@/lib/types'
import { formatDate } from '@/lib/utils'

type StageRow = {
  stage: string
  status: string
  signedAt: string | null // ISO
  number: string | null
}

/**
 * Oś etapów dealu (rezerwacyjna → deweloperska → przeniesienia) + przycisk
 * przejścia do kolejnego etapu. Contract.type = bieżący etap.
 */
export function ContractStageStepper({
  contractId,
  currentStage,
  stages,
}: {
  contractId: string
  currentStage: ContractType
  stages: StageRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentIdx = CONTRACT_STAGE_ORDER.indexOf(currentStage)
  const next = nextContractStage(currentStage)

  async function advance() {
    if (!next) return
    if (!confirm(`Przejść do etapu: ${CONTRACT_TYPE_LABELS[next]}?\nBieżący etap zostanie zachowany w osi.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/advance`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się przejść do kolejnego etapu')
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
      <div className="flex items-stretch gap-2">
        {CONTRACT_STAGE_ORDER.map((stage, idx) => {
          const row = stages.find((s) => s.stage === stage)
          const isCurrent = idx === currentIdx
          const isPast = idx < currentIdx
          const signed = !!row?.signedAt
          const tone = isCurrent
            ? 'border-blue-400 bg-blue-50'
            : isPast
              ? 'border-green-200 bg-green-50'
              : 'border-gray-200 bg-gray-50'
          return (
            <div key={stage} className={`flex-1 rounded-lg border px-3 py-2 ${tone}`}>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    isCurrent ? 'bg-blue-600 text-white' : signed ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-700'
                  }`}
                >
                  {signed && !isCurrent ? '✓' : idx + 1}
                </span>
                <span className={`text-xs font-medium ${isCurrent ? 'text-blue-800' : 'text-gray-700'}`}>
                  {CONTRACT_TYPE_LABELS[stage]}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-gray-500 leading-tight">
                {row?.signedAt ? `Podpisana ${formatDate(new Date(row.signedAt))}` : isCurrent ? 'Etap bieżący' : isPast ? 'Bez daty podpisania' : '—'}
                {row?.number ? <div>Akt: {row.number}</div> : null}
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      {next && (
        <button
          onClick={advance}
          disabled={busy}
          className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium flex items-center gap-2"
        >
          {busy ? 'Przechodzę...' : `Przejdź do etapu: ${CONTRACT_TYPE_LABELS[next]}`}
          <span aria-hidden>→</span>
        </button>
      )}
    </div>
  )
}
