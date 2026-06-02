'use client'
import { useState } from 'react'
import { fmtMoney } from '@/lib/finanse-format'
import type { HeatmapDay } from '@/lib/finanse-stats'

const DAY_LABELS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']
const MONTH_LABELS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']

// Skala intensywności (5 poziomów) — pogrupowana per kwartyle
function intensity(value: number, p25: number, p50: number, p75: number, max: number): number {
  if (value <= 0) return 0
  if (value <= p25) return 1
  if (value <= p50) return 2
  if (value <= p75) return 3
  return 4
}

const SHADES = [
  '#f3f4f6', // 0 — nic
  '#dbeafe', // 1 — drobne
  '#93c5fd', // 2 — średnie
  '#3b82f6', // 3 — dużo
  '#1e40af', // 4 — bardzo dużo
]

export function ActivityHeatmap({ data }: { data: HeatmapDay[] }) {
  const [hover, setHover] = useState<HeatmapDay | null>(null)

  // Posortuj rosnąco po dacie
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))
  const values = sorted.map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b)
  const p25 = values[Math.floor(values.length * 0.25)] || 0
  const p50 = values[Math.floor(values.length * 0.5)] || 0
  const p75 = values[Math.floor(values.length * 0.75)] || 0
  const max = values[values.length - 1] || 0

  // Grupowanie po tygodniach (kolumna = tydzień, wiersz = dzień tygodnia poniedziałek=0)
  type Cell = { date: string; value: number; level: number; dow: number; weekIdx: number }
  const cells: Cell[] = []
  if (sorted.length > 0) {
    const first = new Date(sorted[0].date + 'T00:00:00')
    // pn=0..nd=6 (Date.getDay zwraca nd=0..sb=6 → przesuwamy)
    const dowOf = (d: Date) => (d.getDay() + 6) % 7
    const firstDow = dowOf(first)
    for (let i = 0; i < sorted.length; i++) {
      const d = sorted[i]
      const dateObj = new Date(d.date + 'T00:00:00')
      const dow = dowOf(dateObj)
      const weekIdx = Math.floor((i + firstDow) / 7)
      cells.push({ date: d.date, value: d.value, level: intensity(d.value, p25, p50, p75, max), dow, weekIdx })
    }
  }

  const numWeeks = cells.length > 0 ? Math.max(...cells.map((c) => c.weekIdx)) + 1 : 0
  const cellSize = 14
  const cellGap = 3

  // Etykiety miesięcy nad odpowiednim tygodniem (pierwszy tydzień zaczynający dany miesiąc)
  const monthLabels: { weekIdx: number; label: string }[] = []
  let lastMonth = -1
  for (const c of cells) {
    const m = new Date(c.date + 'T00:00:00').getMonth()
    if (m !== lastMonth && cells.filter((x) => x.weekIdx === c.weekIdx)[0]?.date === c.date) {
      monthLabels.push({ weekIdx: c.weekIdx, label: MONTH_LABELS[m] })
      lastMonth = m
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Aktywność płatnicza (90 dni)</h2>
        <p className="text-xs text-gray-500 mt-0.5">Intensywność = suma wypłaconych kosztów per dzień</p>
      </div>

      <div className="overflow-x-auto">
        <svg
          width={numWeeks * (cellSize + cellGap) + 30}
          height={7 * (cellSize + cellGap) + 25}
        >
          {/* Miesiace */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={30 + m.weekIdx * (cellSize + cellGap)}
              y={10}
              fontSize="10"
              fill="#9ca3af"
            >{m.label}</text>
          ))}
          {/* Dni tygodnia (Pn/Sr/Pt zeby nie zaslaniac) */}
          {DAY_LABELS.map((d, i) => (
            i % 2 === 0 && (
              <text
                key={d}
                x={0}
                y={20 + i * (cellSize + cellGap) + cellSize / 2 + 4}
                fontSize="10"
                fill="#9ca3af"
              >{d}</text>
            )
          ))}
          {/* Komorki */}
          {cells.map((c) => (
            <rect
              key={c.date}
              x={30 + c.weekIdx * (cellSize + cellGap)}
              y={20 + c.dow * (cellSize + cellGap)}
              width={cellSize}
              height={cellSize}
              rx={2.5}
              fill={SHADES[c.level]}
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </svg>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-gray-500 min-h-[16px]">
          {hover ? (
            <span>
              <strong>{hover.date}</strong> — {hover.value > 0 ? fmtMoney(hover.value) : 'brak płatności'}
            </span>
          ) : (
            <span className="text-gray-400">Najedź na komórkę żeby zobaczyć dzień</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span>mniej</span>
          {SHADES.map((s, i) => (
            <span key={i} className="inline-block rounded-sm" style={{ width: 10, height: 10, backgroundColor: s }} />
          ))}
          <span>więcej</span>
        </div>
      </div>
    </div>
  )
}
