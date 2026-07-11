'use client'

/**
 * Gantt harmonogramu budowy — SVAR React Gantt (MIT) + własna warstwa wizualna.
 * Moduł Budowa, Etap 2. Redesign v2 po feedbacku Rafała 2026-07-11 + research
 * wzorców Linear/Monday/Asana (docs/budowa-rozpoczecie.md, sekcja Gantt).
 *
 * Warstwa "premium" (wszystko nasze, zero PRO):
 *  - sprężynowe easingi (CSS linear()), kaskadowe wejście pasków (stagger per wiersz)
 *  - paski w kolorach etapu; postęp = "płonący" gradient z przesuwającym się blaskiem
 *    i żarzącą kropką (ember) na granicy postępu
 *  - hover HUD: uniesienie + złota obwódka + chip z datami + uchwyty resize
 *  - kamienie: złote romby, rozbłysk pierścienia na hover; spóźnione pulsują na czerwono
 *  - celownik: kolumna dnia pod kursorem + pigułka z datą na osi (interaktywna linijka)
 *  - MINIMAPA: pasek całej inwestycji pod wykresem, przeciągalne okienko widoku
 *  - linia "dziś" z gradientem i pulsującą latarnią; przycisk Dziś = płynny scroll + flash
 *  - crossfade przy zmianie skali; wszystko za prefers-reduced-motion
 *
 * Techniczne: pełny all.css (okrojony style.css psuł scroll); łańcuch height:100%
 * przez divy motywu/tooltipa (bez tego znika pionowy scroll); markery SVAR = PRO,
 * linia "dziś" własna. Daty: SVAR end EKSKLUZYWNY vs plannedEnd INKLUZYWNY (+1/-1).
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
  const style = { ['--c' as any]: data.$color, ['--i' as any]: data.$idx ?? 0 }
  if (data.type === 'milestone') {
    return (
      <div className={`bud-ms${data.$late ? ' bud-ms-late' : ''}`} style={style} title={data.text}>
        <span className="bud-ms-label">{data.text}</span>
      </div>
    )
  }
  if (data.type === 'summary') {
    return <div className="bud-summary" style={style} />
  }
  const pct = Math.max(0, Math.min(100, Math.round(data.progress ?? 0)))
  return (
    <div
      className={`bud-bar${data.$late ? ' bud-bar-late' : ''}${data.$done ? ' bud-bar-done' : ''}${pct > 0 && pct < 100 ? ' bud-bar-active' : ''}`}
      style={style}
    >
      <div className="bud-bar-clip">
        <div className="bud-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {pct > 0 && pct < 100 && <span className="bud-ember" style={{ left: `${pct}%` }} />}
      <span className="bud-bar-text">{data.$shortName}</span>
      <span className="bud-bar-pct">{pct > 0 ? `${pct}%` : ''}</span>
      {data.$late && <span className="bud-bar-warn">⚠</span>}
      <span className="bud-grip bud-grip-l" />
      <span className="bud-grip bud-grip-r" />
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
  const minimapRef = useRef<HTMLDivElement>(null)
  const minimapWinRef = useRef<HTMLDivElement>(null)
  const [saveInfo, setSaveInfo] = useState<string | null>(null)
  const [tooltipApi, setTooltipApi] = useState<any>(null)
  // zakres czasu wykresu (z _scales SVAR) — pozycjonuje minimapę zgodnie z osią wykresu
  const [mapRange, setMapRange] = useState<{ t0: number; t1: number } | null>(null)

  useEffect(() => {
    const root = document.documentElement
    setDark(root.classList.contains('dark'))
    const obs = new MutationObserver(() => setDark(root.classList.contains('dark')))
    obs.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const onResize = () => {
      updateTodayLine()
      syncMinimap()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const subName = useMemo(() => new Map(subcontractors.map((s) => [s.id, s.name])), [subcontractors])

  const { data, legend, laneOf } = useMemo(() => {
    const rows: any[] = []
    const legend: { name: string; color: string }[] = []
    const laneOf = new Map<string, number>() // stageRowId -> lane minimapy
    const byStage = new Map<string, Task[]>()
    const orphans: Task[] = []
    for (const t of tasks) {
      if (t.stageId) {
        if (!byStage.has(t.stageId)) byStage.set(t.stageId, [])
        byStage.get(t.stageId)!.push(t)
      } else orphans.push(t)
    }

    let idx = 0
    const todayMs = Date.now()
    const pushStage = (id: string, name: string, children: Task[], lane: number, s?: Stage) => {
      const color = STAGE_COLORS[lane % STAGE_COLORS.length]
      legend.push({ name, color })
      laneOf.set(`s:${id}`, lane)
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
        $idx: idx++,
      })
      for (const t of children) {
        if (!t.plannedStart || !t.plannedEnd) continue
        const start = parseISO(t.plannedStart)
        const endIncl = parseISO(t.plannedEnd)
        const late = t.status !== 'ZAKONCZONE' && t.status !== 'ANULOWANE' && endIncl.getTime() + DAY < todayMs
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
          $lane: lane,
          $late: late,
          $done: t.status === 'ZAKONCZONE',
          $stageName: name,
          $subName: t.subcontractorId ? subName.get(t.subcontractorId) || null : null,
          $isoStart: t.plannedStart,
          $isoEnd: t.plannedEnd,
          $shortName: t.name.length > 34 ? t.name.slice(0, 33) + '…' : t.name,
          $idx: idx++,
        })
      }
    }

    const sorted = [...stages].sort((a, b) => a.order - b.order)
    sorted.forEach((s, i) => pushStage(s.id, s.name, byStage.get(s.id) || [], i, s))
    if (orphans.length) pushStage('_orphan', 'Bez etapu', orphans, sorted.length)
    return { data: rows, legend, laneOf }
  }, [stages, tasks, subName])

  const columns = useMemo(
    () => [{ id: 'text', header: 'Zadanie', flexgrow: 1, width: 280 }],
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

  // ------------------------------------------------------------ warstwy nad wykresem
  function chartEl(): HTMLElement | null {
    return (containerRef.current?.querySelector('.wx-chart') as HTMLElement) || null
  }
  function scaleRange(): { t0: number; t1: number; width: number } | null {
    const sc = apiRef.current?.getState()?._scales
    if (!sc || !(sc.start instanceof Date) || !(sc.end instanceof Date)) return null
    return { t0: sc.start.getTime(), t1: sc.end.getTime(), width: sc.width }
  }

  function updateTodayLine(flash = false) {
    const chart = chartEl()
    const r = scaleRange()
    if (!chart || !r) return
    const x = Math.round(((Date.now() - r.t0) / (r.t1 - r.t0)) * r.width)
    let line = chart.querySelector('.budowa-today-line') as HTMLElement | null
    if (!line) {
      line = document.createElement('div')
      line.className = 'budowa-today-line'
      line.innerHTML = '<i></i><span>dziś</span>'
      chart.appendChild(line)
    }
    line.style.left = `${x}px`
    line.style.height = `${Math.max(chart.scrollHeight, chart.clientHeight)}px`
    line.style.display = x >= 0 && x <= r.width ? 'block' : 'none'
    if (flash) {
      line.classList.remove('bud-flash')
      void line.offsetWidth // restart animacji
      line.classList.add('bud-flash')
    }
  }

  // celownik: kolumna dnia pod kursorem + pigułka z datą
  function setupCrosshair() {
    const chart = chartEl()
    if (!chart) return
    let cross = chart.querySelector('.bud-crosshair') as HTMLElement | null
    if (!cross) {
      cross = document.createElement('div')
      cross.className = 'bud-crosshair'
      cross.innerHTML = '<span></span>'
      chart.appendChild(cross)
    }
    const chip = cross.querySelector('span') as HTMLElement
    let raf = 0
    const onMove = (e: PointerEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const r = scaleRange()
        if (!r || !cross) return
        const rect = chart.getBoundingClientRect()
        const x = e.clientX - rect.left + chart.scrollLeft
        const t = r.t0 + (x / r.width) * (r.t1 - r.t0)
        const d = new Date(t)
        // przyciągnij do początku dnia
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
        const px = Math.round(((dayStart - r.t0) / (r.t1 - r.t0)) * r.width)
        const pxW = Math.max(2, Math.round((DAY / (r.t1 - r.t0)) * r.width))
        cross.style.transform = `translateX(${px}px)`
        cross.style.width = `${pxW}px`
        cross.style.height = `${Math.max(chart.scrollHeight, chart.clientHeight)}px`
        cross.style.opacity = '1'
        chip.textContent = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit' }).format(d)
      })
    }
    const onLeave = () => {
      if (cross) cross.style.opacity = '0'
    }
    chart.addEventListener('pointermove', onMove, { passive: true })
    chart.addEventListener('pointerleave', onLeave, { passive: true })
  }

  // minimapa: okienko widoku synchronizowane ze scrollem wykresu
  function syncMinimap() {
    const chart = chartEl()
    const r = scaleRange()
    const win = minimapWinRef.current
    if (!chart || !r || !win) return
    // elementy SVAR raportują zerowe boxy (treść absolutna) — widoczną szerokość
    // wykresu liczymy z NASZEGO kontenera minus szerokość gridu (state.gridWidth)
    const gridW = apiRef.current?.getState()?.gridWidth ?? 0
    const visibleW = Math.max(0, (containerRef.current?.clientWidth ?? 0) - gridW)
    const frac = chart.scrollLeft / r.width
    const fracW = visibleW > 0 ? Math.min(1, visibleW / r.width) : 0.1
    win.style.left = `${(frac * 100).toFixed(2)}%`
    win.style.width = `${(fracW * 100).toFixed(2)}%`
  }
  function minimapNavigate(clientX: number, smooth: boolean) {
    const chart = chartEl()
    const r = scaleRange()
    const map = minimapRef.current
    if (!chart || !r || !map) return
    const rect = map.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const gridW = apiRef.current?.getState()?.gridWidth ?? 0
    const visibleW = Math.max(200, (containerRef.current?.clientWidth ?? 0) - gridW)
    const left = frac * r.width - visibleW / 2
    chart.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' })
  }
  function onMinimapPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    minimapNavigate(e.clientX, true)
    const onMove = (ev: PointerEvent) => minimapNavigate(ev.clientX, false)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
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
      setupCrosshair()
      const r = scaleRange()
      if (r) setMapRange({ t0: r.t0, t1: r.t1 })
      const chart = chartEl()
      if (chart) {
        let raf = 0
        chart.addEventListener(
          'scroll',
          () => {
            if (raf) return
            raf = requestAnimationFrame(() => {
              raf = 0
              syncMinimap()
            })
          },
          { passive: true },
        )
      }
      syncMinimap()
    }, 0)
    try {
      api.on('zoom-scale', () =>
        setTimeout(() => {
          updateTodayLine()
          const r = scaleRange()
          if (r) setMapRange({ t0: r.t0, t1: r.t1 })
          syncMinimap()
        }, 0),
      )
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

  function scrollToToday() {
    try {
      apiRef.current?.exec('scroll-chart', { date: new Date(Date.now() - 7 * DAY) })
    } catch {}
    setTimeout(() => updateTodayLine(true), 350)
  }

  const Theme = dark ? WillowDark : Willow
  const sc = SCALE_PRESETS[preset]

  // dane minimapy: zadania jako kreski w pasie etapu, kamienie jako romby
  const miniItems = useMemo(() => {
    if (!mapRange) return []
    const span = mapRange.t1 - mapRange.t0
    const items: { key: string; left: number; width: number; lane: number; color: string; ms: boolean; late: boolean }[] = []
    for (const row of data) {
      if (String(row.id).startsWith('s:')) continue
      const start = row.start instanceof Date ? row.start.getTime() : null
      if (!start) continue
      const end = row.end instanceof Date ? row.end.getTime() : start + DAY
      items.push({
        key: String(row.id),
        left: ((start - mapRange.t0) / span) * 100,
        width: Math.max(0.4, ((end - start) / span) * 100),
        lane: row.$lane ?? 0,
        color: row.$color,
        ms: row.type === 'milestone',
        late: !!row.$late,
      })
    }
    return items
  }, [data, mapRange])
  const miniToday = mapRange
    ? Math.max(0, Math.min(100, ((Date.now() - mapRange.t0) / (mapRange.t1 - mapRange.t0)) * 100))
    : null
  const laneCount = Math.max(1, legend.length)

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

      <div key={preset} className="bud-size bud-zoom-in" style={{ height: 'calc(100vh - 348px)', minHeight: 380 }}>
        <Theme>
          <Tooltip api={tooltipApi} content={TaskTip as any}>
            <Gantt
              tasks={data}
              links={[]}
              scales={sc.scales as any}
              columns={columns as any}
              cellWidth={sc.cellWidth}
              cellHeight={28}
              scaleHeight={28}
              taskTemplate={TaskBar as any}
              highlightTime={highlightTime as any}
              zoom
              init={init}
            />
          </Tooltip>
        </Theme>
      </div>

      {/* MINIMAPA: cała inwestycja z lotu ptaka + przeciągalne okienko widoku */}
      <div
        ref={minimapRef}
        className="bud-minimap"
        style={{ height: `${10 + laneCount * 7}px` }}
        onPointerDown={onMinimapPointerDown}
        title="Minimapa — kliknij albo przeciągnij, żeby nawigować"
      >
        {miniItems.map((m) =>
          m.ms ? (
            <span
              key={m.key}
              className={`bud-mini-ms${m.late ? ' bud-mini-late' : ''}`}
              style={{ left: `${m.left}%`, top: `${5 + m.lane * 7}px` }}
            />
          ) : (
            <span
              key={m.key}
              className={`bud-mini-bar${m.late ? ' bud-mini-late' : ''}`}
              style={{ left: `${m.left}%`, width: `${m.width}%`, top: `${5 + m.lane * 7}px`, background: m.color }}
            />
          ),
        )}
        {miniToday !== null && <span className="bud-mini-today" style={{ left: `${miniToday}%` }} />}
        <div ref={minimapWinRef} className="bud-mini-win" />
      </div>

      <div className="bud-footer">
        Przeciągnij pasek lub jego krawędź, żeby zmienić termin (zapis automatyczny) • Ctrl+kółko = płynny zoom •
        minimapa na dole nawiguje po całej inwestycji • edycja szczegółów w widoku „Lista"
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- style
const BUDOWA_GANTT_CSS = `
.budowa-gantt {
  --wx-gantt-bar-border-radius: 6px;
  --spring: linear(0, 0.36 5.5%, 1.03 21%, 1.005 41%, 1);
}
/* motyw SVAR definiuje własny --wx-font-size na .wx-theme — nadpisujemy NA motywie */
.budowa-gantt .wx-theme {
  --wx-font-size: 11.5px;
  --wx-font-size-sm: 10.5px;
  font-size: 11.5px;
}
/* Łańcuch wysokości: divy motywu i tooltipa NIE dziedziczą height —
   bez tego .wx-gantt rośnie do pełnej treści i ZNIKA pionowy scroll. */
.bud-size > *, .bud-size .wx-theme, .bud-size .wx-tooltip-area { height: 100%; }

.bud-toolbar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 7px 12px; border-bottom: 1px solid var(--wx-border, #e5e7eb);
  background: var(--surface, #fff);
}
.bud-toolbar-group { display: flex; gap: 4px; }
.bud-scale-btn, .bud-today-btn {
  padding: 3px 11px; border-radius: 8px; font-size: 11.5px; font-weight: 600;
  border: 1px solid #d1d5db; background: transparent; color: inherit;
  cursor: pointer; transition: transform .3s var(--spring), border-color .15s, color .15s;
}
.bud-scale-btn:hover, .bud-today-btn:hover { border-color: #C9A37A; color: #b08a5f; transform: translateY(-1px); }
.bud-scale-btn-on { background: #1F2D3F; border-color: #1F2D3F; color: #F2E8D6; }
.dark .bud-scale-btn-on { background: #C9A37A; border-color: #C9A37A; color: #1F2D3F; }
.bud-today-btn { border-style: dashed; }
.bud-legend { display: flex; gap: 10px; flex-wrap: wrap; margin-left: auto; }
.bud-legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; opacity: .8; }
.bud-legend-item i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
.bud-save { font-size: 11px; min-width: 70px; text-align: right; color: #15803d; }
.bud-footer { padding: 5px 12px; font-size: 10.5px; color: #9ca3af; border-top: 1px solid var(--wx-border, #e5e7eb); }

/* crossfade przy zmianie skali */
@keyframes bud-zoom { from { opacity: 0; transform: scale(.985); } }
.bud-zoom-in { animation: bud-zoom .2s ease; }

/* ------ paski zadań (taskTemplate) ------ */
.budowa-gantt .wx-bar { background: transparent !important; box-shadow: none !important; overflow: visible !important; }
.bud-bar {
  position: absolute; inset: 3px 0; border-radius: 6px;
  background: color-mix(in srgb, var(--c) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
  display: flex; align-items: center;
  transition: transform .35s var(--spring), box-shadow .25s ease, filter .2s ease;
}
.bud-bar-clip { position: absolute; inset: 0; border-radius: 5px; overflow: hidden; }
.bud-bar-fill {
  position: absolute; inset: 0 auto 0 0;
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 88%, #fff), var(--c));
  transition: width .6s cubic-bezier(.22, 1, .36, 1);
}
/* przesuwający się blask na pasku postępu (tylko zadania w toku, zdesynchronizowane) */
.bud-bar-active .bud-bar-fill::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,.35) 50%, transparent 60%);
  background-size: 250% 100%;
  animation: bud-shimmer 3.2s ease-in-out infinite;
  animation-delay: calc(var(--i, 0) * -400ms);
}
@keyframes bud-shimmer { from { background-position: 210% 0; } to { background-position: -60% 0; } }
/* żarząca się kropka na granicy postępu */
.bud-ember {
  position: absolute; top: 50%; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px;
  border-radius: 999px; background: color-mix(in srgb, var(--c) 60%, #fff);
  box-shadow: 0 0 6px 1px var(--c); z-index: 1;
  animation: bud-ember-pulse 2.2s ease-in-out infinite;
  animation-delay: calc(var(--i, 0) * -300ms);
}
@keyframes bud-ember-pulse {
  0%, 100% { box-shadow: 0 0 5px 1px var(--c); opacity: .85; }
  50% { box-shadow: 0 0 11px 3px var(--c); opacity: 1; }
}
.bud-bar-text {
  position: relative; z-index: 1; padding: 0 8px; font-size: 10.5px; font-weight: 600;
  color: var(--wx-color-font, #374151); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-shadow: 0 0 4px var(--surface, #fff);
}
.bud-bar-pct {
  position: relative; z-index: 1; margin-left: auto; padding: 0 6px; font-size: 9.5px;
  font-weight: 700; color: var(--wx-color-font, #374151); opacity: .75;
}
.bud-bar-warn { position: relative; z-index: 1; padding-right: 5px; font-size: 10.5px; }
/* uchwyty resize — widoczne dopiero na hover (afordancja) */
.bud-grip {
  position: absolute; top: 50%; width: 3px; height: 12px; margin-top: -6px;
  border-radius: 2px; background: color-mix(in srgb, var(--c) 80%, #000);
  opacity: 0; transition: opacity .2s ease;
}
.bud-grip-l { left: 3px; } .bud-grip-r { right: 3px; }
.bud-bar:hover .bud-grip { opacity: .7; }
/* chip z datami nad paskiem */
.bud-bar-dates {
  position: absolute; z-index: 3; left: 50%; top: -23px; transform: translateX(-50%) translateY(4px);
  background: #1F2D3F; color: #F2E8D6; font-size: 10px; font-weight: 600;
  padding: 2px 8px; border-radius: 6px; white-space: nowrap;
  opacity: 0; pointer-events: none; transition: opacity .18s ease, transform .3s var(--spring);
}
.bud-bar:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--c) 40%, transparent), 0 0 0 1.5px color-mix(in srgb, var(--c) 80%, #fff);
  filter: saturate(1.15);
}
.bud-bar:hover .bud-bar-dates { opacity: 1; transform: translateX(-50%) translateY(0); }
.bud-bar-late { border-color: #dc2626; }
.bud-bar-late .bud-bar-fill { background: linear-gradient(180deg, #ef4444, #dc2626); }
.bud-bar-late .bud-ember { background: #fecaca; box-shadow: 0 0 8px 2px #dc2626; }
.bud-bar-done { opacity: .55; }
.bud-bar-done .bud-bar-fill { background: linear-gradient(180deg, #86efac, #22c55e); }

/* kaskadowe wejście pasków (stagger per wiersz, cap 550ms) */
@keyframes bud-in { from { opacity: 0; transform: scaleX(.6); } }
.bud-bar, .bud-summary { transform-origin: left center; animation: bud-in .45s var(--spring) backwards; animation-delay: min(calc(var(--i, 0) * 28ms), 550ms); }

/* ------ kamienie milowe ------ */
.budowa-gantt .wx-bar.wx-milestone .wx-content { background: transparent !important; }
.bud-ms { position: absolute; inset: 0; }
.bud-ms::before {
  content: ''; position: absolute; left: 50%; top: 50%; width: 13px; height: 13px;
  transform: translate(-50%, -50%) rotate(45deg);
  background: linear-gradient(135deg, #E8D0B0, #C9A37A);
  border: 2px solid #8B6F47; border-radius: 3px;
  transition: transform .35s var(--spring), box-shadow .2s ease;
  animation: bud-ms-in .5s var(--spring) backwards;
  animation-delay: min(calc(var(--i, 0) * 28ms), 550ms);
}
@keyframes bud-ms-in { from { transform: translate(-50%, -50%) rotate(45deg) scale(0); } 70% { transform: translate(-50%, -50%) rotate(45deg) scale(1.2); } }
/* rozbłysk pierścienia na hover */
.bud-ms::after {
  content: ''; position: absolute; left: 50%; top: 50%; width: 13px; height: 13px;
  margin: -6.5px 0 0 -6.5px; border-radius: 3px; transform: rotate(45deg);
  border: 2px solid #C9A37A; opacity: 0; pointer-events: none;
}
.bud-ms:hover::before { transform: translate(-50%, -50%) rotate(45deg) scale(1.3); box-shadow: 0 0 14px rgba(201,163,122,.9); }
.bud-ms:hover::after { animation: bud-ripple .7s ease-out; }
@keyframes bud-ripple { from { opacity: .9; transform: rotate(45deg) scale(1); } to { opacity: 0; transform: rotate(45deg) scale(2.6); } }
.bud-ms-label {
  position: absolute; left: calc(50% + 13px); top: 50%; transform: translateY(-50%);
  font-size: 10px; font-weight: 600; white-space: nowrap; opacity: .85;
  color: var(--wx-color-font, #374151);
}
.bud-ms-late::before {
  background: linear-gradient(135deg, #f87171, #dc2626); border-color: #991b1b;
  animation: bud-ms-in .5s var(--spring) backwards, bud-pulse 1.6s .6s ease infinite;
  animation-delay: min(calc(var(--i, 0) * 28ms), 550ms), .6s;
}
@keyframes bud-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.5); } 50% { box-shadow: 0 0 0 7px rgba(220,38,38,0); } }

/* ------ wiersze etapów (summary) ------ */
.bud-summary { position: absolute; inset: 8px 0; border-radius: 4px;
  background: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--c) 38%, transparent) 0 6px, color-mix(in srgb, var(--c) 18%, transparent) 6px 12px);
  border-left: 3px solid var(--c); border-right: 3px solid var(--c);
}

/* ------ hover wiersza + siatka ------ */
.budowa-gantt .wx-row:hover { background: color-mix(in srgb, #C9A37A 7%, transparent); }
.bud-cell-weekend { background: repeating-linear-gradient(45deg, transparent 0 5px, color-mix(in srgb, var(--wx-color-font, #6b7280) 7%, transparent) 5px 6px); }
.bud-cell-today { background: color-mix(in srgb, #C9A37A 16%, transparent); }

/* ------ linia "dziś" ------ */
.budowa-gantt .wx-chart { position: relative; }
.budowa-today-line {
  position: absolute; top: 0; width: 0; z-index: 4; pointer-events: none;
  border-left: 2px solid transparent;
  border-image: linear-gradient(180deg, transparent, #d4a574 6%, #d4a574 94%, transparent) 1;
}
.budowa-today-line i {
  position: sticky; top: 32px; display: block; width: 8px; height: 8px; margin-left: -5px;
  border-radius: 999px; background: #d4a574;
  animation: bud-pulse-soft 2s ease-in-out infinite;
}
@keyframes bud-pulse-soft { 0%,100% { box-shadow: 0 0 0 3px rgba(212,165,116,.3); } 50% { box-shadow: 0 0 0 8px rgba(212,165,116,.1); } }
.budowa-today-line span {
  position: sticky; top: 42px; display: inline-block; transform: translateX(-50%);
  background: #d4a574; color: #1F2D3F; font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 999px; white-space: nowrap;
}
.budowa-today-line.bud-flash i { animation: bud-flash-anim 1.1s ease; }
@keyframes bud-flash-anim { 0%, 40% { box-shadow: 0 0 0 12px rgba(212,165,116,.45); } 100% { box-shadow: 0 0 0 3px rgba(212,165,116,.3); } }

/* ------ celownik (kolumna dnia pod kursorem) ------ */
.bud-crosshair {
  position: absolute; top: 0; z-index: 3; pointer-events: none; opacity: 0;
  background: color-mix(in srgb, #C9A37A 9%, transparent);
  border-inline: 1px solid color-mix(in srgb, #C9A37A 30%, transparent);
  transition: opacity .15s ease;
}
.bud-crosshair span {
  position: sticky; top: 4px; display: inline-block; transform: translateX(-50%); margin-left: 50%;
  background: color-mix(in srgb, #1F2D3F 92%, #C9A37A); color: #F2E8D6;
  font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 999px; white-space: nowrap;
}

/* ------ minimapa ------ */
.bud-minimap {
  position: relative; margin: 0; cursor: pointer; touch-action: none;
  background: color-mix(in srgb, #1F2D3F 5%, transparent);
  border-top: 1px solid var(--wx-border, #e5e7eb);
  overflow: hidden; user-select: none;
}
.dark .bud-minimap { background: rgba(0,0,0,.25); }
.bud-mini-bar { position: absolute; height: 4px; border-radius: 2px; opacity: .85; }
.bud-mini-ms {
  position: absolute; width: 5px; height: 5px; margin-left: -2.5px; margin-top: -1px;
  transform: rotate(45deg); background: #C9A37A; border-radius: 1px;
}
.bud-mini-late { box-shadow: 0 0 4px 1px rgba(220,38,38,.8); }
.bud-mini-ms.bud-mini-late { background: #dc2626; }
.bud-mini-today { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #d4a574; }
.bud-mini-win {
  position: absolute; top: 0; bottom: 0;
  background: color-mix(in srgb, #C9A37A 14%, transparent);
  border: 1px solid color-mix(in srgb, #C9A37A 65%, transparent);
  border-radius: 4px; box-shadow: 0 0 8px rgba(201,163,122,.25);
  transition: left .08s linear, width .15s ease;
}

/* ------ tooltip ------ */
.bud-tip { max-width: 280px; padding: 10px 12px; font-size: 12px; line-height: 1.45; }
.bud-tip-title { font-weight: 700; margin-bottom: 6px; }
.bud-tip-num { display: inline-block; margin-right: 6px; padding: 0 5px; border-radius: 4px;
  background: rgba(201,163,122,.25); font-size: 10px; font-weight: 700; }
.bud-tip-row { display: flex; align-items: center; gap: 6px; opacity: .9; margin-top: 2px; }
.bud-tip-row i { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
.bud-tip-meter { width: 90px; height: 6px; border-radius: 999px; background: rgba(128,128,128,.25); overflow: hidden; }
.bud-tip-meter span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #C9A37A, #8B6F47); }
.bud-tip-late { margin-top: 5px; color: #ef4444; font-weight: 600; }

/* motyw: akcent zaznaczenia */
.budowa-gantt .wx-willow-theme, .budowa-gantt .wx-willow-dark-theme { --wx-gantt-select-color: rgba(212,165,116,.16); }

/* dostępność: bez animacji przy prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  .budowa-gantt *, .budowa-gantt *::before, .budowa-gantt *::after { animation: none !important; transition: none !important; }
}
`
