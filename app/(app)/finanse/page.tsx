import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import { getActiveCompany } from '@/lib/finanse-company'
import { getTopSpendByContractor, getPaymentPunctuality, getUpcomingPayments, getInvoicePipeline, getDpo } from '@/lib/finanse-stats'
import { TopSpendChart } from '@/components/finanse/stats/TopSpendChart'
import { PaymentPunctualityChart } from '@/components/finanse/stats/PaymentPunctualityChart'
import { UpcomingTimeline } from '@/components/finanse/stats/UpcomingTimeline'
import { InvoicePipeline } from '@/components/finanse/stats/InvoicePipeline'
import { DpoCard } from '@/components/finanse/stats/DpoCard'

export default async function FinanseHomePage() {
  const company = getActiveCompany()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in7 = new Date(today.getTime() + 7 * 86400000)
  const in30 = new Date(today.getTime() + 30 * 86400000)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [
    overdueCount,
    overdueSum,
    due7Count,
    due7Sum,
    due30Count,
    due30Sum,
    paidThisMonthSum,
    unpaidInvoicesRaw,
  ] = await Promise.all([
    prisma.purchaseInvoice.count({
      where: {
        company,
        status: { in: ['POBRANA', 'ZATWIERDZONA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
        dueDate: { lt: today },
      },
    }),
    prisma.purchaseInvoice.aggregate({
      where: {
        company,
        status: { in: ['POBRANA', 'ZATWIERDZONA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
        dueDate: { lt: today },
      },
      _sum: { amountGross: true },
    }),
    prisma.purchaseInvoice.count({
      where: {
        company,
        status: { in: ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
        dueDate: { gte: today, lte: in7 },
      },
    }),
    prisma.purchaseInvoice.aggregate({
      where: {
        company,
        status: { in: ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
        dueDate: { gte: today, lte: in7 },
      },
      _sum: { amountGross: true },
    }),
    prisma.purchaseInvoice.count({
      where: {
        company,
        status: { in: ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
        dueDate: { gte: today, lte: in30 },
      },
    }),
    prisma.purchaseInvoice.aggregate({
      where: {
        company,
        status: { in: ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
        dueDate: { gte: today, lte: in30 },
      },
      _sum: { amountGross: true },
    }),
    prisma.purchaseInvoicePayment.aggregate({
      where: { paidAt: { gte: monthStart }, invoice: { company } },
      _sum: { amount: true },
    }),
    // Niezaplacone FV do TOP 10 — pobieramy pojedynczo (nie groupBy po vendorId),
    // bo grupujemy po FAKTYCZNYM wykonawcy: subVendor gdy jest (import z Excela
    // trzymal parasole typu STAFFA jako vendora, a wykonawce w subVendor —
    // STAFFA to grupa kosztowa, nie kontrahent), inaczej nazwa vendora.
    prisma.purchaseInvoice.findMany({
      where: { company, status: { notIn: ['OPLACONA', 'ANULOWANA'] } },
      select: {
        amountGross: true,
        subVendor: true,
        vendor: { select: { name: true } },
      },
    }),
  ])

  // Kaucje gwarancyjne — zatrzymane (niezwrocone) + widzety analityczne
  const [depositActive, depositSoon, topSpend, punctuality, timeline, pipeline, dpo] = await Promise.all([
    prisma.purchaseInvoice.aggregate({
      where: { company, deposit: { gt: 0 }, depositReturnedAt: null },
      _sum: { deposit: true },
      _count: true,
    }),
    prisma.purchaseInvoice.count({
      where: { company, deposit: { gt: 0 }, depositReturnedAt: null, depositReturnDate: { lte: in30 } },
    }),
    getTopSpendByContractor(company),
    getPaymentPunctuality(company),
    getUpcomingPayments(company),
    getInvoicePipeline(company),
    getDpo(company),
  ])

  // Grupowanie po faktycznym wykonawcy: subVendor || nazwa vendora.
  // Link: po vendorze gdy grupa to "czysty" vendor, inaczej wyszukiwanie q=
  // (lista faktur szuka q w subVendor).
  const groups = new Map<string, { name: string; sum: number }>()
  for (const inv of unpaidInvoicesRaw) {
    const name = inv.subVendor?.trim() || inv.vendor.name
    const g = groups.get(name) || { name, sum: 0 }
    g.sum += inv.amountGross
    groups.set(name, g)
  }
  // Link zawsze przez q= — wyszukiwarka listy matchuje nazwe vendora ORAZ
  // subVendor, wiec zbiera tez faktury pod parasolem (STAFFA) z ta etykieta.
  const topVendors = [...groups.values()]
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 10)
    .map((g) => ({
      name: g.name,
      sum: g.sum,
      href: `/finanse/faktury?q=${encodeURIComponent(g.name)}`,
    }))

  const maxVendorSum = topVendors[0]?.sum || 1

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finanse</h1>
        <p className="text-gray-500 text-sm mt-1">
          Faktury kosztowe, przychodowe, płatności
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiTile
          href="/finanse/faktury?overdue=1"
          title="Zaległe"
          count={overdueCount}
          sum={overdueSum._sum.amountGross || 0}
          accent="red"
        />
        <KpiTile
          href="/finanse/kolejka-platnosci"
          title="Do zapłaty w 7 dni"
          count={due7Count}
          sum={due7Sum._sum.amountGross || 0}
          accent="blue"
          extra={`+ ${due30Count - due7Count} szt. w 8-30 dni (${fmtMoneyShort((due30Sum._sum.amountGross || 0) - (due7Sum._sum.amountGross || 0))})`}
        />
        <KpiTile
          href="/finanse/faktury?status=OPLACONA"
          title="Zapłacone w tym mc"
          count={null}
          sum={paidThisMonthSum._sum.amount || 0}
          accent="green"
        />
      </div>

      {(depositActive._count > 0) && (
        <Link
          href="/finanse/kaucje"
          className="block bg-white rounded-xl border border-gray-200 hover:border-gray-300 p-5 mb-6 transition-colors"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Kaucje gwarancyjne (zatrzymane)</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtMoney(depositActive._sum.deposit || 0)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {depositActive._count} {depositActive._count === 1 ? 'kaucja' : 'kaucji'}
                {depositSoon > 0 && <span className="text-amber-600"> • {depositSoon} z terminem zwrotu ≤ 30 dni</span>}
              </p>
            </div>
            <span className="text-gray-400 text-sm">Zobacz kaucje →</span>
          </div>
        </Link>
      )}

      {/* Os czasu nadchodzacych platnosci — zalegle + 6 tygodni */}
      <div className="mb-6">
        <UpcomingTimeline buckets={timeline} />
      </div>

      {/* Analityka: najwieksze wydatki + terminowosc platnosci */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start mb-6">
        <TopSpendChart data={topSpend} />
        {punctuality.rows.length > 0 && <PaymentPunctualityChart data={punctuality} />}
      </div>

      {/* Zatory w obiegu + cykl platnosci DPO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start mb-6">
        <InvoicePipeline data={pipeline} />
        <DpoCard data={dpo} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {topVendors.length > 0 && (
          <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Niezapłacone wg kontrahenta (TOP 10)</h2>
            <div className="space-y-3.5">
              {topVendors.map((tv) => (
                <div key={tv.name}>
                  <div className="flex items-baseline justify-between mb-1">
                    <Link
                      href={tv.href}
                      className="text-sm font-medium text-gray-900 hover:text-amber-600"
                    >
                      {tv.name}
                    </Link>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">
                      {fmtMoney(tv.sum)}
                    </span>
                  </div>
                  <div className="bg-gray-100 rounded-full overflow-hidden h-1.5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(tv.sum / maxVendorSum) * 100}%`,
                        background: 'var(--accent)',
                        transition: 'width .6s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={`${topVendors.length > 0 ? 'lg:col-span-2' : 'lg:col-span-5'} bg-white rounded-xl border border-gray-200 p-6`}>
          <h2 className="font-semibold text-gray-900 mb-2">Workflow</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Faktura kosztowa pojawia się w aplikacji na 2 sposoby:
            {' '}<strong>Marta wpisuje ręcznie</strong> lub
            {' '}<strong>pobierana automatycznie z KSeF</strong>.
            {' '}Wpada od razu jako <strong>Zatwierdzona</strong> (czeka na przelew) →
            {' '}<strong>Opłacona / Częściowo opłacona</strong> po dodaniu wpłat.
          </p>
        </div>
      </div>
    </div>
  )
}

function KpiTile({
  href,
  title,
  count,
  sum,
  accent,
  extra,
}: {
  href: string
  title: string
  count: number | null
  sum: number
  accent: 'amber' | 'red' | 'blue' | 'green'
  extra?: string
}) {
  const accentClass = {
    amber: 'border-amber-200 hover:border-amber-300 hover:bg-amber-50',
    red: 'border-red-200 hover:border-red-300 hover:bg-red-50',
    blue: 'border-blue-200 hover:border-blue-300 hover:bg-blue-50',
    green: 'border-green-200 hover:border-green-300 hover:bg-green-50',
  }[accent]
  const numColor = {
    amber: 'text-amber-700',
    red: 'text-red-700',
    blue: 'text-blue-700',
    green: 'text-green-700',
  }[accent]
  return (
    <Link
      href={href}
      className={`block bg-white rounded-xl border p-5 transition-all ${accentClass}`}
    >
      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">{title}</p>
      <p className={`text-2xl font-bold tabular-nums ${numColor}`}>
        {fmtMoney(sum)}
      </p>
      {count !== null && (
        <p className="text-xs text-gray-500 mt-1">{count} {count === 1 ? 'faktura' : 'faktur'}</p>
      )}
      {extra && <p className="text-xs text-gray-400 mt-2">{extra}</p>}
    </Link>
  )
}
