// Mikrointerakcja „ripple" dla oprawy v2 (handoff/ripple.ts).
// Rysuje falę w OSOBNEJ warstwie nad klikniętym elementem (fixed overlay),
// więc efekt przeżywa re-render Reacta następujący zaraz po kliknięciu.
//
// Użycie:
//   const onPointerDown = useRipple()
//   <button onPointerDown={onPointerDown}> ... </button>
//
// Wymaga @keyframes mrRipple w globals.css.

import { useCallback, type PointerEvent } from 'react'

// 1 = ledwo widoczne, 10 = wyraźne. Domyślnie 6 dla v2.
const LEVEL = 6

export function useRipple() {
  return useCallback((e: PointerEvent<HTMLElement>) => {
    const t = e.currentTarget
    const r = t.getBoundingClientRect()
    const cs = getComputedStyle(t)

    const wrap = document.createElement('div')
    wrap.style.cssText =
      'position:fixed;pointer-events:none;z-index:9999;overflow:hidden;' +
      `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;` +
      `border-radius:${cs.borderRadius};`

    const d = Math.max(r.width, r.height) * 1.15
    const dur = 350 + LEVEL * 45
    const s = document.createElement('span')
    s.style.cssText =
      `position:absolute;border-radius:50%;background:${cs.color || '#C9A37A'};` +
      `width:${d}px;height:${d}px;` +
      `left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px;` +
      `transform:scale(0);opacity:${(0.08 + LEVEL * 0.022).toFixed(2)};` +
      `animation:mrRipple ${dur}ms ease-out forwards;`

    wrap.appendChild(s)
    document.body.appendChild(wrap)
    setTimeout(() => wrap.remove(), dur + 60)
  }, [])
}
