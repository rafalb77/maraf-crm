import { getCrmStats, type FunnelStep, type Heatmap, type LeadSourceRow } from '@/lib/stats'
import { CLIENT_STATUS_LABELS, type ClientStatus } from '@/lib/types'
import { SalesVelocityChart } from '@/components/stats/SalesVelocityChart'
import { LeadSourceChart } from '@/components/stats/LeadSourceChart'

export default async function StatystykiPage() {
  const { funnel, totalClients, leadSources, velocity, heatmap } = await getCrmStats()

  const signed12m = velocity.reduce((s, m) => s + m.signed, 0)
  const revenue12m = velocity.reduce((s, m) => s + m.revenue, 0)

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Statystyki CRM</h1>
        <p className="text-gray-500 text-sm mt-1">
          Lejek konwersji, ROI źródeł leadów, tempo sprzedaży i mapa sprzedaży lokali
        </p>
      </div>

      {/* Lejek konwersji */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="font-semibold text-gray-900">Lejek konwersji</h2>
          <span className="text-xs text-gray-400">{totalClients} klientów łącznie</span>
        </div>
        <FunnelView funnel={funnel} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking źródeł leadów */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Źródła leadów — ROI</h2>
          <p className="text-xs text-gray-400 mb-4">Leady vs umowy (UMOWA / ODBIÓR) i skuteczność konwersji</p>
          {leadSources.length === 0 ? (
            <p className="text-gray-400 text-sm">Brak danych o źródłach</p>
          ) : (
            <>
              <LeadSourceChart data={leadSources} />
              <LeadSourceRanking rows={leadSources} />
            </>
          )}
        </section>

        {/* Tempo sprzedaży */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="font-semibold text-gray-900">Tempo sprzedaży (12 mc)</h2>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            {signed12m} podpisanych umów ·{' '}
            {revenue12m.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 })} przychodu
          </p>
          <SalesVelocityChart data={velocity} />
        </section>
      </div>

      {/* Heatmapa budynków */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Mapa sprzedaży lokali</h2>
        <p className="text-xs text-gray-400 mb-4">Budynek × kondygnacja — udział sprzedanych lokali (sprzedane / wszystkie)</p>
        <HeatmapView heatmap={heatmap} />
      </section>
    </div>
  )
}

// =====================================================================
// Lejek — poziome słupki proporcjonalne do atOrBeyond + konwersja między etapami
// =====================================================================
function FunnelView({ funnel }: { funnel: FunnelStep[] }) {
  const max = funnel[0]?.atOrBeyond || 1
  return (
    <div className="space-y-1">
      {funnel.map((step, i) => {
        const pct = max > 0 ? (step.atOrBeyond / max) * 100 : 0
        return (
          <div key={step.stage}>
            {i > 0 && (
              <div className="flex items-center gap-2 py-1 pl-1">
                <span className="text-gray-300 text-xs">↓</span>
                <span
                  className={`text-xs font-medium ${step.isBottleneck ? 'text-red-600' : 'text-gray-400'}`}
                >
                  {step.conversionFromPrev !== null ? `${Math.round(step.conversionFromPrev * 100)}%` : '—'}
                  {step.isBottleneck && ' · wąskie gardło'}
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-28 flex-shrink-0 text-sm text-gray-600">
                {CLIENT_STATUS_LABELS[step.stage as ClientStatus] ?? step.stage}
              </div>
              <div className="flex-1 h-7 bg-gray-50 rounded-md overflow-hidden">
                <div
                  className="h-full rounded-md flex items-center justify-end px-2 text-xs font-medium text-white transition-all"
                  style={{
                    width: `${Math.max(pct, 3)}%`,
                    background: step.isBottleneck
                      ? 'linear-gradient(90deg,#ef4444,#f87171)'
                      : 'linear-gradient(90deg,#c9a37a,#dab98f)',
                  }}
                >
                  {step.atOrBeyond}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// =====================================================================
// Ranking źródeł — lista z dokładnymi % konwersji
// =====================================================================
function LeadSourceRanking({ rows }: { rows: LeadSourceRow[] }) {
  return (
    <div className="mt-4 border-t border-gray-100 pt-3 space-y-1.5">
      {rows.map((r) => (
        <div key={r.source} className="flex items-center justify-between text-sm">
          <span className="text-gray-600 truncate">{r.source}</span>
          <span className="text-gray-400 text-xs">
            <span className="font-medium text-gray-700">{r.converted}</span>/{r.total} ·{' '}
            <span className={pctClass(r.conversion)}>{Math.round(r.conversion * 100)}%</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function pctClass(c: number) {
  if (c >= 0.15) return 'text-green-600 font-semibold'
  if (c > 0) return 'text-amber-600 font-medium'
  return 'text-gray-400'
}

// =====================================================================
// Heatmapa — budynek (wiersze) × piętro (kolumny), kolor = udział sprzedanych
// =====================================================================
function HeatmapView({ heatmap }: { heatmap: Heatmap }) {
  if (heatmap.buildings.length === 0) {
    return <p className="text-gray-400 text-sm">Brak lokali do pokazania</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-separate" style={{ borderSpacing: 4 }}>
        <thead>
          <tr>
            <th className="text-left px-2 py-1 text-xs font-medium text-gray-400">Budynek</th>
            {heatmap.floors.map((f) => (
              <th key={f} className="px-2 py-1 text-xs font-medium text-gray-400 text-center min-w-[52px]">
                {floorLabel(f)}
              </th>
            ))}
            <th className="px-2 py-1 text-xs font-medium text-gray-400 text-center">Razem</th>
          </tr>
        </thead>
        <tbody>
          {heatmap.buildings.map((b) => (
            <tr key={b.building}>
              <td className="px-2 py-1 font-medium text-gray-700 whitespace-nowrap">{b.building}</td>
              {b.cells.map((c) => (
                <td key={c.floor} className="text-center">
                  {c.total === 0 ? (
                    <div className="h-9 rounded-md bg-gray-50/60" title="brak lokali" />
                  ) : (
                    <div
                      className="h-9 rounded-md flex flex-col items-center justify-center leading-none"
                      style={cellStyle(c.ratio)}
                      title={`${floorLabel(c.floor)}: ${c.sold}/${c.total} sprzedanych (${Math.round(c.ratio * 100)}%)`}
                    >
                      <span className="text-[11px] font-semibold" style={{ color: c.ratio > 0.5 ? '#fff' : '#1f2937' }}>
                        {c.sold}/{c.total}
                      </span>
                    </div>
                  )}
                </td>
              ))}
              <td className="text-center">
                <span className="text-xs font-semibold text-gray-700">{Math.round(b.ratio * 100)}%</span>
                <span className="block text-[10px] text-gray-400">
                  {b.sold}/{b.total}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
        <span>0%</span>
        <div className="h-2 w-32 rounded-full" style={{ background: 'linear-gradient(90deg,#f0fdf4,#16a34a)' }} />
        <span>100% sprzedanych</span>
      </div>
    </div>
  )
}

// Tło komórki — zielona skala wg udziału sprzedanych (alpha rośnie z ratio).
function cellStyle(ratio: number): React.CSSProperties {
  const alpha = 0.12 + ratio * 0.78
  return { backgroundColor: `rgba(22,163,74,${alpha.toFixed(2)})` }
}

function floorLabel(f: number) {
  if (f === 0) return 'Parter'
  if (f === -1) return 'Podz.'
  if (f < -1) return `${f} p.`
  return `${f} p.`
}
