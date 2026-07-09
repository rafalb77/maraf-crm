'use client'

import { useMemo, useState } from 'react'
import {
  CONSTRUCTION_TASK_STATUS_LABELS,
  CONSTRUCTION_TASK_STATUS_COLORS,
  ConstructionTaskStatus,
} from '@/lib/types'

type Stage = {
  id: string
  name: string
  status: string
  order: number
  plannedStart: string | null
  plannedEnd: string | null
}
type Task = {
  id: string
  number: string | null
  name: string
  stageId: string | null
  status: string
  progress: number
  plannedStart: string | null
  plannedEnd: string | null
  isMilestone: boolean
  subcontractorId: string | null
  delayReason: string | null
}
type Sub = { id: string; name: string }
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const STATUS_OPTIONS = Object.keys(CONSTRUCTION_TASK_STATUS_LABELS) as ConstructionTaskStatus[]
const DONE_STATUSES = new Set(['ZAKONCZONE', 'ANULOWANE'])

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function fmtPL(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
function daysBetween(aISO: string, bISO: string): number {
  return Math.round((Date.parse(bISO) - Date.parse(aISO)) / 86_400_000)
}

export function HarmonogramView({
  stages,
  tasks: initialTasks,
  subcontractors,
  plannedEndDate,
}: {
  stages: Stage[]
  tasks: Task[]
  subcontractors: Sub[]
  plannedEndDate: string | null
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const today = todayISO()
  const subName = useMemo(() => new Map(subcontractors.map((s) => [s.id, s.name])), [subcontractors])

  async function saveTask(id: string, patch: Partial<Task>) {
    // optymistycznie
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    setSaveStates((s) => ({ ...s, [id]: 'saving' }))
    setErrors((e) => ({ ...e, [id]: '' }))
    try {
      const res = await fetch(`/api/budowa/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Błąd (${res.status})`)
      // serwer może domknąć status przy 100% — zsynchronizuj
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...data } : t)))
      setSaveStates((s) => ({ ...s, [id]: 'saved' }))
      setTimeout(() => setSaveStates((s) => ({ ...s, [id]: 'idle' })), 1500)
    } catch (e: any) {
      setSaveStates((s) => ({ ...s, [id]: 'error' }))
      setErrors((er) => ({ ...er, [id]: e?.message || 'Nie zapisano' }))
    }
  }

  // Metryki
  const activeTasks = tasks.filter((t) => t.status !== 'ANULOWANE')
  const avgProgress =
    activeTasks.length === 0
      ? 0
      : Math.round(activeTasks.reduce((sum, t) => sum + t.progress, 0) / activeTasks.length)
  const delayed = tasks.filter(
    (t) => t.plannedEnd && t.plannedEnd < today && !DONE_STATUSES.has(t.status),
  )
  const lastEnd = tasks.reduce<string | null>(
    (max, t) => (t.plannedEnd && (!max || t.plannedEnd > max) ? t.plannedEnd : max),
    null,
  )
  const endThreatened = !!(plannedEndDate && lastEnd && lastEnd > plannedEndDate)

  // Grupowanie zadań po etapie (kolejność etapów + zadania bez etapu na końcu)
  const groups = stages.map((s) => ({
    stage: s,
    tasks: tasks.filter((t) => t.stageId === s.id),
  }))
  const orphanTasks = tasks.filter((t) => !t.stageId || !stages.some((s) => s.id === t.stageId))

  return (
    <div>
      {/* Podsumowanie */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Metric label="Postęp (średnia)" value={`${avgProgress}%`} />
        <Metric label="Zadań" value={String(activeTasks.length)} />
        <Metric
          label="Opóźnionych"
          value={String(delayed.length)}
          tone={delayed.length > 0 ? 'red' : 'green'}
        />
        <Metric
          label="Termin końcowy"
          value={endThreatened ? 'zagrożony' : plannedEndDate ? 'w planie' : '—'}
          tone={endThreatened ? 'red' : 'green'}
        />
      </div>

      {endThreatened && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          ⚠️ Ostatnie zadanie kończy się {fmtPL(lastEnd)}, a planowany koniec inwestycji to{' '}
          {fmtPL(plannedEndDate)} — harmonogram wykracza poza termin.
        </div>
      )}

      {groups.map((g) => (
        <StageBlock
          key={g.stage.id}
          stage={g.stage}
          tasks={g.tasks}
          today={today}
          subName={subName}
          subcontractors={subcontractors}
          saveStates={saveStates}
          errors={errors}
          onSave={saveTask}
        />
      ))}

      {orphanTasks.length > 0 && (
        <StageBlock
          stage={{ id: '_orphan', name: 'Bez etapu', status: '', order: 999, plannedStart: null, plannedEnd: null }}
          tasks={orphanTasks}
          today={today}
          subName={subName}
          subcontractors={subcontractors}
          saveStates={saveStates}
          errors={errors}
          onSave={saveTask}
        />
      )}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'green' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-green-700' : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

function StageBlock({
  stage,
  tasks,
  today,
  subName,
  subcontractors,
  saveStates,
  errors,
  onSave,
}: {
  stage: Stage
  tasks: Task[]
  today: string
  subName: Map<string, string>
  subcontractors: Sub[]
  saveStates: Record<string, SaveState>
  errors: Record<string, string>
  onSave: (id: string, patch: Partial<Task>) => void
}) {
  const [open, setOpen] = useState(true)
  const stageProgress =
    tasks.length === 0
      ? 0
      : Math.round(
          tasks.filter((t) => t.status !== 'ANULOWANE').reduce((s, t) => s + t.progress, 0) /
            Math.max(1, tasks.filter((t) => t.status !== 'ANULOWANE').length),
        )
  const range = tasks.reduce<{ start: string | null; end: string | null }>(
    (acc, t) => ({
      start: t.plannedStart && (!acc.start || t.plannedStart < acc.start) ? t.plannedStart : acc.start,
      end: t.plannedEnd && (!acc.end || t.plannedEnd > acc.end) ? t.plannedEnd : acc.end,
    }),
    { start: null, end: null },
  )

  return (
    <div className="mb-5 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-left"
      >
        <span className="flex items-center gap-2 font-semibold">
          <span className="text-gray-400">{open ? '▼' : '▶'}</span>
          {stage.name}
        </span>
        <span className="flex items-center gap-4 text-sm text-gray-500">
          <span>{fmtPL(range.start)} → {fmtPL(range.end)}</span>
          <span className="font-semibold text-gray-700">{stageProgress}%</span>
        </span>
      </button>

      {open && (
        <div className="divide-y divide-gray-100">
          {tasks.length === 0 && (
            <div className="px-5 py-4 text-sm text-gray-400">Brak zadań w tym etapie.</div>
          )}
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              subName={subName}
              subcontractors={subcontractors}
              saveState={saveStates[t.id] || 'idle'}
              error={errors[t.id]}
              onSave={onSave}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  today,
  subName,
  subcontractors,
  saveState,
  error,
  onSave,
}: {
  task: Task
  today: string
  subName: Map<string, string>
  subcontractors: Sub[]
  saveState: SaveState
  error?: string
  onSave: (id: string, patch: Partial<Task>) => void
}) {
  const delayed = !!(task.plannedEnd && task.plannedEnd < today && !DONE_STATUSES.has(task.status))
  const delayDays = delayed && task.plannedEnd ? daysBetween(task.plannedEnd, today) : 0
  const statusColor =
    CONSTRUCTION_TASK_STATUS_COLORS[task.status as ConstructionTaskStatus] || 'bg-gray-100 text-gray-600'

  const dateCls = 'rounded-lg border border-gray-300 px-2 py-1 text-sm bg-white'

  return (
    <div className={`px-5 py-3 ${delayed ? 'bg-red-50/40' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* numer + nazwa */}
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            {task.number && <span className="text-xs text-gray-400 font-mono">{task.number}</span>}
            {task.isMilestone && <span title="Kamień milowy">◆</span>}
            <span className="font-medium">{task.name}</span>
          </div>
          {task.subcontractorId && (
            <div className="text-xs text-gray-400 mt-0.5">
              {subName.get(task.subcontractorId) || 'wykonawca'}
            </div>
          )}
        </div>

        {/* daty */}
        <label className="flex items-center gap-1 text-xs text-gray-500">
          od
          <input
            type="date"
            className={dateCls}
            value={task.plannedStart || ''}
            onChange={(e) => onSave(task.id, { plannedStart: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          do
          <input
            type="date"
            className={dateCls}
            value={task.plannedEnd || ''}
            onChange={(e) => onSave(task.id, { plannedEnd: e.target.value })}
          />
        </label>

        {/* postęp */}
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input
            type="number"
            min={0}
            max={100}
            step={5}
            className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm text-right"
            value={task.progress}
            onChange={(e) => {
              const v = Math.max(0, Math.min(100, Number(e.target.value)))
              onSave(task.id, { progress: v })
            }}
          />
          %
        </label>

        {/* status */}
        <select
          className={`rounded-lg px-2 py-1 text-xs font-semibold border-0 ${statusColor}`}
          value={task.status}
          onChange={(e) => onSave(task.id, { status: e.target.value })}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {CONSTRUCTION_TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        {/* wykonawca */}
        <select
          className="rounded-lg border border-gray-300 px-2 py-1 text-xs bg-white max-w-[140px]"
          value={task.subcontractorId || ''}
          onChange={(e) => onSave(task.id, { subcontractorId: e.target.value || null })}
          title="Wykonawca"
        >
          <option value="">— wykonawca —</option>
          {subcontractors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {/* status zapisu */}
        <span className="w-16 text-xs">
          {saveState === 'saving' && <span className="text-amber-600">zapis…</span>}
          {saveState === 'saved' && <span className="text-green-600">✓ zapisano</span>}
          {saveState === 'error' && <span className="text-red-600">✕ błąd</span>}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-1">
        {delayed && (
          <span className="text-xs text-red-600 font-semibold">
            ⚠️ opóźnione o {delayDays} {delayDays === 1 ? 'dzień' : 'dni'}
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
