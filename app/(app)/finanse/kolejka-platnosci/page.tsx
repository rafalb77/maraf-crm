import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtDate, fmtMoney, isOverdue } from '@/lib/finanse-format'

const RANGE_DAYS = 30

export default async function KolejkaPlatnosciPage() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today.getTime() + RANGE_DAYS * 86400000)

  // Faktury "do zapłaty": zatwierdzone, czesciowo, zaplanowane.
  // Wyswietlamy te przeterminowane + te z terminem w nastepnych RANGE_DAYS dni.
  // Plus wprowadzone z terminem (jako kandydaty do akceptacji najpierw).
  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      status: { in: ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
      OR: [
        { dueDate: { lte: horizon } },
        { dueDate: null },
      ],
    },
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
    include: {
      vendor: { select: { name: true } },
      payments: { select: { amount: true } },
    },
  })

  // Grupowanie po datach: overdue / today / +1-7 / +8-30
  const overdue: typeof invoices = []
  const todayDue: typeof invoices = []
  const next7: typeof invoices = []
  const next30: typeof invoices = []
  const noDue: typeof invoices = []

  for (const inv of invoices) {
    if (!inv.dueDate) { noDue.push(inv); continue }
    const dd = new Date(inv.dueDate)
    dd.setHours(0, 0, 0, 0)
    if (dd < today) overdue.push(inv)
    else if (dd.getTime() === today.getTime()) todayDue.push(inv)
    else if (dd.getTime() <= today.getTime() + 7 * 86400000) next7.push(inv)
    else next30.push(inv)
  }

  const groupSum = (arr: typeof invoices) =>
    arr.reduce((s, i) => s + (i.amountGross - i.payments.reduce((p, x) => p + x.amount, 0)), 0)

  const totalRemaining = groupSum(invoices)

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kolejka płatności</h1>
          <p className="text-gray-500 text-sm mt-1">
            Faktury zatwierdzone do zapłaty w ciągu {RANGE_DAYS} dni — łącznie do zapłaty <strong className="text-gray-900">{fmtMoney(totalRemaining)}</strong>
          </p>
        </div>
      </div>

      <PaymentGroup title="Zaległe" subtitle="po terminie" invoices={overdue} accent="red" sum={groupSum(overdue)} />
      <PaymentGroup title="Dzisiaj" subtitle="termin dziś" invoices={todayDue} accent="amber" sum={groupSum(todayDue)} />
      <PaymentGroup title="W tym tygodniu" subtitle="1-7 dni" invoices={next7} accent="blue" sum={groupSum(next7)} />
      <PaymentGroup title="W tym miesiącu" subtitle="8-30 dni" invoices={next30} accent="gray" sum={groupSum(next30)} />
      {noDue.length > 0 && (
        <PaymentGroup title="Bez terminu" subtitle="brak terminu w fakturze" invoices={noDue} accent="gray" sum={groupSum(noDue)} />
      )}
    </div>
  )
}

function PaymentGroup({
  title,
  subtitle,
  invoices,
  accent,
  sum,
}: {
  title: string
  subtitle: string
  invoices: any[]
  accent: 'red' | 'amber' | 'blue' | 'gray'
  sum: number
}) {
  if (invoices.length === 0) return null

  const headerBg = {
    red: 'bg-red-50 border-red-200 text-red-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    gray: 'bg-gray-50 border-gray-200 text-gray-900',
  }[accent]

  return (
    <div className="mb-6">
      <div className={`rounded-t-xl border border-b-0 p-3 flex items-baseline justify-between ${headerBg}`}>
        <div>
          <span className="font-semibold">{title}</span>
          <span className="text-sm opacity-75 ml-2">— {subtitle}</span>
          <span className="text-sm opacity-75 ml-2">({invoices.length})</span>
        </div>
        <span className="font-semibold tabular-nums">{fmtMoney(sum)}</span>
      </div>
      <div className="bg-white border border-gray-200 rounded-b-xl overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {invoices.map((inv) => {
              const sumPaid = inv.payments.reduce((s: number, p: any) => s + p.amount, 0)
              const remaining = inv.amountGross - sumPaid
              const overdue = isOverdue(inv.dueDate, inv.status)
              return (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{inv.vendor.name}</div>
                    {inv.subVendor && <div className="text-xs text-gray-500">{inv.subVendor}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">
                      {inv.number}
                    </Link>
                  </td>
                  <td className={`px-4 py-2.5 tabular-nums text-sm ${overdue ? 'text-red-700 font-medium' : 'text-gray-700'}`}>
                    {fmtDate(inv.dueDate)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {sumPaid > 0 && (
                      <div className="text-xs text-gray-400">zapł. {fmtMoney(sumPaid)}</div>
                    )}
                    <div className="font-semibold text-gray-900">{fmtMoney(remaining)}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/finanse/faktury/${inv.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Oznacz jako opłacone →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
