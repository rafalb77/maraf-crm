'use client'
import { useMemo, useState } from 'react'

type Item = {
  id: string
  floor: string | null
  elementType: string | null
  name: string
  count: number | null
  volumeM3: number | null
  areaM2: number | null
  primaryUnit: string
  primaryQty: number
  notes: string | null
  completedPct: number
}

type Category = {
  id: string
  name: string
  slug: string
  primaryUnit: string
  items: Item[]
}

export function ObmiarTree({ categories }: { categories: Category[] }) {
  const [openCats, setOpenCats] = useState<Set<string>>(new Set([categories[0]?.id]))
  const [openFloors, setOpenFloors] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  function toggleCat(id: string) {
    setOpenCats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleFloor(key: string) {
    setOpenFloors((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function expandAll() {
    const cats = new Set(categories.map((c) => c.id))
    const floors = new Set<string>()
    categories.forEach((c) => {
      const groups = groupByFloor(c.items)
      Object.keys(groups).forEach((f) => floors.add(`${c.id}::${f}`))
    })
    setOpenCats(cats)
    setOpenFloors(floors)
  }
  function collapseAll() {
    setOpenCats(new Set())
    setOpenFloors(new Set())
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return categories
    const q = search.toLowerCase()
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            (it.elementType || '').toLowerCase().includes(q) ||
            (it.floor || '').toLowerCase().includes(q),
        ),
      }))
      .filter((c) => c.items.length > 0)
  }, [categories, search])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj: nazwa, kondygnacja, rodzaj..."
          className="flex-1 min-w-[200px] max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 text-xs">
          <button onClick={expandAll} className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
            Rozwiń wszystko
          </button>
          <button onClick={collapseAll} className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
            Zwiń wszystko
          </button>
        </div>
      </div>

      {filtered.map((cat) => (
        <CategoryNode
          key={cat.id}
          category={cat}
          isOpen={openCats.has(cat.id) || !!search.trim()}
          onToggle={() => toggleCat(cat.id)}
          openFloors={openFloors}
          onToggleFloor={toggleFloor}
          forceFloorsOpen={!!search.trim()}
        />
      ))}
    </div>
  )
}

function CategoryNode({
  category,
  isOpen,
  onToggle,
  openFloors,
  onToggleFloor,
  forceFloorsOpen,
}: {
  category: Category
  isOpen: boolean
  onToggle: () => void
  openFloors: Set<string>
  onToggleFloor: (key: string) => void
  forceFloorsOpen: boolean
}) {
  const totalQty = category.items.reduce((s, it) => s + it.primaryQty, 0)

  const groups = groupByFloor(category.items)
  const floorKeys = Object.keys(groups).sort(floorSort)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <Chevron open={isOpen} />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h3 className="font-semibold text-gray-900">{category.name}</h3>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">{category.items.length} poz.</span>
              <span className="font-medium text-gray-700">
                {fmtQty(totalQty)} {category.primaryUnit === 'M3' ? 'm³' : category.primaryUnit === 'M2' ? 'm²' : 'szt'}
              </span>
            </div>
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 bg-gray-50/50">
          {floorKeys.map((floor) => {
            const items = groups[floor]
            const fkey = `${category.id}::${floor}`
            const fOpen = openFloors.has(fkey) || forceFloorsOpen
            return (
              <FloorNode
                key={fkey}
                floor={floor}
                items={items}
                isOpen={fOpen}
                onToggle={() => onToggleFloor(fkey)}
                categoryUnit={category.primaryUnit}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function FloorNode({
  floor,
  items,
  isOpen,
  onToggle,
  categoryUnit,
}: {
  floor: string
  items: Item[]
  isOpen: boolean
  onToggle: () => void
  categoryUnit: string
}) {
  // Pogrupuj po elementType wewnątrz kondygnacji
  const byType: Record<string, Item[]> = {}
  for (const it of items) {
    const t = it.elementType || '—'
    if (!byType[t]) byType[t] = []
    byType[t].push(it)
  }
  const types = Object.keys(byType).sort()
  const totalQty = items.reduce((s, it) => s + it.primaryQty, 0)

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-gray-100/70 transition-colors text-left"
      >
        <span className="ml-6">
          <Chevron open={isOpen} small />
        </span>
        <div className="flex-1 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <span className="text-sm font-medium text-gray-700">{floor || '—'}</span>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{items.length} poz.</span>
                <span className="font-medium text-gray-700">
                  {fmtQty(totalQty)} {unitLabel(categoryUnit)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="bg-white">
          {types.map((t) => (
            <div key={t} className="border-t border-gray-100">
              <div className="px-5 py-2 bg-gray-50/60 text-xs font-semibold uppercase tracking-wider text-gray-500 ml-12">
                {t}
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] lg:min-w-0 text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="text-left px-5 py-1.5 pl-16 font-medium">Nazwa</th>
                    <th className="text-right px-3 py-1.5 font-medium">Szt.</th>
                    <th className="text-right px-3 py-1.5 font-medium">A [m²]</th>
                    <th className="text-right px-3 py-1.5 font-medium">V [m³]</th>
                  </tr>
                </thead>
                <tbody>
                  {byType[t].map((it) => (
                    <tr key={it.id} className="border-t border-gray-50 hover:bg-gray-50/40">
                      <td className="px-5 py-1.5 pl-16 font-mono text-xs text-gray-900">
                        {it.name}
                        {it.notes && (
                          <span className="ml-2 text-amber-600 text-[10px]" title={it.notes}>
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-600">
                        {it.count != null ? it.count : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-600 tabular-nums">
                        {it.areaM2 != null ? it.areaM2.toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-900 tabular-nums font-medium">
                        {it.volumeM3 != null ? it.volumeM3.toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ pct, thin, showLabel }: { pct: number; thin?: boolean; showLabel?: boolean }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const color = clamped >= 100 ? '#16a34a' : clamped >= 50 ? '#ca8a04' : clamped > 0 ? '#2563eb' : '#e5e7eb'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className={`flex-1 bg-gray-200 rounded-full overflow-hidden ${thin ? 'h-1' : 'h-1.5'}`}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="text-[10px] text-gray-500 tabular-nums w-8 text-right">
          {clamped.toFixed(0)}%
        </span>
      )}
    </div>
  )
}

function Chevron({ open, small }: { open: boolean; small?: boolean }) {
  const cls = small ? 'w-3 h-3' : 'w-4 h-4'
  return (
    <svg
      className={`${cls} text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

function groupByFloor(items: Item[]): Record<string, Item[]> {
  const out: Record<string, Item[]> = {}
  for (const it of items) {
    const k = it.floor || '—'
    if (!out[k]) out[k] = []
    out[k].push(it)
  }
  return out
}

function floorSort(a: string, b: string) {
  // "Kondygnacja 0" przed "Kondygnacja 1" przed "Dach"
  const na = parseFloorNumber(a)
  const nb = parseFloorNumber(b)
  return na - nb
}

function parseFloorNumber(s: string): number {
  if (/dach/i.test(s)) return 999
  const m = s.match(/-?\d+/)
  return m ? parseInt(m[0], 10) : 1000
}

function fmtQty(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function unitLabel(u: string) {
  return u === 'M3' ? 'm³' : u === 'M2' ? 'm²' : 'szt'
}
