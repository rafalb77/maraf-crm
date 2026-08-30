'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Pencil } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { UNIT_TYPE_LABELS, UNIT_STATUS_LABELS, type UnitType, type UnitStatus } from '@/lib/types'
import { isSessionExpired, SESSION_EXPIRED_HINT } from '@/lib/api-client'

type ShapeMap = Record<string, Record<string, [number, number][]>>

export type FloorMarker = {
  number: string
  kind: string
  x: number
  y: number
  /** Obwiednia obszaru mieszkania (viewport pt): [x1, y1, x2, y2]. */
  box?: [number, number, number, number]
  /** Dokładny kontur (komórki lokatorskie — z wypełnień wektorowych rzutu). */
  poly?: [number, number][]
}

// Kolory SVG wypełnień konturów (odpowiedniki STATUS_FILL).
const SVG_FILL: Record<string, string> = {
  WOLNY: '#16a34a',
  ZAREZERWOWANY: '#eab308',
  SPRZEDANY: '#dc2626',
  NIEDOSTEPNY: '#9ca3af',
}
export type FloorData = { file: string; image: string; width: number; height: number; markers: FloorMarker[] }
export type FloorUnitInfo = {
  id: string
  number: string
  type: string
  status: string
  priceGross: number
  clientName: string | null
}
export type FloorAlert = { severity: 'alert' | 'warning'; floor: number; text: string }

const FLOOR_LABELS: Record<string, string> = {
  '0': 'Parter (garaż)',
  '1': '1 piętro',
  '2': '2 piętro',
  '3': '3 piętro',
  '4': '4 piętro',
  pzt: 'Teren (PZT)',
}

// Klasyczna „tablica dewelopera": zielony wolny, żółty rezerwacja, czerwony sprzedany.
const STATUS_MARKER: Record<string, string> = {
  WOLNY: 'bg-green-600 text-white border-green-700',
  ZAREZERWOWANY: 'bg-yellow-400 text-gray-900 border-yellow-500',
  SPRZEDANY: 'bg-red-600 text-white border-red-700',
  NIEDOSTEPNY: 'bg-gray-400 text-white border-gray-500',
}

// Półprzezroczyste wypełnienie obrysu miejsca postojowego/garażowego.
const STATUS_FILL: Record<string, string> = {
  WOLNY: 'bg-green-500/35 border-green-700 text-green-950',
  ZAREZERWOWANY: 'bg-yellow-400/45 border-yellow-600 text-yellow-950',
  SPRZEDANY: 'bg-red-500/40 border-red-700 text-red-950',
  NIEDOSTEPNY: 'bg-gray-400/40 border-gray-500 text-gray-800',
}

function shortLabel(m: FloorMarker): string {
  if (m.kind === 'GARAZ') return m.number.replace('MG.', 'P')
  if (m.kind === 'PARKING') return m.number.replace('MP.', 'MP')
  const tail = m.number.split('.').pop() || m.number
  return tail
}

export function FloorPlanViewer({
  floors,
  units,
  alerts,
  links = {},
}: {
  floors: Record<string, FloorData>
  units: Record<string, FloorUnitInfo>
  alerts: FloorAlert[]
  /** Numery lokali kupowanych/rezerwowanych razem (pakiet klienta). */
  links?: Record<string, string[]>
}) {
  const router = useRouter()
  const floorKeys = Object.keys(floors).sort()
  const [active, setActive] = useState('1')
  const [hovered, setHovered] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setContainerWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const floor = floors[active]
  const scale = floor && containerWidth > 0 ? containerWidth / floor.width : 1

  // Liczniki statusów per piętro (tylko znaczniki istniejące w bazie).
  const counters = useMemo(() => {
    const out: Record<string, { wolne: number; rez: number; sprzedane: number }> = {}
    for (const [key, f] of Object.entries(floors)) {
      const c = { wolne: 0, rez: 0, sprzedane: 0 }
      for (const m of f.markers) {
        const u = units[m.number]
        if (!u) continue
        if (u.status === 'WOLNY') c.wolne++
        else if (u.status === 'ZAREZERWOWANY') c.rez++
        else if (u.status === 'SPRZEDANY') c.sprzedane++
      }
      out[key] = c
    }
    return out
  }, [floors, units])

  const hoveredMarker = hovered ? floor?.markers.find((m) => m.number === hovered) : null
  const hoveredUnit = hovered ? units[hovered] : null

  // Pakiet klienta: najechany lokal + wszystko kupione/zarezerwowane razem z nim.
  const hoveredGroup = useMemo(() => {
    if (!hovered) return new Set<string>()
    return new Set([hovered, ...(links[hovered] ?? [])])
  }, [hovered, links])
  // Powiązania: na tej planszy (podświetlane) i poza nią (tekst w tooltipie).
  const [linkedHere, linkedElsewhere] = useMemo(() => {
    if (!hovered || !floor) return [[], []] as [string[], string[]]
    const here = new Set(floor.markers.map((m) => m.number))
    const all = links[hovered] ?? []
    return [all.filter((n) => here.has(n)), all.filter((n) => !here.has(n))] as [string[], string[]]
  }, [hovered, floor, links])

  // ===== Edytor ręcznych obrysów mieszkań =====
  const [editMode, setEditMode] = useState(false)
  const [shapes, setShapes] = useState<ShapeMap | null>(null)
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [draft, setDraft] = useState<[number, number][]>([])
  const [dirty, setDirty] = useState(false)
  const [savingShapes, setSavingShapes] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  /**
   * Efektywny kontur lokalu: ręczny obrys (stan edytora) > kontur z serwera.
   * Mieszkania nie mają automatycznego konturu, więc po usunięciu ręcznego
   * wracają do obwiedni; komórki/miejsca wracają do konturu automatycznego.
   */
  const getPoly = (m: FloorMarker): [number, number][] | undefined => {
    const manual = shapes?.[active]?.[m.number]
    if (manual) return manual
    if (m.kind === 'MIESZKALNY' && shapes) return undefined
    return m.poly
  }
  const floorShapes: Record<string, [number, number][]> = shapes?.[active] ?? {}

  async function enterEdit() {
    setEditError(null)
    try {
      const res = await fetch('/api/rzuty/shapes')
      const data = res.ok ? await res.json() : {}
      setShapes(data && typeof data === 'object' ? data : {})
    } catch {
      setShapes({})
    }
    setEditMode(true)
    setEditTarget(null)
    setDraft([])
  }
  function exitEdit() {
    if (dirty && !confirm('Masz niezapisane obrysy. Wyjść bez zapisu?')) return
    setEditMode(false)
    setEditTarget(null)
    setDraft([])
    setEditError(null)
  }
  function startTarget(num: string) {
    setEditTarget(num)
    setDraft([])
  }
  function addPoint(e: React.MouseEvent<HTMLDivElement>) {
    if (!editTarget || scale <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const vx = (e.clientX - rect.left) / scale
    const vy = (e.clientY - rect.top) / scale
    if (draft.length >= 3) {
      const [fx, fy] = draft[0]
      if (Math.hypot(fx - vx, fy - vy) * scale < 12) {
        closeDraft()
        return
      }
    }
    setDraft((d) => [...d, [Math.round(vx * 10) / 10, Math.round(vy * 10) / 10]])
  }
  function closeDraft() {
    if (!editTarget || draft.length < 3 || !floor) return
    const nextShapes: ShapeMap = { ...(shapes ?? {}), [active]: { ...(shapes?.[active] ?? {}), [editTarget]: draft } }
    setShapes(nextShapes)
    setDirty(true)
    setDraft([])
    // Auto-przejście do kolejnego lokalu TEGO SAMEGO typu bez ręcznego obrysu
    // — szybkie obrysowanie całej planszy (mieszkań, garaży, miejsc...).
    const kind = floor.markers.find((m) => m.number === editTarget)?.kind
    const next = floor.markers.find((m) => m.kind === kind && !nextShapes[active]?.[m.number])
    setEditTarget(next ? next.number : null)
  }
  function undoPoint() {
    setDraft((d) => d.slice(0, -1))
  }
  function removeShape() {
    if (!editTarget) return
    setShapes((s) => {
      const f = { ...(s?.[active] ?? {}) }
      delete f[editTarget]
      return { ...(s ?? {}), [active]: f }
    })
    setDirty(true)
    setDraft([])
  }
  async function saveShapes() {
    if (!shapes) return
    setSavingShapes(true)
    setEditError(null)
    try {
      const res = await fetch('/api/rzuty/shapes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shapes),
      })
      if (!res.ok) {
        if (isSessionExpired(res)) {
          setEditError(SESSION_EXPIRED_HINT)
          return
        }
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się zapisać obrysów')
      }
      setDirty(false)
      router.refresh()
    } catch (e: any) {
      setEditError(e.message)
    } finally {
      setSavingShapes(false)
    }
  }

  return (
    <div>
      {/* Alerty osieroconych komórek */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-4">
          {alerts.map((a, i) => (
            <button
              key={i}
              onClick={() => setActive(String(a.floor))}
              className={`w-full text-left flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                a.severity === 'alert'
                  ? 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100'
                  : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="min-w-0">{a.text}</span>
              <span className="ml-auto text-xs opacity-70 flex-shrink-0">pokaż na rzucie →</span>
            </button>
          ))}
        </div>
      )}

      {/* Zakładki pięter z licznikami */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {floorKeys.map((key) => {
          const c = counters[key]
          const isActive = key === active
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                isActive ? 'bg-blue-600 text-white border-transparent' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {FLOOR_LABELS[key] ?? key}
              {c && (
                <span className={`ml-1.5 text-[11px] tabular-nums ${isActive ? 'opacity-80' : 'text-gray-400'}`}>
                  {c.sprzedane}/{c.sprzedane + c.rez + c.wolne}
                </span>
              )}
            </button>
          )
        })}
        {/* Legenda */}
        <div className="ml-auto flex items-center gap-2.5 text-[11px] text-gray-500 flex-wrap">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-600 inline-block" /> wolny</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> zarezerwowany</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> sprzedany</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" /> niedostępny</span>
          {!editMode && floor && floor.markers.length > 0 && (
            <button
              onClick={enterEdit}
              className="ml-2 inline-flex items-center gap-1 px-2 py-1 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium"
            >
              <Pencil className="w-3 h-3" /> Edytuj obrysy
            </button>
          )}
        </div>
      </div>

      {/* Pasek narzędzi edytora obrysów */}
      {editMode && floor && (
        <div className="mb-3 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 flex items-center gap-2 flex-wrap text-sm">
          <span className="font-semibold text-violet-900">Edycja obrysów:</span>
          <select
            value={editTarget ?? ''}
            onChange={(e) => startTarget(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">— wybierz lokal —</option>
            {floor.markers.map((m) => (
              <option key={m.number} value={m.number}>
                {m.number} {floorShapes[m.number] ? '✓' : m.poly ? '(auto)' : '—'}
              </option>
            ))}
          </select>
          {editTarget && (
            <span className="text-violet-800">
              punktów: {draft.length}
              {draft.length >= 3 ? ' · kliknij pierwszy punkt lub „Zamknij", aby zakończyć' : ' · klikaj narożniki lokalu/miejsca'}
            </span>
          )}
          <button onClick={undoPoint} disabled={draft.length === 0} className="px-2 py-1 border border-gray-300 rounded-lg bg-white disabled:opacity-40">
            Cofnij punkt (PPM)
          </button>
          <button onClick={closeDraft} disabled={draft.length < 3} className="px-2 py-1 border border-gray-300 rounded-lg bg-white disabled:opacity-40">
            Zamknij obrys
          </button>
          <button
            onClick={removeShape}
            disabled={!editTarget || !floorShapes[editTarget]}
            className="px-2 py-1 border border-red-300 text-red-700 rounded-lg bg-white disabled:opacity-40"
          >
            Usuń obrys
          </button>
          <span className="ml-auto inline-flex items-center gap-2">
            {editError && <span className="text-red-600 text-xs">{editError}</span>}
            <button
              onClick={saveShapes}
              disabled={!dirty || savingShapes}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white rounded-lg font-medium inline-flex items-center gap-1.5"
            >
              {savingShapes && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Zapisz obrysy
            </button>
            <button onClick={exitEdit} className="px-2 py-1.5 border border-gray-300 rounded-lg bg-white">
              Zakończ
            </button>
          </span>
        </div>
      )}

      {/* Rzut + nakładka znaczników */}
      <div ref={containerRef} className="relative bg-white rounded-xl border border-gray-200 overflow-hidden">
        {floor && containerWidth > 0 && (
          <>
            {/* Pre-renderowany PNG (pipeline extract-floorplan-markers.mjs) —
                natychmiastowe ładowanie zamiast renderowania PDF w przeglądarce. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/rzuty/${floor.image}`}
              alt={FLOOR_LABELS[active] ?? active}
              className="block w-full h-auto select-none"
              draggable={false}
            />
            <div className="absolute inset-0">
              {/* Komórki lokatorskie: dokładne kontury (z wektorów rzutu)
                  wypełnione kolorem statusu — klikalne jak znaczniki. */}
              <svg
                className="absolute inset-0 w-full h-full"
                viewBox={`0 0 ${floor.width} ${floor.height}`}
                style={{ pointerEvents: 'none' }}
              >
                {floor.markers
                  .filter((m) => getPoly(m))
                  .map((m) => {
                    const u = units[m.number]
                    const fill = u ? SVG_FILL[u.status] ?? '#9ca3af' : '#e5e7eb'
                    const active = hoveredGroup.has(m.number)
                    return (
                      <polygon
                        key={`poly-${m.number}`}
                        points={getPoly(m)!.map((p) => p.join(',')).join(' ')}
                        fill={fill}
                        fillOpacity={active ? 0.75 : m.kind === 'MIESZKALNY' ? 0.3 : 0.4}
                        stroke={fill}
                        strokeWidth={active ? 2.5 : 1}
                        style={{ pointerEvents: 'auto', cursor: u ? 'pointer' : 'default' }}
                        onMouseEnter={() => setHovered(m.number)}
                        onMouseLeave={() => setHovered((h) => (h === m.number ? null : h))}
                        onClick={() => u && router.push(`/units/${u.id}`)}
                      />
                    )
                  })}
              </svg>
              {/* Podświetlenie pakietu: obszar mieszkania (obwiednia z etykiet
                  pomieszczeń) + powiązane komórki/miejsca kupione razem. */}
              {hoveredGroup.size > 0 &&
                floor.markers
                  .filter((m) => hoveredGroup.has(m.number) && !getPoly(m))
                  .map((m) => {
                    const isPrimary = m.number === hovered
                    const border = isPrimary ? 'border-blue-600' : 'border-blue-500 border-dashed'
                    if (m.box) {
                      const pad = 12
                      return (
                        <div
                          key={`hl-${m.number}`}
                          className={`absolute rounded-lg border-2 bg-blue-500/15 pointer-events-none z-10 ${border}`}
                          style={{
                            left: m.box[0] * scale - pad,
                            top: m.box[1] * scale - pad,
                            width: (m.box[2] - m.box[0]) * scale + pad * 2,
                            height: (m.box[3] - m.box[1]) * scale + pad * 2,
                          }}
                        />
                      )
                    }
                    return (
                      <div
                        key={`hl-${m.number}`}
                        className={`absolute rounded-full border-2 bg-blue-500/15 pointer-events-none z-10 -translate-x-1/2 -translate-y-1/2 ${border}`}
                        style={{ left: m.x * scale, top: m.y * scale, width: 40, height: 40 }}
                      />
                    )
                  })}
              {floor.markers.map((m) => {
                // Lokale z konturem rysuje warstwa SVG — kółko byłoby dublem.
                if (getPoly(m)) return null
                const u = units[m.number]
                // Miejsca postojowe/garażowe z obrysem: prostokąt wypełniony
                // kolorem statusu dokładnie po obrysie miejsca (2,5×5 m).
                if ((m.kind === 'PARKING' || m.kind === 'GARAZ') && m.box) {
                  const fill = u
                    ? STATUS_FILL[u.status] ?? 'bg-gray-300/40 border-gray-400 text-gray-700'
                    : 'bg-white/10 border-gray-400 border-dashed text-gray-500'
                  return (
                    <button
                      key={m.number}
                      onMouseEnter={() => setHovered(m.number)}
                      onMouseLeave={() => setHovered((h) => (h === m.number ? null : h))}
                      onClick={() => u && router.push(`/units/${u.id}`)}
                      title={u ? undefined : `${m.number} — brak w bazie lokali`}
                      className={`absolute border flex items-center justify-center text-[9px] font-bold leading-none transition-colors hover:z-20 hover:brightness-110 ${fill} ${u ? 'cursor-pointer' : 'cursor-default'}`}
                      style={{
                        left: m.box[0] * scale,
                        top: m.box[1] * scale,
                        width: (m.box[2] - m.box[0]) * scale,
                        height: (m.box[3] - m.box[1]) * scale,
                      }}
                    >
                      {shortLabel(m)}
                    </button>
                  )
                }
                const cls = u
                  ? STATUS_MARKER[u.status] ?? 'bg-gray-300 text-gray-700 border-gray-400'
                  : 'bg-white text-gray-400 border-gray-300 border-dashed'
                return (
                  <button
                    key={m.number}
                    onMouseEnter={() => setHovered(m.number)}
                    onMouseLeave={() => setHovered((h) => (h === m.number ? null : h))}
                    onClick={() => u && router.push(`/units/${u.id}`)}
                    title={u ? undefined : `${m.number} — brak w bazie lokali`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none shadow-sm transition-transform hover:scale-125 hover:z-20 ${cls} ${u ? 'cursor-pointer' : 'cursor-default'}`}
                    style={{ left: m.x * scale, top: m.y * scale }}
                  >
                    {shortLabel(m)}
                  </button>
                )
              })}

              {/* Tooltip najechanego lokalu (nie w trybie edycji). Clamp
                  poziomy z zapasem połowy max szerokości — nie ucina przy
                  krawędziach planszy; przy górnej krawędzi opada pod znacznik. */}
              {!editMode && hoveredMarker && hoveredUnit && (() => {
                const HALF_W = 140
                const belowTop = hoveredMarker.y * scale < 150
                return (
                  <div
                    className="absolute z-30 pointer-events-none bg-gray-900 text-white rounded-lg px-3 py-2 text-xs shadow-xl min-w-[180px] max-w-[280px]"
                    style={{
                      left: Math.min(Math.max(hoveredMarker.x * scale, HALF_W), Math.max(containerWidth - HALF_W, HALF_W)),
                      top: belowTop ? hoveredMarker.y * scale + 18 : hoveredMarker.y * scale - 14,
                      transform: belowTop ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
                    }}
                  >
                    <p className="font-semibold text-sm">{hoveredUnit.number}</p>
                    <p className="opacity-80">
                      {UNIT_TYPE_LABELS[hoveredUnit.type as UnitType] ?? hoveredUnit.type} ·{' '}
                      {UNIT_STATUS_LABELS[hoveredUnit.status as UnitStatus] ?? hoveredUnit.status}
                    </p>
                    {hoveredUnit.clientName && <p className="mt-0.5">👤 {hoveredUnit.clientName}</p>}
                    <p className="mt-0.5 tabular-nums opacity-80">{formatCurrency(hoveredUnit.priceGross)}</p>
                    {linkedHere.length > 0 && (
                      <p className="mt-0.5 text-blue-300">W pakiecie: {linkedHere.join(', ')}</p>
                    )}
                    {linkedElsewhere.length > 0 && (
                      <p className="mt-0.5 text-blue-300 opacity-80">Na innych kondygnacjach: {linkedElsewhere.join(', ')}</p>
                    )}
                    <p className="mt-1 opacity-60">kliknij → karta lokalu</p>
                  </div>
                )
              })()}

              {/* Warstwa edytora: klikanie wierzchołków obrysu mieszkania */}
              {editMode && (
                <div
                  className="absolute inset-0 z-40 cursor-crosshair"
                  onClick={addPoint}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    undoPoint()
                  }}
                >
                  <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${floor.width} ${floor.height}`} style={{ pointerEvents: 'none' }}>
                    {/* Zapisane obrysy mieszkań tej planszy */}
                    {Object.entries(floorShapes).map(([num, pts]) => (
                      <polygon
                        key={`shape-${num}`}
                        points={pts.map((p) => p.join(',')).join(' ')}
                        fill="#8b5cf6"
                        fillOpacity={num === editTarget ? 0.4 : 0.2}
                        stroke="#7c3aed"
                        strokeWidth={num === editTarget ? 2.5 : 1.5}
                      />
                    ))}
                    {/* Rysowany obrys */}
                    {draft.length > 0 && (
                      <>
                        <polyline
                          points={draft.map((p) => p.join(',')).join(' ')}
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth={2}
                        />
                        {draft.map(([x, y], i) => (
                          <circle key={i} cx={x} cy={y} r={i === 0 ? 6 : 3.5} fill={i === 0 ? '#1d4ed8' : '#3b82f6'} stroke="#fff" strokeWidth={1.5} />
                        ))}
                      </>
                    )}
                  </svg>
                  {/* Wybór lokalu kliknięciem w jego etykietę */}
                  {floor.markers
                    .map((m) => (
                      <button
                        key={`et-${m.number}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          startTarget(m.number)
                        }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 rounded px-1 py-0.5 text-[10px] font-bold border shadow-sm ${
                          editTarget === m.number
                            ? 'bg-violet-600 text-white border-violet-700'
                            : floorShapes[m.number]
                              ? 'bg-violet-100 text-violet-700 border-violet-300'
                              : 'bg-white/95 text-gray-700 border-gray-300'
                        }`}
                        style={{ left: m.x * scale, top: m.y * scale }}
                      >
                        {shortLabel(m)}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
