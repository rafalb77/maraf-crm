'use client'
import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import type { LoansSummary, EscrowSummary, VatRefundsSummary, DscrData } from '@/lib/finanse-stats'

export function FinansowanieKpi({
  loans, escrow, vat, dscr,
}: {
  loans: LoansSummary
  escrow: EscrowSummary
  vat: VatRefundsSummary
  dscr: DscrData
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      {/* 1. Kredyt inwestycyjny */}
      <LoanCard
        label="Kredyt inwestycyjny"
        emoji="💳"
        accentColor="blue"
        limit={loans.byType.INWESTYCYJNY.limit}
        outstanding={loans.byType.INWESTYCYJNY.outstanding}
        available={loans.byType.INWESTYCYJNY.available}
        count={loans.byType.INWESTYCYJNY.count}
      />
      {/* 2. Kredyt VAT */}
      <LoanCard
        label="Kredyt VAT"
        emoji="💸"
        accentColor="purple"
        limit={loans.byType.VAT.limit}
        outstanding={loans.byType.VAT.outstanding}
        available={loans.byType.VAT.available}
        count={loans.byType.VAT.count}
      />
      {/* 3. Escrow */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs text-gray-500 font-medium">Rachunki powiernicze</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">{fmtMoney(escrow.inEscrow)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{escrow.accountsCount} rach. • aktualnie w escrow</p>
          </div>
          <span className="text-2xl">🏦</span>
        </div>
        <div className="border-t border-gray-100 pt-2 mt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Uwolnione YTD</span>
            <span className="font-semibold text-emerald-700 tabular-nums">{fmtMoney(escrow.releasedYTD)}</span>
          </div>
        </div>
      </div>
      {/* 4. Zwroty VAT */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs text-gray-500 font-medium">Zwroty VAT (YTD)</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">{fmtMoney(vat.totalYTD)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{vat.count} zwrotów łącznie</p>
          </div>
          <span className="text-2xl">💰</span>
        </div>
        <div className="border-t border-gray-100 pt-2 mt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Na spłatę kredytu VAT</span>
            <span className="font-semibold text-purple-700 tabular-nums">{fmtMoney(vat.appliedToLoanYTD)}</span>
          </div>
        </div>
      </div>
      {/* 5. DSCR */}
      <DscrCard data={dscr} />
    </div>
  )
}

function LoanCard({
  label, emoji, accentColor, limit, outstanding, available, count,
}: {
  label: string
  emoji: string
  accentColor: 'blue' | 'purple'
  limit: number
  outstanding: number
  available: number
  count: number
}) {
  const pct = limit > 0 ? Math.round((outstanding / limit) * 100) : 0
  const barColor = pct > 80 ? 'bg-rose-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
  const accent = accentColor === 'blue' ? 'text-blue-600' : 'text-purple-600'

  if (count === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 opacity-60">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs text-gray-500 font-medium">{label}</p>
            <p className="text-base text-gray-400 mt-1.5">Brak</p>
          </div>
          <span className="text-2xl grayscale">{emoji}</span>
        </div>
        <p className="text-[10px] text-gray-400">Dodaj kredyt w „Finansowanie → Kredyty"</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className={`text-lg font-bold tabular-nums mt-0.5 ${accent}`}>{fmtMoneyShort(outstanding)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">do spłaty • limit {fmtMoneyShort(limit)}</p>
        </div>
        <span className="text-2xl">{emoji}</span>
      </div>
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
          <span>Wykorzystanie</span>
          <span className="tabular-nums font-semibold">{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5">Dostępne: <strong className="tabular-nums">{fmtMoney(available)}</strong></p>
      </div>
    </div>
  )
}

function DscrCard({ data }: { data: DscrData }) {
  const style = {
    safe: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'Bezpieczne' },
    warn: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', label: 'Uważaj' },
    risk: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', label: 'Ryzyko' },
    na: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-500', label: 'Brak rat' },
  }[data.label]

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs text-gray-600 font-medium">DSCR (12 mc)</p>
          <p className={`text-2xl font-bold tabular-nums mt-0.5 ${style.text}`}>
            {data.ratio !== null ? data.ratio.toFixed(2) : '—'}
          </p>
          <p className={`text-[10px] mt-0.5 font-medium uppercase ${style.text}`}>{style.label}</p>
        </div>
        <span className="text-2xl">⚖️</span>
      </div>
      <div className="border-t border-current/10 pt-2 mt-2 space-y-0.5">
        <p className="text-[10px] text-gray-500">
          ➕ Zysk+escrow+VAT: <strong className="tabular-nums">{fmtMoneyShort(data.numerator)}</strong>
        </p>
        <p className="text-[10px] text-gray-500">
          ➖ Raty (K+O+P): <strong className="tabular-nums">{fmtMoneyShort(data.denominator)}</strong>
        </p>
      </div>
      <p className="text-[9px] text-gray-400 mt-1 italic">
        ≥1.25 bezpieczne • 1.0-1.25 uważaj • &lt;1.0 ryzyko
      </p>
    </div>
  )
}
