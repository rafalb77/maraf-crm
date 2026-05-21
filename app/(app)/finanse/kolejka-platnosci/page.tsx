import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtDate, fmtMoney, isOverdue } from '@/lib/finanse-format'
import { COMPANY_LABELS, type Company } from '@/lib/types'

const RANGE_DAYS = 30

export default async function KolejkaPlatnosciPage({
  searchParams,
}: {
  searchParams: { company?: string }
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today.getTime() + RANGE_DAYS * 86400000)

  const companyFilter = searchParams.company
    ? { company: searchParams.company }
    : {}

  // Faktury "do zaplaty": zatwierdzone/czesciowo/zaplanowane, termin <= horyzont lub brak terminu.
  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      status: { in: ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
      OR: [{ dueDate: { lte: horizon } }, { dueDate: null }],
      ...companyFilter,
    },
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
    include: {
      vendor: { select: { id: true, name: true } },
      payments: { select: { amount: true } },
    },
  })

  // Grupowanie po kontrahencie
  type Row = (typeof invoices)[number]
  const groups = new Map<string, { vendorName: string; vendorId: string; rows: Row[] }>()
  for (const inv of invoices) {
    const key = inv.vendor.id
    if (!groups.has(key)) groups.set(key, { vendorName: inv.vendor.name, vendorId: key, rows: [] })
    groups.get(key)!.rows.push(inv)
  }

  const remaining = (inv: Row) => inv.amountGross - inv.payments.reduce((s, p) => s + p.amount, 0)

  // Sortuj grupy malejaco po sumie do zaplaty
  const sortedGroups = Array.from(groups.values())
    .map((g) => ({ ...g, sum: g.rows.reduce((s, r) => s + remaining(r), 0) }))
    .sort((a, b) => b.sum - a.sum)

  const totalRemaining = sortedGroups.reduce((s, g) => s + g.sum, 0)
  const overdueCount = invoices.filter((i) => isOverdue(i.dueDate, i.status)).length

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6 flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kolejka płatności</h1>
          <p className="text-gray-500 text-sm mt-1">
            Zatwierdzone do zapłaty (najbliższe {RANGE_DAYS} dni) — łącznie <strong className="text-gray-900">{fmtMoney(totalRemaining)}</strong>
            {overdueCount > 0 && <span className="text-red-600"> • {overdueCount} po terminie</span>}
          </p>
        </div>
        {/* Filtr firmy */}
        <div className="flex gap-1 text-sm">
          <CompanyTab label="Obie firmy" href="/finanse/kolejka-platnosci" active={!searchParams.company} />
          {(Object.keys(COMPANY_LABELS) as Company[]).map((c) => (
            <CompanyTab key={c} label={COMPANY_LABELS[c]} href={`/finanse/kolejka-platnosci?company=${c}`} active={searchParams.company === c} />
          ))}
        </div>
      </div>

      {sortedGroups.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          Brak faktur do zapłaty w najbliższych {RANGE_DAYS} dniach.
        </div>
      )}

      <div className="space-y-5">
        {sortedGroups.map((g) => (
          <div key={g.vendorId}>
            <div className="flex items-baseline justify-between bg-gray-100 border border-gray-200 rounded-t-xl px-4 py-2.5">
              <Link href={`/finanse/faktury?vendor=${g.vendorId}`} className="font-semibold text-gray-900 hover:text-blue-600">
                {g.vendorName} <span className="text-gray-400 font-normal text-sm">({g.rows.length})</span>
              </Link>
              <span className="font-semibold text-gray-900 tabular-nums">{fmtMoney(g.sum)}</span>
            </div>
            <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {g.rows.map((inv) => {
                    const rem = remaining(inv)
                    const sumPaid = inv.amountGross - rem
                    const overdue = isOverdue(inv.dueDate, inv.status)
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
                          {inv.subVendor && <span className="text-xs text-gray-500 ml-2">{inv.subVendor}</span>}
                        </td>
                        <td className={`px-4 py-2.5 tabular-nums text-sm whitespace-nowrap ${overdue ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
                          termin: {fmtDate(inv.dueDate)}{overdue && ' ⚠'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {sumPaid > 0.01 && <div className="text-xs text-gray-400">zapł. {fmtMoney(sumPaid)}</div>}
                          <div className="font-semibold text-gray-900">{fmtMoney(rem)}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link href={`/finanse/faktury/${inv.id}`} className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap">
                            Oznacz opłacone →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CompanyTab({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg border ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
    >
      {label}
    </Link>
  )
}
