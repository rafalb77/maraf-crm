import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import { getActiveCompany } from '@/lib/finanse-company'

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
    topVendorsRaw,
  ] = await Promise.all([
    prisma.purchaseInvoice.count({
      where: {
        company,
        status: { in: ['ZATWIERDZONA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
        dueDate: { lt: today },
      },
    }),
    prisma.purchaseInvoice.aggregate({
      where: {
        company,
        status: { in: ['ZATWIERDZONA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
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
    prisma.purchaseInvoice.groupBy({
      by: ['vendorId'],
      where: { company, status: { notIn: ['OPLACONA', 'ANULOWANA'] } },
      _sum: { amountGross: true },
      orderBy: { _sum: { amountGross: 'desc' } },
      take: 10,
    }),
  ])

  // Kaucje gwarancyjne — zatrzymane (niezwrocone)
  const [depositActive, depositSoon] = await Promise.all([
    prisma.purchaseInvoice.aggregate({
      where: { company, deposit: { gt: 0 }, depositReturnedAt: null },
      _sum: { deposit: true },
      _count: true,
    }),
    prisma.purchaseInvoice.count({
      where: { company, deposit: { gt: 0 }, depositReturnedAt: null, depositReturnDate: { lte: in30 } },
    }),
  ])

  // Resolve vendor names for top vendors
  const vendorIds = topVendorsRaw.map((v) => v.vendorId)
  const vendors = vendorIds.length
    ? await prisma.vendor.findMany({
        where: { id: { in: vendorIds } },
        select: { id: true, name: true, category: true },
      })
    : []
  const vendorMap = new Map(vendors.map((v) => [v.id, v]))
  const topVendors = topVendorsRaw
    .map((tv) => ({
      vendor: vendorMap.get(tv.vendorId),
      sum: tv._sum.amountGross || 0,
    }))
    .filter((tv) => tv.vendor)

  const maxVendorSum = topVendors[0]?.sum || 1

  return (
    <div className="p-8">
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
          <div className="flex items-center justify-between">
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

      {topVendors.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Niezapłacone wg kontrahenta (TOP 10)</h2>
          <div className="space-y-2">
            {topVendors.map((tv) => (
              <div key={tv.vendor!.id}>
                <div className="flex items-baseline justify-between mb-1">
                  <Link
                    href={`/finanse/faktury?vendor=${tv.vendor!.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-amber-600"
                  >
                    {tv.vendor!.name}
                  </Link>
                  <span className="text-sm font-medium text-gray-900 tabular-nums">
                    {fmtMoney(tv.sum)}
                  </span>
                </div>
                <div className="bg-gray-100 rounded-full overflow-hidden h-1.5">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${(tv.sum / maxVendorSum) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-2">Workflow</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Każda faktura przechodzi przez: <strong>Wprowadzona</strong> (Marta wpisuje) →
          {' '}<strong>Do zatwierdzenia</strong> (inbox Bohdana) →
          {' '}<strong>Zatwierdzona</strong> (czeka na przelew) →
          {' '}<strong>Opłacona / Częściowo opłacona</strong>.
        </p>
        <p className="text-xs text-gray-400 mt-3">
          Pełen plan: <code className="text-gray-500">docs/finanse-rozpoczecie.md</code>.
        </p>
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
