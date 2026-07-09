import { prisma } from '@/lib/prisma'
import { INVESTMENT_STATUS_LABELS, INVESTMENT_STATUS_COLORS, InvestmentStatus } from '@/lib/types'

/**
 * Pulpit budowy — moduł Budowa (Project Manager), Etap 0 (szkielet).
 * Docelowa zawartość (alerty, feed raportów, mini-oś czasu etapów) dochodzi
 * w Etapach 1-2 — patrz docs/budowa-rozpoczecie.md.
 */
export default async function BudowaPage() {
  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!investment) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Budowa</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Brak aktywnej inwestycji. Uruchom seed (<code>npm run db:seed</code>) albo dodaj
          inwestycję w bazie — edycja w UI dojdzie w kolejnych etapach.
        </div>
      </div>
    )
  }

  const status = investment.status as InvestmentStatus
  const statusLabel = INVESTMENT_STATUS_LABELS[status] ?? investment.status
  const statusColor = INVESTMENT_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'

  const daysToEnd = investment.plannedEndDate
    ? Math.ceil((investment.plannedEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="p-8">
      {/* Nagłówek inwestycji */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{investment.name}</h1>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
          {statusLabel}
        </span>
        {investment.address && <span className="text-sm text-gray-500">{investment.address}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">Start budowy</div>
          <div className="text-lg font-semibold">
            {investment.startDate ? investment.startDate.toLocaleDateString('pl-PL') : '—'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">
            Planowane zakończenie
          </div>
          <div className="text-lg font-semibold">
            {investment.plannedEndDate
              ? investment.plannedEndDate.toLocaleDateString('pl-PL')
              : '—'}
          </div>
          {daysToEnd !== null && (
            <div className={`text-sm mt-1 ${daysToEnd < 0 ? 'text-red-600' : 'text-gray-500'}`}>
              {daysToEnd >= 0 ? `za ${daysToEnd} dni` : `${Math.abs(daysToEnd)} dni po terminie`}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">Postęp</div>
          <div className="text-lg font-semibold text-gray-400">—</div>
          <div className="text-sm text-gray-500 mt-1">liczony z harmonogramu (Etap 2)</div>
        </div>
      </div>

      {/* Zapowiedzi kolejnych etapów modułu — znikają w miarę wdrażania */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6">
          <div className="font-semibold mb-1">Dziennik budowy</div>
          <p className="text-sm text-gray-500">
            Raporty kierownika, zdjęcia z budowy, Widok Prezesa — Etap 1 (w przygotowaniu).
          </p>
        </div>
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6">
          <div className="font-semibold mb-1">Harmonogram (Gantt)</div>
          <p className="text-sm text-gray-500">
            Etapy, zadania, kamienie milowe, opóźnienia, odbiory — Etap 2.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6">
          <div className="font-semibold mb-1">Koszty budowy</div>
          <p className="text-sm text-gray-500">
            Faktury per etap/wykonawca, budżety etapów, alerty — Etap 3 (dane z modułu Finanse).
          </p>
        </div>
      </div>
    </div>
  )
}
