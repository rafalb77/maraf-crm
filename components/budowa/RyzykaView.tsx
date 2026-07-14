'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  RISK_KIND_LABELS,
  RISK_SEVERITY_LABELS,
  RISK_SEVERITY_COLORS,
  RISK_STATUS_LABELS,
  RISK_STATUS_COLORS,
  type ConstructionRiskKind,
  type ConstructionRiskSeverity,
  type ConstructionRiskStatus,
} from '@/lib/types'

/**
 * Rejestr ryzyk i blokerów (moduł Budowa, Etap 4). Dodawanie + zmiana
 * statusu/ważności inline. Otwarte na górze, zamknięte (zażegnane/zmaterializowane) niżej.
 */

export type Risk = {
  id: string
  kind: ConstructionRiskKind
  title: string
  description: string | null
  severity: ConstructionRiskSeverity
  status: ConstructionRiskStatus
  impactDays: number | null
  mitigation: string | null
  taskLabel: string | null
  createdByEmail: string | null
  createdAt: string
}
type TaskOpt = { id: string; number: string | null; name: string }

const SEVERITIES: ConstructionRiskSeverity[] = ['NISKIE', 'SREDNIE', 'WYSOKIE', 'KRYTYCZNE']
const STATUSES: ConstructionRiskStatus[] = ['OTWARTE', 'MONITOROWANE', 'ZAZEGNANE', 'ZMATERIALIZOWANE']
const SEV_ORDER: Record<ConstructionRiskSeverity, number> = { KRYTYCZNE: 0, WYSOKIE: 1, SREDNIE: 2, NISKIE: 3 }

export function RyzykaView({ risks: initial, tasks }: { risks: Risk[]; tasks: TaskOpt[] }) {
  const router = useRouter()
  const [risks, setRisks] = useState<Risk[]>(initial)
  const [showAdd, setShowAdd] = useState(false)

  async function patchRisk(id: string, body: Record<string, unknown>) {
    setRisks((rs) => rs.map((r) => (r.id === id ? { ...r, ...(body as Partial<Risk>) } : r)))
    const res = await fetch(`/api/budowa/risks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) router.refresh()
  }
  async function removeRisk(id: string) {
    if (!window.confirm('Usunąć ten wpis z rejestru ryzyk?')) return
    setRisks((rs) => rs.filter((r) => r.id !== id))
    await fetch(`/api/budowa/risks/${id}`, { method: 'DELETE' })
  }

  const closed = new Set<ConstructionRiskStatus>(['ZAZEGNANE', 'ZMATERIALIZOWANE'])
  const open = risks
    .filter((r) => !closed.has(r.status))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  const done = risks.filter((r) => closed.has(r.status))

  return (
    <div>
      <div className="mb-4">
        {showAdd ? (
          <AddRiskForm
            tasks={tasks}
            onClose={() => setShowAdd(false)}
            onAdded={() => {
              setShowAdd(false)
              router.refresh()
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
            style={{ background: '#1F2D3F' }}
          >
            ➕ Dodaj ryzyko / bloker
          </button>
        )}
      </div>

      {risks.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Brak zarejestrowanych ryzyk. Dodaj pierwsze, gdy coś zagraża harmonogramowi albo budżetowi.
        </div>
      ) : (
        <div className="space-y-3">
          {open.map((r) => (
            <RiskCard key={r.id} risk={r} onPatch={patchRisk} onRemove={removeRisk} />
          ))}
          {done.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 pt-3">Zamknięte ({done.length})</p>
              {done.map((r) => (
                <RiskCard key={r.id} risk={r} onPatch={patchRisk} onRemove={removeRisk} dimmed />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function RiskCard({
  risk: r,
  onPatch,
  onRemove,
  dimmed,
}: {
  risk: Risk
  onPatch: (id: string, body: Record<string, unknown>) => void
  onRemove: (id: string) => void
  dimmed?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${dimmed ? 'border-gray-200 opacity-70' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold ${r.kind === 'BLOKER' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'}`}
            >
              {r.kind === 'BLOKER' ? '⛔ Bloker' : '⚠️ Ryzyko'}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_SEVERITY_COLORS[r.severity]}`}>
              {RISK_SEVERITY_LABELS[r.severity]}
            </span>
            {r.impactDays != null && r.impactDays > 0 && (
              <span className="text-xs text-gray-500">wpływ ~{r.impactDays} dni</span>
            )}
          </div>
          <div className="font-medium text-gray-900">{r.title}</div>
          {r.description && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{r.description}</p>}
          {r.taskLabel && <p className="text-xs text-gray-400 mt-1">Zadanie: {r.taskLabel}</p>}
          {r.mitigation && (
            <p className="text-sm text-gray-700 mt-1.5 bg-green-50 rounded-lg px-2 py-1">
              🛡️ {r.mitigation}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <select
            className={`rounded-lg px-2 py-1 text-xs font-semibold border-0 ${RISK_STATUS_COLORS[r.status]}`}
            value={r.status}
            onChange={(e) => onPatch(r.id, { status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {RISK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button onClick={() => onRemove(r.id)} className="text-xs text-gray-300 hover:text-red-500">
            usuń
          </button>
        </div>
      </div>
    </div>
  )
}

function AddRiskForm({
  tasks,
  onClose,
  onAdded,
}: {
  tasks: TaskOpt[]
  onClose: () => void
  onAdded: () => void
}) {
  const [kind, setKind] = useState<ConstructionRiskKind>('RYZYKO')
  const [title, setTitle] = useState('')
  const [severity, setSeverity] = useState<ConstructionRiskSeverity>('SREDNIE')
  const [impactDays, setImpactDays] = useState('')
  const [mitigation, setMitigation] = useState('')
  const [taskId, setTaskId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/budowa/risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, severity, impactDays: impactDays || null, mitigation, taskId: taskId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Błąd (${res.status})`)
      onAdded()
    } catch (e: any) {
      setError(e?.message || 'Nie udało się dodać')
    } finally {
      setSaving(false)
    }
  }

  const inp = 'rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Typ
          <select className={inp} value={kind} onChange={(e) => setKind(e.target.value as ConstructionRiskKind)}>
            {(Object.keys(RISK_KIND_LABELS) as ConstructionRiskKind[]).map((k) => (
              <option key={k} value={k}>
                {RISK_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Ważność
          <select className={inp} value={severity} onChange={(e) => setSeverity(e.target.value as ConstructionRiskSeverity)}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {RISK_SEVERITY_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 md:col-span-2">
          Opis
          <input
            className={inp}
            placeholder="Np. Opóźnienie dostawy okien kl. A o 3 tygodnie"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Wpływ na termin (dni)
          <input
            className={inp}
            type="number"
            min={0}
            placeholder="opcjonalnie"
            value={impactDays}
            onChange={(e) => setImpactDays(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Zadanie
          <select className={inp} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">— bez powiązania —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.number ? `${t.number} ` : ''}
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 md:col-span-2">
          Plan zaradczy (opcjonalnie)
          <input
            className={inp}
            placeholder="Co robimy, żeby nie strzeliło"
            value={mitigation}
            onChange={(e) => setMitigation(e.target.value)}
          />
        </label>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={saving || title.trim().length < 2}
          className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
          style={{ background: '#1F2D3F' }}
        >
          {saving ? 'Dodawanie…' : 'Dodaj'}
        </button>
        <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-gray-300 text-sm">
          Anuluj
        </button>
      </div>
    </div>
  )
}
