'use client'

/**
 * Gantt harmonogramu budowy — SVAR React Gantt (MIT). Moduł Budowa, Etap 2.
 *
 * - etapy = wiersze summary (zwijane), zadania/kamienie pod nimi
 * - drag/resize paska → PATCH /api/budowa/tasks/[id] (zapis po puszczeniu, nie w trakcie)
 * - linia "dziś" (marker), zoom kółkiem (ctrl+scroll) / pinch
 * - dark mode: motyw Willow/WillowDark przełączany W LOCIE MutationObserverem na
 *   klasie .dark (repo przełącza motyw runtime — kryterium spike'a z docs/budowa-rozpoczecie.md)
 * - dwuklik/edytor SVAR wyłączony (intercept show-editor) — edycja szczegółów w widoku Lista
 *
 * UWAGA konwencja dat: SVAR traktuje `end` jako granicę EKSKLUZYWNĄ (pasek kończy się
 * o północy `end`), a nasz model trzyma plannedEnd INKLUZYWNIE (ostatni dzień pracy).
 * Adapter dodaje +1 dzień przy wyświetlaniu i odejmuje przy zapisie.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Gantt, Willow, WillowDark } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/style.css'

type Stage = {
  id: string
  name: string
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
}

const DAY = 86_400_000

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d) // lokalna północ — SVAR renderuje w strefie przeglądarki
}
function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function GanttView({ stages, tasks }: { stages: Stage[]; tasks: Task[] }) {
  const [dark, setDark] = useState(false)
  const apiRef = useRef<any>(null)
  const [saveInfo, setSaveInfo] = useState<string | null>(null)
  useEffect(() => {
    const onResize = () => updateTodayLine()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Dark mode w locie: obserwuj klasę .dark na <html> (ThemeToggle repo)
  useEffect(() => {
    const root = document.documentElement
    setDark(root.classList.contains('dark'))
    const obs = new MutationObserver(() => setDark(root.classList.contains('dark')))
    obs.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const data = useMemo(() => {
    const rows: any[] = []
    const tasksByStage = new Map<string, Task[]>()
    const orphans: Task[] = []
    for (const t of tasks) {
      if (t.stageId) {
        if (!tasksByStage.has(t.stageId)) tasksByStage.set(t.stageId, [])
        tasksByStage.get(t.stageId)!.push(t)
      } else orphans.push(t)
    }

    const stageRow = (id: string, name: string, children: Task[], s?: Stage) => {
      const dates = children.filter((c) => c.plannedStart && c.plannedEnd)
      const minStart = dates.length
        ? new Date(Math.min(...dates.map((c) => parseISO(c.plannedStart!).getTime())))
        : s?.plannedStart
          ? parseISO(s.plannedStart)
          : new Date()
      const maxEnd = dates.length
        ? new Date(Math.max(...dates.map((c) => parseISO(c.plannedEnd!).getTime())))
        : s?.plannedEnd
          ? parseISO(s.plannedEnd)
          : new Date()
      rows.push({
        id: `s:${id}`,
        text: name,
        type: 'summary',
        open: true,
        start: minStart,
        end: new Date(maxEnd.getTime() + DAY), // end ekskluzywny
      })
      for (const t of children) {
        if (!t.plannedStart || !t.plannedEnd) continue
        const start = parseISO(t.plannedStart)
        rows.push({
          id: t.id,
          parent: `s:${id}`,
          text: t.number ? `${t.number} ${t.name}` : t.name,
          type: t.isMilestone ? 'milestone' : 'task',
          start,
          end: t.isMilestone ? undefined : new Date(parseISO(t.plannedEnd).getTime() + DAY),
          progress: t.isMilestone ? undefined : t.progress,
          // status do kolorowania paska (css hook)
          $late:
            !t.isMilestone &&
            t.status !== 'ZAKONCZONE' &&
            t.status !== 'ANULOWANE' &&
            parseISO(t.plannedEnd).getTime() < Date.now() - DAY,
        })
      }
    }

    for (const s of [...stages].sort((a, b) => a.order - b.order)) {
      stageRow(s.id, s.name, tasksByStage.get(s.id) || [], s)
    }
    if (orphans.length) stageRow('_orphan', 'Bez etapu', orphans)
    return rows
  }, [stages, tasks])

  // UWAGA: prop `markers` SVAR jest funkcją PRO — wersja MIT zeruje go w store
  // (razem z baselines/undo/criticalPath). Linię "dziś" rysujemy więc sami:
  // pozycja = interpolacja czasu w szerokości skali (_scales), div wpinany
  // do scrollowanej treści .wx-chart (jedzie ze scrollem, przelicza się po zoomie).
  const containerRef = useRef<HTMLDivElement>(null)

  function updateTodayLine() {
    const api = apiRef.current
    const host = containerRef.current
    if (!api || !host) return
    const st = api.getState()
    const sc = st?._scales
    const chart = host.querySelector('.wx-chart') as HTMLElement | null
    if (!sc || !chart) return
    const t0 = sc.start instanceof Date ? sc.start.getTime() : null
    const t1 = sc.end instanceof Date ? sc.end.getTime() : null
    if (!t0 || !t1 || t1 <= t0) return
    const x = Math.round(((Date.now() - t0) / (t1 - t0)) * sc.width)
    let line = chart.querySelector('.budowa-today-line') as HTMLElement | null
    if (!line) {
      line = document.createElement('div')
      line.className = 'budowa-today-line'
      line.innerHTML = '<span>dziś</span>'
      chart.appendChild(line)
    }
    line.style.left = `${x}px`
    line.style.height = `${Math.max(chart.scrollHeight, chart.clientHeight)}px`
    line.style.display = x >= 0 && x <= sc.width ? 'block' : 'none'
  }

  const scales = useMemo(
    () => [
      {
        unit: 'month' as const,
        step: 1,
        format: (d: Date) =>
          new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(d),
      },
      { unit: 'week' as const, step: 1, format: (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}` },
    ],
    [],
  )

  const columns = useMemo(
    () => [{ id: 'text', header: 'Zadanie', flexgrow: 1, width: 320 }],
    [],
  )

  async function persistTask(id: string, task: any) {
    // wiersze etapów (s:*) nie są edytowalne
    if (typeof id === 'string' && id.startsWith('s:')) return
    const patch: Record<string, string> = {}
    if (task.start instanceof Date) patch.plannedStart = toISO(task.start)
    if (task.end instanceof Date) {
      patch.plannedEnd = toISO(new Date(task.end.getTime() - DAY)) // end ekskluzywny → inkluzywny
    } else if (task.type === 'milestone' && task.start instanceof Date) {
      patch.plannedEnd = toISO(task.start)
    }
    if (Object.keys(patch).length === 0) return
    try {
      const res = await fetch(`/api/budowa/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Błąd zapisu (${res.status})`)
      }
      setSaveInfo('✓ zapisano')
      setTimeout(() => setSaveInfo(null), 2000)
    } catch (e: any) {
      setSaveInfo(`✕ ${e?.message || 'błąd zapisu'} — odśwież stronę`)
    }
  }

  function init(api: any) {
    apiRef.current = api
    if (typeof window !== 'undefined') (window as any).__ganttApi = api // debug hook
    // startowy widok: wycentruj na "dziś" (harmonogram zaczyna się rok wstecz)
    try {
      api.exec('scroll-chart', { date: new Date(Date.now() - 14 * DAY) })
    } catch {}
    // linia "dziś": narysuj po zamontowaniu DOM, przeliczaj po zoomie i zmianach zadań
    setTimeout(updateTodayLine, 0)
    try {
      api.on('zoom-scale', () => setTimeout(updateTodayLine, 0))
    } catch {}
    // edytor SVAR (dwuklik) wyłączony — szczegóły edytuje widok Lista
    api.intercept('show-editor', () => false)
    // blokuj drag wierszy-etapów; zapisuj zadanie dopiero po puszczeniu (inProgress false)
    api.intercept('update-task', (ev: any) => {
      if (typeof ev.id === 'string' && ev.id.startsWith('s:')) return false
      return true
    })
    api.on('update-task', (ev: any) => {
      setTimeout(updateTodayLine, 0) // zmiana zakresu dat może przeskalować oś
      if (ev.inProgress) return
      void persistTask(ev.id, ev.task || {})
    })
  }

  const Theme = dark ? WillowDark : Willow

  return (
    <div ref={containerRef} className="budowa-gantt bg-white rounded-xl border border-gray-200 overflow-hidden">
      <style>{`
        .budowa-gantt .wx-chart { position: relative; }
        .budowa-gantt .budowa-today-line {
          position: absolute; top: 0; width: 0; z-index: 4; pointer-events: none;
          border-left: 2px solid #d4a574;
        }
        .budowa-gantt .budowa-today-line span {
          position: sticky; top: 2px; display: inline-block; transform: translateX(-50%);
          background: #d4a574; color: #1F2D3F; font-size: 10px; font-weight: 700;
          padding: 1px 6px; border-radius: 999px; white-space: nowrap;
        }
        .budowa-gantt .wx-willow-theme, .budowa-gantt .wx-willow-dark-theme { --wx-gantt-select-color: rgba(212,165,116,.2); }
      `}</style>
      {saveInfo && (
        <div className="px-4 py-1.5 text-xs border-b border-gray-100" style={{ color: saveInfo.startsWith('✓') ? '#15803d' : '#dc2626' }}>
          {saveInfo}
        </div>
      )}
      <div style={{ height: 'calc(100vh - 260px)', minHeight: 420 }}>
        <Theme>
          <Gantt
            tasks={data}
            links={[]}
            scales={scales as any}
            columns={columns as any}
            cellWidth={26}
            zoom
            init={init}
          />
        </Theme>
      </div>
      <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
        Przeciągnij pasek, żeby zmienić termin (zapis automatyczny) • Ctrl+kółko = zoom •
        edycja szczegółów w widoku „Lista"
      </div>
    </div>
  )
}
