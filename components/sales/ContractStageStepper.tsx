'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  CONTRACT_TYPE_LABELS,
  CONTRACT_STAGE_ORDER,
  nextContractStage,
  prevContractStage,
  type ContractType,
} from '@/lib/types'
import { formatDate } from '@/lib/utils'

type StageRow = {
  stage: string
  status: string
  signedAt: string | null // ISO
  plannedSignDate: string | null // ISO
  number: string | null
}

/**
 * Oś etapów dealu (rezerwacyjna → deweloperska → przeniesienia):
 * - podgląd etapów z datami + numerem aktu,
 * - edycja danych etapu (numer repertorium, daty),
 * - przejście do kolejnego etapu.
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
  const [editStage, setEditStage] = useState<ContractType | null>(null)

  const currentIdx = CONTRACT_STAGE_ORDER.indexOf(currentStage)
  const next = nextContractStage(currentStage)
  const prev = prevContractStage(currentStage)

  async function move(endpoint: 'advance' | 'revert', confirmMsg: string, errMsg: string) {
    if (!confirm(confirmMsg)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/${endpoint}`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || errMsg)
      }
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const advance = () =>
    next &&
    move(
      'advance',
      `Przejść do etapu: ${CONTRACT_TYPE_LABELS[next]}?\nBieżący etap zostanie zachowany w osi.`,
      'Nie udało się przejść do kolejnego etapu',
    )

  const revert = () =>
    prev &&
    move(
      'revert',
      `Cofnąć etap do: ${CONTRACT_TYPE_LABELS[prev]}?\nNiepodpisany bieżący etap zostanie usunięty z osi.`,
      'Nie udało się cofnąć etapu',
    )

  return (
    <div>
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
              <div className="flex items-center justify-between gap-1.5">
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
                {(isCurrent || isPast) && (
                  <button
                    onClick={() => setEditStage(stage)}
                    className="text-[11px] text-gray-400 hover:text-blue-600 flex-shrink-0"
                    title="Edytuj dane etapu"
                  >
                    ✎
                  </button>
                )}
              </div>
              <div className="mt-1 text-[11px] text-gray-500 leading-tight">
                {row?.signedAt ? `Podpisana ${formatDate(new Date(row.signedAt))}` : isCurrent ? 'Etap bieżący' : isPast ? 'Bez daty podpisania' : '—'}
                {row?.number ? <div className="truncate">Akt: {row.number}</div> : null}
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      {(next || prev) && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          {next && (
            <button
              onClick={advance}
              disabled={busy}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              {busy ? 'Przechodzę...' : `Przejdź do etapu: ${CONTRACT_TYPE_LABELS[next]}`}
              <span aria-hidden>→</span>
            </button>
          )}
          {prev && (
            <button
              onClick={revert}
              disabled={busy}
              className="px-3 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 w-full sm:w-auto"
              title={`Cofnij do: ${CONTRACT_TYPE_LABELS[prev]}`}
            >
              <span aria-hidden>←</span>
              Cofnij etap
            </button>
          )}
        </div>
      )}

      {editStage && (
        <StageEditDialog
          contractId={contractId}
          stage={editStage}
          row={stages.find((s) => s.stage === editStage) || null}
          onClose={() => setEditStage(null)}
        />
      )}
    </div>
  )
}

function StageEditDialog({
  contractId,
  stage,
  row,
  onClose,
}: {
  contractId: string
  stage: ContractType
  row: StageRow | null
  onClose: () => void
}) {
  const router = useRouter()
  const [number, setNumber] = useState(row?.number || '')
  const [signedAt, setSignedAt] = useState(row?.signedAt ? row.signedAt.slice(0, 10) : '')
  const [plannedSignDate, setPlannedSignDate] = useState(row?.plannedSignDate ? row.plannedSignDate.slice(0, 10) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/stages/${stage}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number,
          signedAt: signedAt || null,
          plannedSignDate: plannedSignDate || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się zapisać etapu')
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
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Etap: {CONTRACT_TYPE_LABELS[stage]}</h2>
        <p className="text-xs text-gray-500 mb-4">Dane techniczne etapu — numer aktu notarialnego i daty.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Numer aktu / repertorium</label>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="np. Rep. A 1234/2026"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Data podpisania</label>
            <input
              type="date"
              value={signedAt}
              onChange={(e) => setSignedAt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Planowana data podpisania</label>
            <input
              type="date"
              value={plannedSignDate}
              onChange={(e) => setPlannedSignDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Uwaga: edycja daty tutaj nie blokuje lokali. Aby podpisać bieżący etap ze skutkami (blokada lokali),
          użyj przycisku „Oznacz jako podpisaną".
        </p>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Anuluj
          </button>
          <button onClick={save} disabled={busy} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium">
            {busy ? 'Zapisuję...' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  )
}
