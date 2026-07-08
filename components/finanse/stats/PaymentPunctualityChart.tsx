import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import type { PunctualityData } from '@/lib/finanse-stats'

// Terminowosc platnosci — wykres motylkowy (server component, czysty CSS):
// zielony pasek w LEWO = kwoty zaplacone w terminie/przed terminem,
// czerwony w PRAWO = po terminie. Badge = sredni poslizg wazony kwota.
// Okno: wplaty z ostatnich 12 miesiecy.
export function PaymentPunctualityChart({ data }: { data: PunctualityData }) {
  const { rows, totalEarly, totalLate } = data
  const max = Math.max(1, ...rows.map((r) => Math.max(r.earlyAmount, r.lateAmount)))
  const totalPaid = totalEarly + totalLate
  const earlyPct = totalPaid > 0 ? Math.round((totalEarly / totalPaid) * 100) : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Terminowość płatności</h2>
        <p className="text-xs text-gray-500 mt-0.5">Wpłaty z 12 mies. wg terminu FV • ← przed terminem / po terminie →</p>
      </div>

      {totalPaid > 0 ? (
        <div className="flex items-center gap-4 mb-5 text-sm">
          <div className="flex-1 flex rounded-full overflow-hidden h-2 bg-gray-100">
            <div className="h-full bg-emerald-500" style={{ width: `${earlyPct}%` }} />
            <div className="h-full bg-red-400" style={{ width: `${100 - earlyPct}%` }} />
          </div>
          <p className="whitespace-nowrap text-gray-600">
            <strong className="text-emerald-700 tabular-nums">{earlyPct}%</strong> kwot w terminie
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-400 py-6 text-center">Brak wpłat z terminem w ostatnich 12 miesiącach.</p>
      )}

      <div className="space-y-2.5">
        {rows.map((r) => {
          const earlyW = (r.earlyAmount / max) * 100
          const lateW = (r.lateAmount / max) * 100
          const late = r.avgDays > 0
          return (
            <div key={r.name}>
              <div className="flex items-baseline justify-between mb-0.5 gap-2">
                <span className="text-xs font-medium text-gray-800 truncate" title={r.name}>{r.name}</span>
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded font-medium tabular-nums whitespace-nowrap ${
                    late ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                  title={`Średni poślizg ważony kwotą${r.maxLateDays > 0 ? ` • najgorzej: +${r.maxLateDays} dni` : ''}`}
                >
                  {late ? `+${r.avgDays}` : r.avgDays} dni
                </span>
              </div>
              <div
                className="grid items-center"
                style={{ gridTemplateColumns: '1fr 2px 1fr' }}
                title={`${r.name}: przed terminem ${fmtMoney(r.earlyAmount)}, po terminie ${fmtMoney(r.lateAmount)}`}
              >
                {/* przed terminem — rosnie w lewo */}
                <div className="flex justify-end items-center gap-1.5 min-w-0">
                  {r.earlyAmount > 0.01 && (
                    <span className="text-[10px] text-emerald-700 tabular-nums whitespace-nowrap">{fmtMoneyShort(r.earlyAmount)}</span>
                  )}
                  <div className="bg-emerald-500 h-3.5 rounded-l-full" style={{ width: `${earlyW}%`, transition: 'width .6s ease' }} />
                </div>
                {/* os terminu */}
                <div className="bg-gray-300 h-5 w-px justify-self-center" />
                {/* po terminie — rosnie w prawo */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="bg-red-400 h-3.5 rounded-r-full" style={{ width: `${lateW}%`, transition: 'width .6s ease' }} />
                  {r.lateAmount > 0.01 && (
                    <span className="text-[10px] text-red-600 tabular-nums whitespace-nowrap">{fmtMoneyShort(r.lateAmount)}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {totalPaid > 0 && (
        <div className="flex justify-between mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
          <span>Przed terminem: <strong className="text-emerald-700 tabular-nums">{fmtMoney(totalEarly)}</strong></span>
          <span>Po terminie: <strong className="text-red-600 tabular-nums">{fmtMoney(totalLate)}</strong></span>
        </div>
      )}
    </div>
  )
}
