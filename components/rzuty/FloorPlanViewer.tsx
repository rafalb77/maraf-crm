'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { UNIT_TYPE_LABELS, UNIT_STATUS_LABELS, type UnitType, type UnitStatus } from '@/lib/types'

export type FloorMarker = {
  number: string
  kind: string
  x: number
  y: number
  /** Obwiednia obszaru mieszkania (viewport pt): [x1, y1, x2, y2]. */
  box?: [number, number, number, number]
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
  // Powiązania spoza bieżącej planszy — pokazujemy tekstowo w tooltipie.
  const linkedElsewhere = useMemo(() => {
    if (!hovered || !floor) return []
    const here = new Set(floor.markers.map((m) => m.number))
    return (links[hovered] ?? []).filter((n) => !here.has(n))
  }, [hovered, floor, links])

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
        </div>
      </div>

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
              {/* Podświetlenie pakietu: obszar mieszkania (obwiednia z etykiet
                  pomieszczeń) + powiązane komórki/miejsca kupione razem. */}
              {hoveredGroup.size > 0 &&
                floor.markers
                  .filter((m) => hoveredGroup.has(m.number))
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

              {/* Tooltip najechanego lokalu */}
              {hoveredMarker && hoveredUnit && (
                <div
                  className="absolute z-30 pointer-events-none bg-gray-900 text-white rounded-lg px-3 py-2 text-xs shadow-xl min-w-[180px]"
                  style={{
                    left: Math.min(Math.max(hoveredMarker.x * scale, 100), containerWidth - 100),
                    top: Math.max(hoveredMarker.y * scale - 14, 8),
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <p className="font-semibold text-sm">{hoveredUnit.number}</p>
                  <p className="opacity-80">
                    {UNIT_TYPE_LABELS[hoveredUnit.type as UnitType] ?? hoveredUnit.type} ·{' '}
                    {UNIT_STATUS_LABELS[hoveredUnit.status as UnitStatus] ?? hoveredUnit.status}
                  </p>
                  {hoveredUnit.clientName && <p className="mt-0.5">👤 {hoveredUnit.clientName}</p>}
                  <p className="mt-0.5 tabular-nums opacity-80">{formatCurrency(hoveredUnit.priceGross)}</p>
                  {(links[hoveredUnit.number]?.length ?? 0) > 0 && (
                    <p className="mt-0.5 text-blue-300">
                      W pakiecie: {links[hoveredUnit.number].join(', ')}
                      {linkedElsewhere.length > 0 && <span className="opacity-70"> (inna kondygnacja: {linkedElsewhere.join(', ')})</span>}
                    </p>
                  )}
                  <p className="mt-1 opacity-60">kliknij → karta lokalu</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
