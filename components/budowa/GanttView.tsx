'use client'

/**
 * Gantt harmonogramu budowy — SVAR React Gantt (MIT) + własna warstwa wizualna.
 * Moduł Budowa, Etap 2. Redesign po feedbacku Rafała 2026-07-11.
 *
 * - pełny CSS biblioteki (all.css — okrojony style.css psuł wirtualizację/scroll!)
 * - własny taskTemplate: paski w kolorach etapu, pasek postępu, % i nazwa na pasku,
 *   hover = uniesienie + cień + chip z datami; kamienie = złote romby (spóźnione: czerwone, pulsują)
 * - Tooltip (hover) z pełnym kontekstem: etap, terminy, dni, postęp, wykonawca, opóźnienie
 * - highlightTime: weekendy + kolumna "dziś" (widoczne przy skali dziennej)
 * - pasek narzędzi: skala Dzień/Tydzień/Miesiąc, przycisk "Dziś", legenda kolorów etapów
 * - drag/resize → PATCH /api/budowa/tasks/[id] (bez zmian); edytor SVAR wyłączony
 * - dark mode w locie (MutationObserver na .dark); linia "dziś" własna (markery SVAR = PRO)
 *
 * Konwencja dat: SVAR end EKSKLUZYWNY vs plannedEnd INKLUZYWNY (+1/-1 dzień w adapterze).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Gantt, Willow, WillowDark, Tooltip } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/all.css'

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
  subcontractorId?: string | null
}
type Sub = { id: string; name: string }

const DAY = 86_400_000

// Paleta etapów — czytelna w light i dark (pasek = kolor pełny, tło = przezroczysty wariant)
const STAGE_COLORS = [
  '#C9A37A', // złoto MARAF
  '#5B7DB1', // stalowy błękit
  '#5FA88F', // szałwia
  '#C97A7A', // terakota
  '#8B7AC9', // śliwka
  '#4FA3B8', // morski
  '#A8A15F', // oliwka
]

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtPL(s: string | null): string {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

const SCALE_PRESETS = {
  dzien: {
    label: 'Dzień',
    cellWidth: 34,
    scales: [
      { unit: 'month', step: 1, format: (d: Date) => new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(d) },
      { unit: 'day', step: 1, format: (d: Date) => String(d.getDate()) },
    ],
  },
  tydzien: {
    label: 'Tydzień',
    cellWidth: 40,
    scales: [
      { unit: 'month', step: 1, format: (d: Date) => new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(d) },
      { unit: 'week', step: 1, format: (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}` },
    ],
  },
  miesiac: {
    label: 'Miesiąc',
    cellWidth: 64,
    scales: [
      { unit: 'year', step: 1, format: (d: Date) => String(d.getFullYear()) },
      { unit: 'month', step: 1, format: (d: Date) => new Intl.DateTimeFormat('pl-PL', { month: 'short' }).format(d) },
    ],
  },
} as const
type PresetKey = keyof typeof SCALE_PRESETS

// ---------------------------------------------------------------- pasek zadania
function TaskBar({ data }: { data: any }) {
  if (data.type === 'milestone') {
    return (
      <div className={`bud-ms${data.$late ? ' bud-ms-late' : ''}`} title={data.text}>
        <span className="bud-ms-label">{data.text}</span>
      </div>
    )
  }
  if (data.type === 'summary') {
    return <div className="bud-summary" style={{ ['--c' as any]: data.$color }} />
  }
  const pct = Math.max(0, Math.min(100, Math.round(data.progress ?? 0)))
  return (
    <div
      className={`bud-bar${data.$late ? ' bud-bar-late' : ''}${data.$done ? ' bud-bar-done' : ''}`}
      style={{ ['--c' as any]: data.$color }}
    >
      <div className="bud-bar-fill" style={{ width: `${pct}%` }} />
      <span className="bud-bar-text">{data.$shortName}</span>
      <span className="bud-bar-pct">{pct > 0 ? `${pct}%` : ''}</span>
      {data.$late && <span className="bud-bar-warn">⚠</span>}
      <span className="bud-bar-dates">
        {fmtPL(data.$isoStart)} – {fmtPL(data.$isoEnd)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- tooltip (hover)
function TaskTip({ data }: { data: any; api: any }) {
  if (!data || String(data.id).startsWith('s:')) {
    return data ? (
      <div className="bud-tip">
        <div className="bud-tip-title">{data.text}</div>
        <div className="bud-tip-row">Etap harmonogramu — rozwiń, aby zobaczyć zadania</div>
      </div>
    ) : null
  }
  const pct = Math.round(data.progress ?? 0)
  const days =
    data.$isoStart && data.$isoEnd
      ? Math.round((parseISO(data.$isoEnd).getTime() - parseISO(data.$isoStart).getTime()) / DAY) + 1
      : null
  return (
    <div className="bud-tip">
      <div className="bud-tip-title">
        {data.number && <span className="bud-tip-num">{data.number}</span>}
        {data.name || data.text}
      </div>
      {data.$stageName && (
        <div className="bud-tip-row">
          <i style={{ background: data.$color }} /> {data.$stageName}
        </div>
      )}
      <div className="bud-tip-row">
        📅 {fmtPL(data.$isoStart)} → {fmtPL(data.$isoEnd)}
        {days ? ` (${days} dni)` : ''}
      </div>
      {data.type !== 'milestone' && (
        <div className="bud-tip-row">
          <span className="bud-tip-meter">
            <span style={{ width: `${pct}%` }} />
          </span>
          {pct}%
        </div>
      )}
      {data.$subName && <div className="bud-tip-row">👷 {data.$subName}</div>}
      {data.$late && <div className="bud-tip-late">⚠ opóźnione — planowy koniec minął</div>}
      {data.type === 'milestone' && <div className="bud-tip-row">◆ kamień milowy (termin umowny)</div>}
    </div>
  )
}

export function GanttView({
  stages,
  tasks,
  subcontractors = [],
}: {
  stages: Stage[]
  tasks: Task[]
  subcontractors?: Sub[]
}) {
  const [dark, setDark] = useState(false)
  const [preset, setPreset] = useState<PresetKey>('tydzien')
  const apiRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [saveInfo, setSaveInfo] = useState<string | null>(null)
  const [tooltipApi, setTooltipApi] = useState<any>(null)
  // Pionowy scroll: SVAR wirtualizuje wiersze przez akcję 'scroll-chart' w store,
  // ale w wersji React 2.7 ŻADEN element nie karmi jej pionowo (wheel na wykresie
  // obsługuje tylko ctrl+zoom) — stąd "zadania nie przewijają się" na produkcji.
  // Mostek: własny natywny pasek przewijania (proxy) + wheel na całym widgecie,
  // oba wołają exec('scroll-chart', {top}).
  const vscrollRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)
  const [contentH, setContentH] = useState(0)

  function visibleRowsHeight(): number {
    const api = apiRef.current
    if (!api) return 0
    const st = api.getState()
    const cellH = st.cellHeight || 30
    const seen = new Set<string>()
    const walk = (arr: any[]) => {
      for (const t of arr || []) {
        if (seen.has(String(t.id))) continue
        seen.add(String(t.id))
        if (t.data && t.open !== false) walk(t.data)
      }
    }
    walk(st._tasks || [])
    return seen.size * cellH
  }

  function refreshContentHeight() {
    setContentH(visibleRowsHeight())
  }

  function doScroll(top: number) {
    const api = apiRef.current
    if (!api) return
    const viewH = (containerRef.current?.querySelector('.bud-size') as HTMLElement)?.clientHeight || 420
    const max = Math.max(0, visibleRowsHeight() - viewH + 60)
    const clamped = Math.max(0, Math.min(max, Math.round(top)))
    try {
      api.exec('scroll-chart', { top: clamped })
    } catch {}
    const proxy = vscrollRef.current
    if (proxy && Math.abs(proxy.scrollTop - clamped) > 1) {
      syncingRef.current = true
      proxy.scrollTop = clamped
      requestAnimationFrame(() => {
        syncingRef.current = false
      })
    }
  }

  useEffect(() => {
    const root = document.documentElement
    setDark(root.classList.contains('dark'))
    const obs = new MutationObserver(() => setDark(root.classList.contains('dark')))
    obs.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const onResize = () => updateTodayLine()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const subName = useMemo(() => new Map(subcontractors.map((s) => [s.id, s.name])), [subcontractors])

  const { data, legend } = useMemo(() => {
    const rows: any[] = []
    const legend: { name: string; color: string }[] = []
    const byStage = new Map<string, Task[]>()
    const orphans: Task[] = []
    for (const t of tasks) {
      if (t.stageId) {
        if (!byStage.has(t.stageId)) byStage.set(t.stageId, [])
        byStage.get(t.stageId)!.push(t)
      } else orphans.push(t)
    }

    const todayMs = Date.now()
    const pushStage = (id: string, name: string, children: Task[], idx: number, s?: Stage) => {
      const color = STAGE_COLORS[idx % STAGE_COLORS.length]
      legend.push({ name, color })
      const dated = children.filter((c) => c.plannedStart && c.plannedEnd)
      const minStart = dated.length
        ? new Date(Math.min(...dated.map((c) => parseISO(c.plannedStart!).getTime())))
        : s?.plannedStart
          ? parseISO(s.plannedStart)
          : new Date()
      const maxEnd = dated.length
        ? new Date(Math.max(...dated.map((c) => parseISO(c.plannedEnd!).getTime())))
        : s?.plannedEnd
          ? parseISO(s.plannedEnd)
          : new Date()
      rows.push({
        id: `s:${id}`,
        text: name,
        type: 'summary',
        open: true,
        start: minStart,
        end: new Date(maxEnd.getTime() + DAY),
        $color: color,
      })
      for (const t of children) {
        if (!t.plannedStart || !t.plannedEnd) continue
        const start = parseISO(t.plannedStart)
        const endIncl = parseISO(t.plannedEnd)
        const late =
          !t.isMilestone
            ? t.status !== 'ZAKONCZONE' && t.status !== 'ANULOWANE' && endIncl.getTime() + DAY < todayMs
            : t.status !== 'ZAKONCZONE' && endIncl.getTime() + DAY < todayMs
        rows.push({
          id: t.id,
          parent: `s:${id}`,
          text: t.number ? `${t.number} ${t.name}` : t.name,
          name: t.name,
          number: t.number,
          type: t.isMilestone ? 'milestone' : 'task',
          start,
          end: t.isMilestone ? undefined : new Date(endIncl.getTime() + DAY),
          progress: t.isMilestone ? undefined : t.progress,
          $color: color,
          $late: late,
          $done: t.status === 'ZAKONCZONE',
          $stageName: name,
          $subName: t.subcontractorId ? subName.get(t.subcontractorId) || null : null,
          $isoStart: t.plannedStart,
          $isoEnd: t.plannedEnd,
          $shortName: t.name.length > 34 ? t.name.slice(0, 33) + '…' : t.name,
        })
      }
    }

    const sorted = [...stages].sort((a, b) => a.order - b.order)
    sorted.forEach((s, i) => pushStage(s.id, s.name, byStage.get(s.id) || [], i, s))
    if (orphans.length) pushStage('_orphan', 'Bez etapu', orphans, sorted.length)
    return { data: rows, legend }
  }, [stages, tasks, subName])

  const columns = useMemo(
    () => [{ id: 'text', header: 'Zadanie', flexgrow: 1, width: 300 }],
    [],
  )

  // weekendy + kolumna "dziś" (aktywne przy skali dziennej)
  function highlightTime(d: Date, unit: string) {
    if (unit !== 'day') return ''
    const today = new Date()
    if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate())
      return 'bud-cell-today'
    const dow = d.getDay()
    return dow === 0 || dow === 6 ? 'bud-cell-weekend' : ''
  }

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
      line.innerHTML = '<i></i><span>dziś</span>'
      chart.appendChild(line)
    }
    line.style.left = `${x}px`
    line.style.height = `${Math.max(chart.scrollHeight, chart.clientHeight)}px`
    line.style.display = x >= 0 && x <= sc.width ? 'block' : 'none'
  }

  async function persistTask(id: string, task: any) {
    if (typeof id === 'string' && id.startsWith('s:')) return
    const patch: Record<string, string> = {}
    if (task.start instanceof Date) patch.plannedStart = toISO(task.start)
    if (task.end instanceof Date) patch.plannedEnd = toISO(new Date(task.end.getTime() - DAY))
    else if (task.type === 'milestone' && task.start instanceof Date) patch.plannedEnd = toISO(task.start)
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
    setTooltipApi(api)
    if (typeof window !== 'undefined') (window as any).__ganttApi = api // debug hook
    try {
      api.exec('scroll-chart', { date: new Date(Date.now() - 14 * DAY) })
    } catch {}
    setTimeout(() => {
      updateTodayLine()
      refreshContentHeight()
    }, 0)
    try {
      api.on('zoom-scale', () => setTimeout(updateTodayLine, 0))
    } catch {}
    // zwijanie/rozwijanie etapów zmienia liczbę widocznych wierszy → wysokość proxy
    try {
      api.on('open-task', () => setTimeout(refreshContentHeight, 0))
    } catch {}
    api.intercept('show-editor', () => false)
    api.intercept('update-task', (ev: any) => {
      if (typeof ev.id === 'string' && ev.id.startsWith('s:')) return false
      return true
    })
    api.on('update-task', (ev: any) => {
      setTimeout(updateTodayLine, 0)
      if (ev.inProgress) return
      void persistTask(ev.id, ev.task || {})
    })
  }

  // wheel nad widgetem = pionowe przewijanie (ctrl+wheel zostaje dla zoomu SVAR)
  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return // zoom SVAR
      if (!(e.target as HTMLElement).closest('.bud-size')) return
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return // poziome gesty zostaw wykresowi
      e.preventDefault()
      const api = apiRef.current
      const cur = api?.getState()?.scrollTop || 0
      doScroll(cur + e.deltaY)
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scrollToToday() {
    try {
      apiRef.current?.exec('scroll-chart', { date: new Date(Date.now() - 7 * DAY) })
    } catch {}
  }

  const Theme = dark ? WillowDark : Willow
  const sc = SCALE_PRESETS[preset]

  return (
    <div ref={containerRef} className="budowa-gantt bg-white rounded-xl border border-gray-200 overflow-hidden">
      <style>{BUDOWA_GANTT_CSS}</style>

      {/* pasek narzędzi: skala + Dziś + legenda + status zapisu */}
      <div className="bud-toolbar">
        <div className="bud-toolbar-group">
          {(Object.keys(SCALE_PRESETS) as PresetKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPreset(k)}
              className={`bud-scale-btn${preset === k ? ' bud-scale-btn-on' : ''}`}
            >
              {SCALE_PRESETS[k].label}
            </button>
          ))}
          <button type="button" onClick={scrollToToday} className="bud-today-btn">
            ⌖ Dziś
          </button>
        </div>
        <div className="bud-legend">
          {legend.map((l) => (
            <span key={l.name} className="bud-legend-item" title={l.name}>
              <i style={{ background: l.color }} />
              {l.name.length > 26 ? l.name.slice(0, 25) + '…' : l.name}
            </span>
          ))}
        </div>
        <span className="bud-save">{saveInfo}</span>
      </div>

      <div className="bud-wrap" style={{ height: 'calc(100vh - 300px)', minHeight: 420 }}>
        <div className="bud-size">
          <Theme>
            <Tooltip api={tooltipApi} content={TaskTip as any}>
              <Gantt
                key={preset}
                tasks={data}
                links={[]}
                scales={sc.scales as any}
                columns={columns as any}
                cellWidth={sc.cellWidth}
                cellHeight={30}
                scaleHeight={30}
                taskTemplate={TaskBar as any}
                highlightTime={highlightTime as any}
                zoom
                init={init}
              />
            </Tooltip>
          </Theme>
        </div>
        {/* natywny pasek przewijania (proxy) — karmi scroll-chart */}
        <div
          ref={vscrollRef}
          className="bud-vscroll"
          onScroll={(e) => {
            if (syncingRef.current) return
            doScroll((e.target as HTMLElement).scrollTop)
          }}
        >
          <div style={{ height: contentH || 1 }} />
        </div>
      </div>
      <div className="bud-footer">
        Przeciągnij pasek lub jego krawędź, żeby zmienić termin (zapis automatyczny) • Ctrl+kółko = płynny zoom •
        edycja szczegółów w widoku „Lista"
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- style
const BUDOWA_GANTT_CSS = `
.budowa-gantt {
  --wx-font-size: 12.5px;
  --wx-font-size-sm: 11px;
  --wx-gantt-bar-border-radius: 6px;
}
/* Łańcuch wysokości: divy motywu i tooltipa NIE dziedziczą height —
   bez tego .wx-gantt rośnie do pełnej treści, zewnętrzny overflow-hidden
   go przycina i ZNIKA pionowy scroll (bug z produkcji 2026-07-11). */
.bud-size > *, .bud-size .wx-theme, .bud-size .wx-tooltip-area { height: 100%; }
/* pionowy scroll idzie przez nasz mostek (wheel + proxy) — natywne przewijanie
   wewnętrznych elementów wyłączone, żeby nie rozjeżdżało się ze store */
.bud-size .wx-chart, .bud-size .wx-table-container { overflow-y: hidden !important; }
.bud-wrap { position: relative; display: flex; }
.bud-wrap .bud-size { flex: 1; min-width: 0; height: 100%; }
.bud-vscroll {
  width: 14px; height: 100%; overflow-y: auto; overflow-x: hidden; flex-shrink: 0;
  border-left: 1px solid var(--wx-border, #e5e7eb);
}
.bud-vscroll::-webkit-scrollbar { width: 12px; }
.bud-vscroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, #C9A37A 55%, transparent); border-radius: 6px; }
.bud-vscroll::-webkit-scrollbar-thumb:hover { background: #C9A37A; }
.bud-toolbar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 8px 12px; border-bottom: 1px solid var(--wx-border, #e5e7eb);
  background: var(--surface, #fff);
}
.bud-toolbar-group { display: flex; gap: 4px; }
.bud-scale-btn, .bud-today-btn {
  padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
  border: 1px solid #d1d5db; background: transparent; color: inherit;
  cursor: pointer; transition: all .15s ease;
}
.bud-scale-btn:hover, .bud-today-btn:hover { border-color: #C9A37A; color: #b08a5f; transform: translateY(-1px); }
.bud-scale-btn-on { background: #1F2D3F; border-color: #1F2D3F; color: #F2E8D6; }
.dark .bud-scale-btn-on { background: #C9A37A; border-color: #C9A37A; color: #1F2D3F; }
.bud-today-btn { border-style: dashed; }
.bud-legend { display: flex; gap: 10px; flex-wrap: wrap; margin-left: auto; }
.bud-legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; opacity: .8; }
.bud-legend-item i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.bud-save { font-size: 11px; min-width: 70px; text-align: right; color: #15803d; }
.bud-footer { padding: 6px 12px; font-size: 11px; color: #9ca3af; border-top: 1px solid var(--wx-border, #e5e7eb); }

/* ------ paski zadań (taskTemplate) ------ */
.budowa-gantt .wx-bar { background: transparent !important; box-shadow: none !important; overflow: visible !important; }
.bud-bar {
  position: absolute; inset: 3px 0; border-radius: 6px;
  background: color-mix(in srgb, var(--c) 22%, transparent);
  border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
  overflow: hidden; display: flex; align-items: center;
  transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
  animation: bud-in .35s ease backwards;
}
.bud-bar-fill {
  position: absolute; inset: 0 auto 0 0; border-radius: 5px 0 0 5px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 92%, #fff), var(--c));
  transition: width .3s ease;
}
.bud-bar-text {
  position: relative; z-index: 1; padding: 0 8px; font-size: 11px; font-weight: 600;
  color: var(--wx-color-font, #374151); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-shadow: 0 0 4px var(--surface, #fff);
}
.bud-bar-pct {
  position: relative; z-index: 1; margin-left: auto; padding: 0 6px; font-size: 10px;
  font-weight: 700; color: var(--wx-color-font, #374151); opacity: .75;
}
.bud-bar-warn { position: relative; z-index: 1; padding-right: 6px; font-size: 11px; }
.bud-bar-dates {
  position: absolute; z-index: 2; left: 50%; top: -22px; transform: translateX(-50%) translateY(4px);
  background: #1F2D3F; color: #F2E8D6; font-size: 10px; font-weight: 600;
  padding: 2px 8px; border-radius: 6px; white-space: nowrap;
  opacity: 0; pointer-events: none; transition: opacity .15s ease, transform .15s ease;
}
.bud-bar:hover { transform: translateY(-1px); box-shadow: 0 4px 14px color-mix(in srgb, var(--c) 45%, transparent); filter: saturate(1.15); }
.bud-bar:hover .bud-bar-dates { opacity: 1; transform: translateX(-50%) translateY(0); }
.bud-bar-late { border-color: #dc2626; }
.bud-bar-late .bud-bar-fill { background: linear-gradient(180deg, #ef4444, #dc2626); }
.bud-bar-done { opacity: .55; }
.bud-bar-done .bud-bar-fill { background: linear-gradient(180deg, #86efac, #22c55e); }

/* ------ kamienie milowe ------ */
.budowa-gantt .wx-bar.wx-milestone .wx-content { background: transparent !important; }
.bud-ms { position: absolute; inset: 0; }
.bud-ms::before {
  content: ''; position: absolute; left: 50%; top: 50%; width: 14px; height: 14px;
  transform: translate(-50%, -50%) rotate(45deg);
  background: linear-gradient(135deg, #E8D0B0, #C9A37A);
  border: 2px solid #8B6F47; border-radius: 3px;
  transition: transform .15s ease, box-shadow .15s ease;
}
.bud-ms:hover::before { transform: translate(-50%, -50%) rotate(45deg) scale(1.25); box-shadow: 0 0 12px rgba(201,163,122,.8); }
.bud-ms-label {
  position: absolute; left: calc(50% + 14px); top: 50%; transform: translateY(-50%);
  font-size: 10.5px; font-weight: 600; white-space: nowrap; opacity: .85;
  color: var(--wx-color-font, #374151);
}
.bud-ms-late::before { background: linear-gradient(135deg, #f87171, #dc2626); border-color: #991b1b; animation: bud-pulse 1.6s ease infinite; }
@keyframes bud-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.5); } 50% { box-shadow: 0 0 0 7px rgba(220,38,38,0); } }
@keyframes bud-in { from { opacity: 0; transform: scaleX(.7); transform-origin: left; } }

/* ------ wiersze etapów (summary) ------ */
.bud-summary { position: absolute; inset: 8px 0; border-radius: 4px;
  background: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--c) 38%, transparent) 0 6px, color-mix(in srgb, var(--c) 20%, transparent) 6px 12px);
  border-left: 3px solid var(--c); border-right: 3px solid var(--c);
}

/* ------ hover wiersza + siatka ------ */
.budowa-gantt .wx-row:hover { background: color-mix(in srgb, #C9A37A 7%, transparent); }
.bud-cell-weekend { background: color-mix(in srgb, var(--wx-color-font, #6b7280) 6%, transparent); }
.bud-cell-today { background: color-mix(in srgb, #C9A37A 18%, transparent); }

/* ------ linia "dziś" ------ */
.budowa-gantt .wx-chart { position: relative; }
.budowa-today-line { position: absolute; top: 0; width: 0; z-index: 4; pointer-events: none; border-left: 2px solid #d4a574; }
.budowa-today-line i {
  position: sticky; top: 34px; display: block; width: 8px; height: 8px; margin-left: -5px;
  border-radius: 999px; background: #d4a574; box-shadow: 0 0 0 3px rgba(212,165,116,.3);
  animation: bud-pulse-soft 2s ease infinite;
}
@keyframes bud-pulse-soft { 0%,100% { box-shadow: 0 0 0 3px rgba(212,165,116,.3); } 50% { box-shadow: 0 0 0 7px rgba(212,165,116,.12); } }
.budowa-today-line span {
  position: sticky; top: 44px; display: inline-block; transform: translateX(-50%);
  background: #d4a574; color: #1F2D3F; font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 999px; white-space: nowrap;
}

/* ------ tooltip ------ */
.bud-tip { max-width: 280px; padding: 10px 12px; font-size: 12px; line-height: 1.45; }
.bud-tip-title { font-weight: 700; margin-bottom: 6px; }
.bud-tip-num { display: inline-block; margin-right: 6px; padding: 0 5px; border-radius: 4px;
  background: rgba(201,163,122,.25); font-size: 10.5px; font-weight: 700; }
.bud-tip-row { display: flex; align-items: center; gap: 6px; opacity: .9; margin-top: 2px; }
.bud-tip-row i { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
.bud-tip-meter { width: 90px; height: 6px; border-radius: 999px; background: rgba(128,128,128,.25); overflow: hidden; }
.bud-tip-meter span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #C9A37A, #8B6F47); }
.bud-tip-late { margin-top: 5px; color: #ef4444; font-weight: 600; }

/* motyw: akcent zaznaczenia */
.budowa-gantt .wx-willow-theme, .budowa-gantt .wx-willow-dark-theme { --wx-gantt-select-color: rgba(212,165,116,.16); }
`
