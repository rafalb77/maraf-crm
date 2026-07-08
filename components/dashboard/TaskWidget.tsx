'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Star, Clock, Phone, X, ChevronDown, ChevronUp } from 'lucide-react'
import {
  TASK_TYPE_ICONS,
  TASK_BUCKET_LABELS,
  type TaskBucket,
  type TaskType,
} from '@/lib/types'

/**
 * Widget „Do zrobienia" na pulpicie — lista zadań z /api/tasks (ręcznych
 * i generowanych przez silnik reguł w lib/tasks.ts), pogrupowana w koszyki
 * pilności. Akcje: odhaczenie, drzemka, przypięcie, usunięcie, szybkie
 * dodawanie, kontekstowe linki (klient / umowa / sprawa / tel:).
 */

type ApiTask = {
  id: string
  title: string
  description: string | null
  type: TaskType
  dueAt: string | null
  pinned: boolean
  source: 'MANUAL' | 'RULE'
  score: number
  bucket: TaskBucket
  client: { id: string; firstName: string; lastName: string; phone: string | null } | null
  unit: { id: string; number: string } | null
  contract: { id: string; number: string } | null
  case: { id: string; number: string } | null
}

type Stats = { openCount: number; overdueCount: number; todayCount: number; doneToday: number }

const BUCKET_ORDER: TaskBucket[] = ['PRZETERMINOWANE', 'DZIS', 'NADCHODZACE', 'POZNIEJ']

const BUCKET_HEADER_COLORS: Record<TaskBucket, string> = {
  PRZETERMINOWANE: 'text-red-600',
  DZIS: 'text-amber-600',
  NADCHODZACE: 'text-blue-600',
  POZNIEJ: 'text-gray-400',
}

const BUCKET_CHIP_COLORS: Record<TaskBucket, string> = {
  PRZETERMINOWANE: 'bg-red-100 text-red-700',
  DZIS: 'bg-amber-100 text-amber-700',
  NADCHODZACE: 'bg-blue-100 text-blue-700',
  POZNIEJ: 'bg-gray-100 text-gray-500',
}

function fmtShort(date: string): string {
  return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit' }).format(new Date(date))
}

export function TaskWidget() {
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [addTitle, setAddTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [showLater, setShowLater] = useState(false)
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/tasks', { signal: AbortSignal.timeout(15000) })
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      setTasks(d.tasks)
      setStats(d.stats)
    } catch {
      // 401 / timeout — widget znika, pulpit działa dalej
      setTasks([])
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>, optimistic?: (t: ApiTask[]) => ApiTask[]) => {
      if (optimistic) setTasks(optimistic)
      setSnoozeOpenId(null)
      const r = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) await load()
    },
    [load]
  )

  const adjustStats = (t: ApiTask, done: boolean) =>
    setStats((s) =>
      s
        ? {
            ...s,
            openCount: s.openCount - 1,
            doneToday: done ? s.doneToday + 1 : s.doneToday,
            overdueCount: t.bucket === 'PRZETERMINOWANE' ? s.overdueCount - 1 : s.overdueCount,
            todayCount: t.bucket === 'DZIS' ? s.todayCount - 1 : s.todayCount,
          }
        : s
    )

  const complete = (t: ApiTask) => {
    adjustStats(t, true)
    patch(t.id, { action: 'complete' }, (list) => list.filter((x) => x.id !== t.id))
  }

  const snooze = (t: ApiTask, until: Date) => {
    adjustStats(t, false)
    patch(t.id, { action: 'snooze', snoozeUntil: until.toISOString() }, (list) =>
      list.filter((x) => x.id !== t.id)
    )
  }

  const togglePin = (t: ApiTask) => {
    patch(t.id, { action: t.pinned ? 'unpin' : 'pin' })
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, pinned: !x.pinned } : x)))
  }

  const remove = async (t: ApiTask) => {
    setTasks((list) => list.filter((x) => x.id !== t.id))
    adjustStats(t, false)
    const r = await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' })
    if (!r.ok) await load()
  }

  const add = async () => {
    const title = addTitle.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (r.ok) {
        setAddTitle('')
        await load()
      }
    } finally {
      setAdding(false)
    }
  }

  const grouped = useMemo(() => {
    const g: Record<TaskBucket, ApiTask[]> = {
      PRZETERMINOWANE: [],
      DZIS: [],
      NADCHODZACE: [],
      POZNIEJ: [],
    }
    for (const t of tasks) g[t.bucket].push(t)
    return g
  }, [tasks])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 v2-card-in flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        <span className="text-sm text-gray-400">Ładuję zadania…</span>
      </div>
    )
  }

  // Brak sesji / błąd API — nie pokazujemy pustej ramki
  if (!stats) return null

  const todayTotal = stats.overdueCount + stats.todayCount + stats.doneToday
  const todayPct = todayTotal > 0 ? Math.round((stats.doneToday / todayTotal) * 100) : 100

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 v2-card-in" style={{ animationDelay: '.06s' }}>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="font-semibold text-gray-900">Do zrobienia</h2>
        {stats.overdueCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            {stats.overdueCount} po terminie
          </span>
        )}
        <div className="flex-1" />
        <span className="text-xs text-gray-500">
          {stats.doneToday} z {todayTotal} na dziś
        </span>
        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${todayPct}%` }} />
        </div>
      </div>

      {stats.openCount === 0 ? (
        <p className="text-sm text-gray-400 mb-4">Brak otwartych zadań — wszystko ogarnięte ✅</p>
      ) : (
        <div className="space-y-4 mb-4">
          {BUCKET_ORDER.map((bucket) => {
            const list = grouped[bucket]
            if (list.length === 0) return null
            if (bucket === 'POZNIEJ' && !showLater) {
              return (
                <button
                  key={bucket}
                  onClick={() => setShowLater(true)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  Pokaż późniejsze ({list.length})
                </button>
              )
            }
            return (
              <div key={bucket}>
                <div className="flex items-center gap-2 mb-1">
                  <p className={`text-xs font-semibold ${BUCKET_HEADER_COLORS[bucket]}`}>
                    {TASK_BUCKET_LABELS[bucket]} ({list.length})
                  </p>
                  {bucket === 'POZNIEJ' && (
                    <button onClick={() => setShowLater(false)} className="text-gray-300 hover:text-gray-500">
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="divide-y divide-gray-100">
                  {list.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      snoozeOpen={snoozeOpenId === t.id}
                      onToggleSnoozeMenu={() => setSnoozeOpenId(snoozeOpenId === t.id ? null : t.id)}
                      onComplete={() => complete(t)}
                      onSnooze={(until) => snooze(t, until)}
                      onTogglePin={() => togglePin(t)}
                      onRemove={() => remove(t)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          value={addTitle}
          onChange={(e) => setAddTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Dodaj zadanie na dziś i naciśnij Enter…"
          className="flex-1 text-sm outline-none placeholder:text-gray-400 bg-transparent"
          maxLength={300}
        />
        {adding && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>
    </div>
  )
}

function snoozeOptions(): { label: string; until: Date }[] {
  const plus2h = new Date(Date.now() + 2 * 3600_000)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(8, 0, 0, 0)
  const in3days = new Date()
  in3days.setDate(in3days.getDate() + 3)
  in3days.setHours(8, 0, 0, 0)
  return [
    { label: 'Za 2 godziny', until: plus2h },
    { label: 'Jutro rano', until: tomorrow },
    { label: 'Za 3 dni', until: in3days },
  ]
}

function TaskRow({
  task: t,
  snoozeOpen,
  onToggleSnoozeMenu,
  onComplete,
  onSnooze,
  onTogglePin,
  onRemove,
}: {
  task: ApiTask
  snoozeOpen: boolean
  onToggleSnoozeMenu: () => void
  onComplete: () => void
  onSnooze: (until: Date) => void
  onTogglePin: () => void
  onRemove: () => void
}) {
  const meta: React.ReactNode[] = []
  if (t.client) {
    meta.push(
      <Link key="c" href={`/clients/${t.client.id}`} className="hover:text-blue-600">
        {t.client.firstName} {t.client.lastName}
      </Link>
    )
  }
  if (t.unit) {
    meta.push(
      <Link key="u" href="/rezerwacje" className="hover:text-blue-600">
        lokal {t.unit.number}
      </Link>
    )
  }
  if (t.contract) {
    meta.push(
      <Link key="k" href={`/sales/${t.contract.id}`} className="hover:text-blue-600">
        umowa {t.contract.number}
      </Link>
    )
  }
  if (t.case) {
    meta.push(
      <Link key="s" href={`/cases/${t.case.id}`} className="hover:text-blue-600">
        {t.case.number}
      </Link>
    )
  }

  return (
    <div className="group flex items-start gap-3 py-2.5 relative">
      <button
        onClick={onComplete}
        title="Oznacz jako zrobione"
        className="mt-0.5 w-[18px] h-[18px] rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 flex-shrink-0 transition-colors"
      />
      <span className="text-base leading-5 flex-shrink-0" aria-hidden>
        {TASK_TYPE_ICONS[t.type] || '📌'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 leading-5">
          {t.pinned && <Star className="inline w-3.5 h-3.5 text-amber-500 fill-amber-400 mr-1 -mt-0.5" />}
          {t.title}
        </p>
        {(meta.length > 0 || t.source === 'RULE') && (
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 flex-wrap">
            {meta.map((m, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">·</span>}
                {m}
              </span>
            ))}
            {t.source === 'RULE' && (
              <span className="px-1.5 rounded bg-gray-100 text-gray-400 text-[10px] font-medium uppercase tracking-wide">
                auto
              </span>
            )}
          </p>
        )}
      </div>

      <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${BUCKET_CHIP_COLORS[t.bucket]}`}>
        {t.bucket === 'PRZETERMINOWANE' && 'po terminie'}
        {t.bucket === 'DZIS' && 'dziś'}
        {(t.bucket === 'NADCHODZACE' || t.bucket === 'POZNIEJ') && (t.dueAt ? fmtShort(t.dueAt) : 'bez terminu')}
      </span>

      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {t.client?.phone && (
          <a
            href={`tel:${t.client.phone.replace(/\s+/g, '')}`}
            title={`Zadzwoń: ${t.client.phone}`}
            className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600"
          >
            <Phone className="w-4 h-4" />
          </a>
        )}
        <button
          onClick={onTogglePin}
          title={t.pinned ? 'Odepnij' : 'Przypnij na górę'}
          className={`p-1 rounded hover:bg-amber-50 ${t.pinned ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}
        >
          <Star className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleSnoozeMenu}
          title="Przełóż na później"
          className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600"
        >
          <Clock className="w-4 h-4" />
        </button>
        <button
          onClick={onRemove}
          title={t.source === 'MANUAL' ? 'Usuń zadanie' : 'Anuluj zadanie (nie wróci)'}
          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {snoozeOpen && (
        <div className="absolute right-0 top-9 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36">
          {snoozeOptions().map((o) => (
            <button
              key={o.label}
              onClick={() => onSnooze(o.until)}
              className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
