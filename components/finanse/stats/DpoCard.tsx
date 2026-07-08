import { fmtMoneyShort } from '@/lib/finanse-format'
import type { DpoData } from '@/lib/finanse-stats'

// DPO (Days Payable Outstanding) — mediana dni od wystawienia FV do pelnej
// zaplaty. Duza liczba + delta vs poprzedni kwartal + sparkline 12 mc median.
// Server component, sparkline czystym SVG.
export function DpoCard({ data }: { data: DpoData }) {
  const { median3m, prevMedian3m, latePct3m, spark } = data
  const delta = median3m != null && prevMedian3m != null ? median3m - prevMedian3m : null

  // Sparkline: tylko miesiace z mediana; min 2 punkty zeby rysowac linie
  const points = spark.map((s, i) => ({ i, v: s.median, m: s.m })).filter((p) => p.v != null) as { i: number; v: number; m: string }[]
  const W = 260; const H = 48; const PAD = 4
  let path = ''
  if (points.length >= 2) {
    const vMin = Math.min(...points.map((p) => p.v))
    const vMax = Math.max(...points.map((p) => p.v))
    const x = (i: number) => PAD + (i / 11) * (W - 2 * PAD)
    const y = (v: number) => vMax === vMin ? H / 2 : PAD + (1 - (v - vMin) / (vMax - vMin)) * (H - 2 * PAD)
    path = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-semibold text-gray-900">Cykl płatności (DPO)</h2>
        <span className="text-xs text-gray-400">mediana: wystawienie → zapłata</span>
      </div>

      {median3m == null ? (
        <p className="text-sm text-gray-400 mt-4">Brak faktur rozliczonych w ostatnich 3 miesiącach.</p>
      ) : (
        <>
          <div className="flex items-end gap-3 mt-2 flex-wrap">
            <p className="text-4xl font-bold text-gray-900 tabular-nums leading-none">
              {median3m}<span className="text-base font-medium text-gray-500 ml-1">dni</span>
            </p>
            {delta != null && delta !== 0 && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium tabular-nums ${
                delta < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {delta < 0 ? '▼' : '▲'} {Math.abs(delta)} dni vs poprzedni kwartał
              </span>
            )}
            {delta === 0 && <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">bez zmian vs poprzedni kwartał</span>}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Tyle dni firma realnie kredytuje się u dostawców (faktury rozliczone w ost. 3 mies.).
            {latePct3m != null && (
              <>
                {' '}Po terminie zapłacono{' '}
                <strong className={latePct3m > 30 ? 'text-red-600' : latePct3m > 10 ? 'text-amber-600' : 'text-emerald-700'}>
                  {latePct3m}%
                </strong>{' '}kwot.
              </>
            )}
          </p>

          {points.length >= 2 && (
            <div className="mt-4">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none">
                <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {points.map((p) => {
                  const vMin = Math.min(...points.map((q) => q.v))
                  const vMax = Math.max(...points.map((q) => q.v))
                  const cx = PAD + (p.i / 11) * (W - 2 * PAD)
                  const cy = vMax === vMin ? H / 2 : PAD + (1 - (p.v - vMin) / (vMax - vMin)) * (H - 2 * PAD)
                  return <circle key={p.i} cx={cx} cy={cy} r="2.5" fill="var(--accent)"><title>{`${p.m}: mediana ${p.v} dni`}</title></circle>
                })}
              </svg>
              <p className="text-[10px] text-gray-400 mt-1">Mediana DPO per miesiąc rozliczenia — ostatnie 12 mies.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
