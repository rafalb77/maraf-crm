import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  loadBudowaCostData,
  stageBudgets,
  costSummary,
  unassignedToStage,
  invoicesFromUnbridgedVendor,
  isOverdueUnpaid,
  remaining,
} from '@/lib/budowa-alerts'
import { KosztyTable, type KosztInvoice } from '@/components/budowa/KosztyTable'

/**
 * /budowa/koszty — most finansowy dla Marty (moduł Budowa, Etap 3).
 * Podgląd kosztów per etap/wykonawca, budżety etapów z alertami, inbox faktur
 * do przypisania, tabela z filtrami + eksport. Dane z Finansów (FV nie dublowane).
 * Multi-firma: sumy z OBU firm.
 */
export const dynamic = 'force-dynamic'

function fmt(n: number): string {
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' zł'
}

export default async function KosztyPage() {
  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })
  if (!investment) return <div className="p-8 text-gray-500">Brak aktywnej inwestycji.</div>

  const data = await loadBudowaCostData(investment.id)
  if (!data) return <div className="p-8 text-gray-500">Brak danych kosztowych.</div>

  const now = new Date()
  const budgets = stageBudgets(data)
  const summary = costSummary(data, now)
  const unassigned = unassignedToStage(data)
  const unbridged = invoicesFromUnbridgedVendor(data)

  const stageName = new Map(data.stages.map((s) => [s.id, s.name]))
  const assigned = data.invoices.filter((i) => i.investmentId === investment.id)
  const tableInvoices: KosztInvoice[] = assigned.map((i) => ({
    id: i.id,
    number: i.number,
    company: i.company,
    vendorName: i.vendorName,
    subVendor: i.subVendor,
    status: i.status,
    issueDate: i.issueDate.toISOString().slice(0, 10),
    dueDate: i.dueDate ? i.dueDate.toISOString().slice(0, 10) : null,
    amountNet: i.amountNet,
    amountGross: i.amountGross,
    remaining: remaining(i),
    overdue: isOverdueUnpaid(i, now),
    stageId: i.constructionStageId,
    stageName: i.constructionStageId ? stageName.get(i.constructionStageId) || null : null,
  }))
  const vendorNames = Array.from(new Set(assigned.map((i) => i.vendorName))).sort()

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Koszty budowy — {investment.name}</h1>
        <span className="text-sm text-gray-500">obie firmy (Maraf + MD)</span>
      </div>

      {/* Kafle podsumowania */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tile label="Koszty przypisane (netto)" value={fmt(summary.totalSpentNet)} />
        <Tile
          label="Nieopłacone po terminie"
          value={summary.overdueInvoiceCount ? `${summary.overdueInvoiceCount} • ${fmt(summary.overdueAmount)}` : '—'}
          tone={summary.overdueInvoiceCount ? 'red' : 'green'}
        />
        <Tile
          label="Etapy nad budżetem"
          value={summary.stagesOverBudget ? String(summary.stagesOverBudget) : summary.stagesWarnBudget ? `${summary.stagesWarnBudget} ⚠️` : '—'}
          tone={summary.stagesOverBudget ? 'red' : summary.stagesWarnBudget ? 'amber' : 'green'}
        />
        <Tile
          label="Do sprawdzenia"
          value={summary.toCheckCount ? String(summary.toCheckCount) : '—'}
          tone={summary.toCheckCount ? 'amber' : 'green'}
        />
      </div>

      {/* Budżety etapów */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Budżety etapów</h2>
        <div className="space-y-3">
          {budgets.map((b) => (
            <div key={b.stageId}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">{b.name}</span>
                <span className="tabular-nums text-gray-600">
                  {fmt(b.spentNet)}
                  {b.budgetNet ? ` / ${fmt(b.budgetNet)}` : ' (brak budżetu)'}
                  {b.pct !== null && (
                    <span
                      className={`ml-2 font-semibold ${b.level === 'over' ? 'text-red-600' : b.level === 'warn' ? 'text-amber-600' : 'text-green-600'}`}
                    >
                      {Math.round(b.pct * 100)}%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${b.level === 'over' ? 'bg-red-500' : b.level === 'warn' ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${b.pct !== null ? Math.min(100, Math.round(b.pct * 100)) : 0}%` }}
                />
              </div>
            </div>
          ))}
          {budgets.every((b) => b.budgetNet === null) && (
            <p className="text-xs text-gray-400">
              Wpisz budżety etapów w harmonogramie, żeby zobaczyć alerty przekroczeń.
            </p>
          )}
        </div>
      </div>

      {/* Inboxy: do przypisania + niezmostkowany dostawca */}
      {(unassigned.length > 0 || unbridged.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {unassigned.length > 0 && (
            <Inbox
              title={`Do przypisania — etap (${unassigned.length})`}
              hint="Faktury przypisane do inwestycji, ale bez etapu."
              items={unassigned.map((i) => ({ id: i.id, label: `${i.number} — ${i.vendorName}` }))}
            />
          )}
          {unbridged.length > 0 && (
            <Inbox
              title={`Dostawca bez wykonawcy (${unbridged.length})`}
              hint="FV od kontrahenta niepowiązanego z żadnym wykonawcą — zmostkuj w karcie podwykonawcy."
              items={unbridged.map((i) => ({ id: i.id, label: `${i.number} — ${i.vendorName}` }))}
            />
          )}
        </div>
      )}

      {/* Tabela z filtrami */}
      <KosztyTable invoices={tableInvoices} stages={data.stages} vendors={vendorNames} />

      <p className="mt-4 text-xs text-gray-400">
        Przypisania edytujesz w szczegółach faktury (Finanse → Faktury). Karty wykonawców:{' '}
        <Link href="/budowa/wykonawcy" prefetch={false} className="underline">
          /budowa/wykonawcy
        </Link>
        .
      </p>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'amber' | 'green' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-green-600' : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  )
}

function Inbox({
  title,
  hint,
  items,
}: {
  title: string
  hint: string
  items: { id: string; label: string }[]
}) {
  return (
    <div className="bg-white rounded-xl border border-amber-200 p-4">
      <div className="font-semibold text-amber-800 mb-1">{title}</div>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      <ul className="space-y-1">
        {items.slice(0, 8).map((it) => (
          <li key={it.id} className="text-sm">
            <Link href={`/finanse/faktury/${it.id}`} className="text-blue-600 hover:underline">
              {it.label}
            </Link>
          </li>
        ))}
        {items.length > 8 && <li className="text-xs text-gray-400">…i {items.length - 8} więcej</li>}
      </ul>
    </div>
  )
}
