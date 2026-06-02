import { getActiveCompany } from '@/lib/finanse-company'
import { COMPANY_LABELS } from '@/lib/types'
import {
  getPulseData,
  getCashflow12m,
  getAgingBuckets,
  getTopVendors,
  getRiskConcentration,
  getActivityHeatmap,
  getLoansSummary,
  getEscrowSummary,
  getVatRefundsSummary,
  getCashflowGotowkowy12m,
  getDscr,
} from '@/lib/finanse-stats'
import { PulseCards } from '@/components/finanse/stats/PulseCards'
import { CashflowChart } from '@/components/finanse/stats/CashflowChart'
import { AgingBuckets } from '@/components/finanse/stats/AgingBuckets'
import { TopVendorsChart } from '@/components/finanse/stats/TopVendorsChart'
import { RiskConcentration } from '@/components/finanse/stats/RiskConcentration'
import { ActivityHeatmap } from '@/components/finanse/stats/ActivityHeatmap'
import { FinansowanieKpi } from '@/components/finanse/stats/FinansowanieKpi'

export default async function StatystykiPage() {
  const company = getActiveCompany()
  const isMD = company === 'MARAF_DEVELOPMENT'

  const [pulse, cashflow, aging, topVendors, risk, heatmap, loansSummary, escrowSummary, vatSummary, cashflowGot, dscr] = await Promise.all([
    getPulseData(company),
    getCashflow12m(company),
    getAgingBuckets(company),
    getTopVendors(company, 10),
    getRiskConcentration(company),
    getActivityHeatmap(company),
    getLoansSummary(company),
    getEscrowSummary(company),
    getVatRefundsSummary(company),
    getCashflowGotowkowy12m(company),
    getDscr(company),
  ])

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Statystyki</h1>
        <p className="text-gray-500 text-sm mt-1">
          Analityka modułu Finanse dla <strong>{COMPANY_LABELS[company]}</strong> — live dane, automatyczna aktualizacja
        </p>
      </div>

      {/* 1. Pulse cards (KPI z sparkline) */}
      <PulseCards data={pulse} />

      {/* 1b. KPI Finansowania — TYLKO dla MD */}
      {isMD && (
        <div className="mt-6">
          <FinansowanieKpi loans={loansSummary} escrow={escrowSummary} vat={vatSummary} dscr={dscr} />
        </div>
      )}

      {/* 2. Cashflow 12 miesięcy — z przełącznikiem trybu Operacyjny/Gotówkowy */}
      <div className="mt-6">
        <CashflowChart data={cashflow} cashflowGot={isMD ? cashflowGot : null} />
      </div>

      {/* 3+4. Aging + Top kontrahenci side-by-side na desktop */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AgingBuckets data={aging} />
        <TopVendorsChart data={topVendors} />
      </div>

      {/* 5+6. Ryzyko + Heatmapa */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RiskConcentration data={risk} />
        <ActivityHeatmap data={heatmap} />
      </div>

      <p className="text-xs text-gray-400 mt-8">
        Dane liczone z faktur i płatności aktywnej firmy.
        Przychody/koszty miesięczne wg dat wpłaty (cashflow rzeczywisty), nie wystawienia.
        Aging wg <code>dueDate</code>.
        {isMD && (
          <>
            {' '}Dla MD: cashflow „Gotówkowy" obejmuje uwolnienia escrow, zwroty VAT i spłaty kredytów —
            <strong>nie</strong> wpływy z transz kredytu (to zobowiązanie, nie przychód).
          </>
        )}
      </p>
    </div>
  )
}
