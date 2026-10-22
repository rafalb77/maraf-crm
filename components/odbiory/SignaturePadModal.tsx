'use client'
import { useEffect, useRef, useState } from 'react'
import type SignaturePadType from 'signature_pad'

/**
 * Pełnoekranowe pole do podpisu palcem / rysikiem (tablet na budowie).
 * Biblioteka signature_pad (Bézier, obsługa dotyku i rysika). Canvas skalowany do DPR,
 * żeby podpis był ostry także w PDF. Zwraca PNG jako data URL (przezroczyste tło).
 */
export function SignaturePadModal({
  title,
  subtitle,
  busy,
  onCancel,
  onAccept,
}: {
  title: string
  subtitle?: string
  busy?: boolean
  onCancel: () => void
  onAccept: (dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const padRef = useRef<SignaturePadType | null>(null)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    let disposed = false
    let pad: SignaturePadType | null = null
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const rect = canvas.getBoundingClientRect()
      const data = pad?.toData()
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      canvas.getContext('2d')?.scale(ratio, ratio)
      if (pad) {
        pad.clear()
        if (data && data.length) pad.fromData(data)
      }
    }
    import('signature_pad').then(({ default: SignaturePad }) => {
      if (disposed) return
      pad = new SignaturePad(canvas, { minWidth: 1.2, maxWidth: 3.2, penColor: '#111827', throttle: 8 })
      pad.addEventListener('endStroke', () => setEmpty(pad!.isEmpty()))
      padRef.current = pad
      resize()
    })
    window.addEventListener('resize', resize)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      disposed = true
      window.removeEventListener('resize', resize)
      document.body.style.overflow = prevOverflow
      pad?.off()
    }
  }, [])

  function clear() {
    padRef.current?.clear()
    setEmpty(true)
  }

  function accept() {
    const pad = padRef.current
    if (!pad || pad.isEmpty()) return
    onAccept(pad.toDataURL('image/png'))
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-900/95 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label={`Podpis: ${title}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-white">
        <div>
          <div className="text-lg font-semibold">{title}</div>
          {subtitle && <div className="text-sm text-gray-300">{subtitle}</div>}
        </div>
        <div className="text-xs text-gray-400">Podpisz palcem lub rysikiem w białym polu</div>
      </div>
      <div className="relative min-h-0 flex-1 rounded-xl bg-white shadow-inner">
        <canvas ref={canvasRef} className="h-full w-full touch-none rounded-xl" style={{ touchAction: 'none' }} />
        <div className="pointer-events-none absolute inset-x-8 bottom-10 border-b-2 border-dashed border-gray-300" />
        <div className="pointer-events-none absolute bottom-3 left-8 text-xs text-gray-400">podpis</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={clear} disabled={busy} className="rounded-lg border border-gray-500 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800">Wyczyść</button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border border-gray-500 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800">Anuluj</button>
          <button type="button" onClick={accept} disabled={busy || empty} className="rounded-lg bg-green-600 px-6 py-3 text-base font-semibold text-white hover:bg-green-500 disabled:opacity-40">
            {busy ? 'Zapisuję…' : 'Zatwierdź podpis'}
          </button>
        </div>
      </div>
    </div>
  )
}
