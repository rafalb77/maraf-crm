import type { MarafWorkItemLite } from '@/lib/protokol-maraf-match'

/**
 * Rozwijany podgląd obmiaru inżynierskiego Maraf (konstrukcja żelbetowa)
 * w widoku protokołu przerobowego — żeby user mógł zweryfikować dopasowania
 * w kolumnie "Maraf (obmiar)" bez opuszczania strony protokołu.
 *
 * Server component — natywny <details>/<summary>, zero client JS.
 * Pozycje agregowane po (kategoria, elementType, kondygnacja).
 */

// Kolejność kategorii jak w scripts/import-obmiar.js (CATEGORIES).
const CATEGORY_ORDER = [
  'Fundamenty',
  'Piony 0',
  'Belki nad 0',
  'Strop nad 0',
  'Piony nadziemia',
  'Belki nadziemia',
  'Stropy nadziemia',
  'Szyby windowe',
  'Biegi schodowe',
]

type AggRow = {
  elementType: string
  floor: string
  count: number
  areaM2: number
  volumeM3: number
}

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function catRank(name: string) {
  const i = CATEGORY_ORDER.indexOf(name)
  return i === -1 ? 999 : i
}

export function MarafObmiarPanel({ items }: { items: MarafWorkItemLite[] }) {
  if (items.length === 0) return null

  // Agregacja: kategoria → klucz(elementType|floor) → suma A/V + licznik
  const byCategory = new Map<string, Map<string, AggRow>>()
  for (const it of items) {
    const cat = it.categoryName
    if (!byCategory.has(cat)) byCategory.set(cat, new Map())
    const rows = byCategory.get(cat)!
    const key = `${it.elementType ?? '—'}|${it.floor ?? '—'}`
    const row =
      rows.get(key) ??
      { elementType: it.elementType ?? '—', floor: it.floor ?? '—', count: 0, areaM2: 0, volumeM3: 0 }
    row.count += 1
    row.areaM2 += it.areaM2 ?? 0
    row.volumeM3 += it.volumeM3 ?? 0
    rows.set(key, row)
  }

  const categories = [...byCategory.keys()].sort((a, b) => catRank(a) - catRank(b))

  // Suma globalna
  let totalA = 0
  let totalV = 0
  for (const it of items) {
    totalA += it.areaM2 ?? 0
    totalV += it.volumeM3 ?? 0
  }

  return (
    <details className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <summary className="px-5 py-3 cursor-pointer font-semibold text-gray-900 hover:bg-gray-50 select-none flex items-center justify-between gap-3 flex-wrap">
        <span>
          Podgląd obmiaru Maraf — konstrukcja żelbetowa
          <span className="text-xs font-normal text-gray-500 ml-2">
            ({items.length} pozycji · kliknij aby rozwinąć)
          </span>
        </span>
        <span className="text-xs font-normal text-gray-500 tabular-nums">
          Σ {fmt(totalA)} m² · {fmt(totalV)} m³
        </span>
      </summary>

      <div className="border-t border-gray-100">
        {categories.map((cat) => {
          const rows = [...byCategory.get(cat)!.values()].sort(
            (a, b) => a.floor.localeCompare(b.floor) || a.elementType.localeCompare(b.elementType),
          )
          const catA = rows.reduce((s, r) => s + r.areaM2, 0)
          const catV = rows.reduce((s, r) => s + r.volumeM3, 0)
          return (
            <div key={cat}>
              <div className="px-5 py-2 bg-gray-50/60 flex items-center justify-between flex-wrap gap-1">
                <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wide">{cat}</h4>
                <span className="text-xs text-gray-500 tabular-nums">
                  {fmt(catA)} m² · {fmt(catV)} m³
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] lg:min-w-0 text-sm">
                  <thead className="text-xs text-gray-500">
                    <tr className="border-t border-gray-100">
                      <th className="text-left px-5 py-1.5 font-medium">Rodzaj elementu</th>
                      <th className="text-left px-2 py-1.5 font-medium">Kondygnacja</th>
                      <th className="text-right px-2 py-1.5 font-medium">Pozycji</th>
                      <th className="text-right px-2 py-1.5 font-medium">A [m²]</th>
                      <th className="text-right px-5 py-1.5 font-medium">V [m³]</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-5 py-1.5 text-gray-900">{r.elementType}</td>
                        <td className="px-2 py-1.5 text-gray-600">{r.floor}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{r.count}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">
                          {r.areaM2 > 0 ? fmt(r.areaM2) : '—'}
                        </td>
                        <td className="px-5 py-1.5 text-right tabular-nums text-gray-700">
                          {r.volumeM3 > 0 ? fmt(r.volumeM3) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </details>
  )
}
