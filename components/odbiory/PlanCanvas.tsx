'use client'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { DEFECT_STATUS_RING, type DefectStatus } from '@/lib/odbiory/constants'
import type { SnapshotSheet, SnapshotDefect } from '@/lib/odbiory/types'

/**
 * Rzut z pinezkami: zoom dwoma palcami / kółkiem, przesuwanie, dotknięcie = nowa
 * pinezka (współrzędne w układzie arkusza). Pinezki mają stały rozmiar na ekranie
 * (kontr-skalowanie) i obwódkę w kolorze statusu.
 */
export type PlanCanvasHandle = {
  centerOn: (defectId: string, scale?: number) => void
  reset: () => void
  fitBox: (box: [number, number, number, number]) => void
}

type Props = {
  sheet: SnapshotSheet
  defects: SnapshotDefect[]
  selectedId: string | null
  dimmedIds?: Set<string> | null
  onTap: (x: number, y: number) => void
  onPinTap: (id: string) => void
  seriesActive?: boolean
}

const TAP_MOVE_PX = 8
const TAP_MAX_MS = 600

export const PlanCanvas = forwardRef<PlanCanvasHandle, Props>(function PlanCanvas(
  { sheet, defects, selectedId, dimmedIds, onTap, onPinTap, seriesActive },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null)
  const [containerW, setContainerW] = useState(0)
  const [containerH, setContainerH] = useState(0)
  const [scale, setScale] = useState(1)
  const downRef = useRef<{ x: number; y: number; t: number; id: number } | null>(null)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const update = () => {
      setContainerW(el.clientWidth)
      setContainerH(el.clientHeight)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Szerokość treści = rzut dopasowany do kontenera (mieści się w całości na starcie).
  const fitScale = containerW > 0 && containerH > 0 ? Math.min(containerW / sheet.width, containerH / sheet.height) : 1
  const contentW = Math.max(1, Math.round(sheet.width * fitScale))
  const contentH = Math.max(1, Math.round(sheet.height * fitScale))

  useImperativeHandle(
    ref,
    () => ({
      centerOn: (defectId, targetScale) => {
        const inst = transformRef.current
        const d = defects.find((x) => x.id === defectId)
        if (!inst || !d) return
        const s = targetScale ?? Math.max(inst.state.scale, 2.5)
        const px = (d.x / sheet.width) * contentW
        const py = (d.y / sheet.height) * contentH
        inst.setTransform(containerW / 2 - px * s, containerH / 2 - py * s, s, 250)
      },
      reset: () => transformRef.current?.resetTransform(200),
      fitBox: (box) => {
        const inst = transformRef.current
        if (!inst) return
        const [x1, y1, x2, y2] = box
        const bw = Math.max(1, ((x2 - x1) / sheet.width) * contentW)
        const bh = Math.max(1, ((y2 - y1) / sheet.height) * contentH)
        const s = Math.min(6, Math.max(1, Math.min(containerW / (bw * 1.15), containerH / (bh * 1.15))))
        const cx = ((x1 + x2) / 2 / sheet.width) * contentW
        const cy = ((y1 + y2) / 2 / sheet.height) * contentH
        inst.setTransform(containerW / 2 - cx * s, containerH / 2 - cy * s, s, 250)
      },
    }),
    [defects, sheet.width, sheet.height, contentW, contentH, containerW, containerH],
  )

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId }
  }, [])

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const down = downRef.current
      downRef.current = null
      if (!down || down.id !== e.pointerId) return
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_MOVE_PX) return
      if (Date.now() - down.t > TAP_MAX_MS) return
      const target = e.target as HTMLElement
      if (target.closest('[data-pin]')) return
      const el = contentRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const x = ((e.clientX - rect.left) / rect.width) * sheet.width
      const y = ((e.clientY - rect.top) / rect.height) * sheet.height
      if (x < 0 || y < 0 || x > sheet.width || y > sheet.height) return
      onTap(Math.round(x * 10) / 10, Math.round(y * 10) / 10)
    },
    [onTap, sheet.width, sheet.height],
  )

  const pinSize = 34
  return (
    <div ref={wrapperRef} className={`relative h-full w-full overflow-hidden bg-gray-200 ${seriesActive ? 'ring-4 ring-inset ring-red-400' : ''}`} style={{ touchAction: 'none' }}>
      {containerW > 0 && (
        <TransformWrapper
          ref={transformRef}
          minScale={0.5}
          maxScale={10}
          initialScale={1}
          centerOnInit
          limitToBounds={false}
          wheel={{ step: 0.12 }}
          pinch={{ step: 6 }}
          doubleClick={{ disabled: true }}
          panning={{ velocityDisabled: true }}
          onTransformed={(_ref, state) => setScale(state.scale)}
        >
          <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: contentW, height: contentH }}>
            <div
              ref={contentRef}
              className="relative select-none"
              style={{ width: contentW, height: contentH }}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sheet.imageUrl} alt={sheet.name} draggable={false} className="block h-full w-full" style={{ width: contentW, height: contentH }} />
              {defects.map((d) => {
                const ring = DEFECT_STATUS_RING[d.status as DefectStatus] || '#dc2626'
                const selected = d.id === selectedId
                const dimmed = dimmedIds ? dimmedIds.has(d.id) : false
                return (
                  <button
                    key={d.id}
                    type="button"
                    data-pin={d.id}
                    id={`pin-${d.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onPinTap(d.id)
                    }}
                    title={`${d.seq} · ${d.title}`}
                    className={`absolute flex items-center justify-center rounded-full bg-white font-bold text-gray-900 shadow-md ${selected ? 'z-30' : 'z-10'}`}
                    style={{
                      left: `${(d.x / sheet.width) * 100}%`,
                      top: `${(d.y / sheet.height) * 100}%`,
                      width: pinSize,
                      height: pinSize,
                      marginLeft: -pinSize / 2,
                      marginTop: -pinSize / 2,
                      transform: `scale(${1 / scale})`,
                      transformOrigin: 'center',
                      border: `${selected ? 4 : 3}px solid ${ring}`,
                      boxShadow: selected ? `0 0 0 4px ${ring}55, 0 2px 6px rgba(0,0,0,.35)` : undefined,
                      opacity: dimmed ? 0.3 : 1,
                      fontSize: d.seq >= 100 ? 11 : 14,
                      lineHeight: 1,
                      touchAction: 'manipulation',
                    }}
                  >
                    {d.seq}
                  </button>
                )
              })}
            </div>
          </TransformComponent>
        </TransformWrapper>
      )}
    </div>
  )
})
