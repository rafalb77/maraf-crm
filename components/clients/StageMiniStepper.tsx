import { CONTRACT_TYPE_LABELS, CONTRACT_STAGE_ORDER, type ContractType } from '@/lib/types'
import { formatDate } from '@/lib/utils'

// Read-only kopia wizualna kafli z components/sales/ContractStageStepper.tsx
// (świadoma duplikacja — bez ołówków, advance/revert i dialogów; mutacje etapów
// wyłącznie na karcie umowy w module Sprzedaż).

type StageRow = {
  stage: string
  status: string
  signedAt: string | null // ISO
  number: string | null
}

export function StageMiniStepper({
  currentStage,
  stages,
  daysInStage,
}: {
  currentStage: string
  stages: StageRow[]
  daysInStage: number | null
}) {
  const currentIdx = CONTRACT_STAGE_ORDER.indexOf(currentStage as ContractType)
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
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
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${
                  isCurrent ? 'bg-blue-600 text-white' : signed ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-700'
                }`}
              >
                {signed && !isCurrent ? '✓' : idx + 1}
              </span>
              <span className={`text-xs font-medium truncate ${isCurrent ? 'text-blue-800' : 'text-gray-700'}`}>
                {CONTRACT_TYPE_LABELS[stage]}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-gray-500 leading-tight">
              {row?.signedAt ? `Podpisana ${formatDate(new Date(row.signedAt))}` : isCurrent ? 'Etap bieżący' : isPast ? 'Bez daty podpisania' : '—'}
              {row?.number ? <div className="truncate">Akt: {row.number}</div> : null}
              {isCurrent && daysInStage != null && (
                <div className="text-blue-700/70">{daysInStage === 1 ? '1 dzień w etapie' : `${daysInStage} dni w etapie`}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
