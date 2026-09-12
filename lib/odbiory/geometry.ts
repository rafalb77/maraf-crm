// Geometria pinezek na arkuszu (czyste funkcje, klient + serwer).
// Współrzędne w układzie arkusza (PlanSheet.width × height), jak markers.json.

export type SheetMarker = {
  number: string
  kind: string
  x: number
  y: number
  box?: [number, number, number, number]
  poly?: [number, number][]
}

export type SheetUnitMarker = SheetMarker & {
  unitId: string | null
  staircase: string | null
}

export function pointInBox(x: number, y: number, box: [number, number, number, number]): boolean {
  const [x1, y1, x2, y2] = box
  return x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(y1, y2) && y <= Math.max(y1, y2)
}

/** Ray casting — punkt wewnątrz wielokąta. */
export function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function boxArea(box: [number, number, number, number]): number {
  return Math.abs(box[2] - box[0]) * Math.abs(box[3] - box[1])
}

/**
 * Który lokal jest pod pinezką. Kontury (poly) mają pierwszeństwo przed
 * obwiedniami (box); przy kilku trafieniach wygrywa najmniejszy obszar
 * (komórka wewnątrz obwiedni mieszkania).
 */
export function hitTestUnit<T extends SheetMarker>(x: number, y: number, markers: T[]): T | null {
  let best: T | null = null
  let bestScore = Infinity
  for (const m of markers) {
    if (m.poly && m.poly.length >= 3) {
      if (pointInPolygon(x, y, m.poly)) {
        const score = polygonArea(m.poly)
        if (score < bestScore) {
          best = m
          bestScore = score
        }
      }
    } else if (m.box) {
      if (pointInBox(x, y, m.box)) {
        // obwiednia = przybliżenie, więc lekko „karana" wobec konturu
        const score = boxArea(m.box) * 1.5
        if (score < bestScore) {
          best = m
          bestScore = score
        }
      }
    }
  }
  return best
}

export function polygonArea(poly: [number, number][]): number {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1])
  }
  return Math.abs(a / 2)
}

/** Obwiednia grupy znaczników (np. lokale jednej klatki) — do auto-zoomu. */
export function unionBox(markers: SheetMarker[]): [number, number, number, number] | null {
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const m of markers) {
    const pts: [number, number][] = m.poly && m.poly.length ? m.poly : m.box ? [[m.box[0], m.box[1]], [m.box[2], m.box[3]]] : [[m.x, m.y]]
    for (const [px, py] of pts) {
      if (px < x1) x1 = px
      if (py < y1) y1 = py
      if (px > x2) x2 = px
      if (py > y2) y2 = py
    }
  }
  if (!Number.isFinite(x1)) return null
  return [x1, y1, x2, y2]
}
