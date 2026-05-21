import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtDate, fmtMoney } from '@/lib/finanse-format'
import { getActiveCompany } from '@/lib/finanse-company'
import { MarkDepositReturnedButton } from '@/components/finanse/MarkDepositReturnedButton'

export default async function KaucjePage() {
  const company = getActiveCompany()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Faktury z kaucja (deposit > 0)
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { company, deposit: { gt: 0 } },
    orderBy: [{ depositReturnedAt: 'asc' }, { depositReturnDate: 'asc' }],
    include: { vendor: { select: { name: true } } },
  })

  const active = invoices.filter((i) => !i.depositReturnedAt)
  const returned = invoices.filter((i) => i.depositReturnedAt)

  const activeSum = active.reduce((s, i) => s + (i.deposit || 0), 0)
  const overdue = active.filter((i) => i.depositReturnDate && new Date(i.depositReturnDate) < today)

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kaucje gwarancyjne</h1>
        <p className="text-gray-500 text-sm mt-1">
          {active.length} zatrzymanych na łączną kwotę <strong className="text-gray-900">{fmtMoney(activeSum)}</strong>
          {overdue.length > 0 && <span className="text-red-600"> • {overdue.length} po terminie zwrotu</span>}
        </p>
      </div>

      {active.length === 0 && returned.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          Brak kaucji. Kaucję dodajesz w szczegółach faktury (sekcja „Kaucja i potrącenia").
        </div>
      )}

      {active.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
            Zatrzymane (do zwrotu)
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2">Kontrahent</th>
                <th className="px-4 py-2">Nr FV</th>
                <th className="px-4 py-2 text-right">Kwota kaucji</th>
                <th className="px-4 py-2">Termin zwrotu</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {active.map((inv) => {
                const isOverdue = inv.depositReturnDate && new Date(inv.depositReturnDate) < today
                return (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{inv.subVendor || inv.vendor.name}</div>
                      {inv.subVendor && <div className="text-xs text-gray-400">{inv.vendor.name}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                      {fmtMoney(inv.deposit)}
                      {inv.depositPct ? <span className="text-xs text-gray-400 ml-1">({inv.depositPct}%)</span> : null}
                    </td>
                    <td className={`px-4 py-2.5 tabular-nums ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                      {fmtDate(inv.depositReturnDate)}{isOverdue && ' ⚠'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <MarkDepositReturnedButton invoiceId={inv.id} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {returned.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
            Zwrócone ({returned.length})
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {returned.map((inv) => (
                <tr key={inv.id} className="text-gray-500">
                  <td className="px-4 py-2.5">{inv.subVendor || inv.vendor.name}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(inv.deposit)}</td>
                  <td className="px-4 py-2.5 text-green-700 text-xs">✓ zwrócona {fmtDate(inv.depositReturnedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
