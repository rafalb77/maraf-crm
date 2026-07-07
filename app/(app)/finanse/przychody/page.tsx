import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  SALES_INVOICE_STATUS_LABELS,
  SALES_INVOICE_STATUS_COLORS,
  COMPANY_SHORT,
  type SalesInvoiceStatus,
  type Company,
} from '@/lib/types'
import { fmtDate, fmtMoney, isOverdue } from '@/lib/finanse-format'
import { getActiveCompany } from '@/lib/finanse-company'
import { QuickPaymentCell } from '@/components/finanse/QuickPaymentCell'

type SearchParams = { status?: string; q?: string; year?: string }

export default async function PrzychodyPage({ searchParams }: { searchParams: SearchParams }) {
  const company = getActiveCompany()
  const filters: any[] = [{ company }]
  if (searchParams.status) filters.push({ status: searchParams.status })
  if (searchParams.q) {
    filters.push({ OR: [
      { number: { contains: searchParams.q, mode: 'insensitive' } },
      { recipientName: { contains: searchParams.q, mode: 'insensitive' } },
    ]})
  }
  if (searchParams.year) {
    const y = parseInt(searchParams.year, 10)
    if (y) filters.push({ issueDate: { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) } })
  }
  const where = filters.length ? { AND: filters } : {}

  const [invoices, sums] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      include: { payments: { select: { amount: true } } },
      take: 300,
    }),
    prisma.salesInvoice.aggregate({ where, _sum: { amountNet: true, amountVat: true, amountGross: true } }),
  ])

  const hasFilters = !!(searchParams.status || searchParams.q || searchParams.year)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faktury przychodowe</h1>
          <p className="text-gray-500 text-sm mt-1">{invoices.length} faktur{hasFilters ? ' (po filtrach)' : ''}</p>
        </div>
        <Link href="/finanse/przychody/nowa" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Nowa faktura przychodowa
        </Link>
      </div>

      <form method="get" className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input name="q" defaultValue={searchParams.q || ''} placeholder="Nr FV lub odbiorca..." className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <select name="status" defaultValue={searchParams.status || ''} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Wszystkie statusy</option>
          {Object.entries(SALES_INVOICE_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <div className="flex gap-2 justify-end">
          {hasFilters && <Link href="/finanse/przychody" className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Wyczyść</Link>}
          <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium">Filtruj</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-left">
              <tr>
                <th className="px-3 py-3 font-medium text-gray-700">Odbiorca</th>
                <th className="px-3 py-3 font-medium text-gray-700">Nr FV</th>
                <th className="px-3 py-3 font-medium text-gray-700">Wyst.</th>
                <th className="px-3 py-3 font-medium text-gray-700">Termin</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right">Netto</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right">VAT</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right">Brutto</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right">Wpłacono</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right">Pozostało</th>
                <th className="px-3 py-3 font-medium text-gray-700">Status</th>
                <th className="px-3 py-3 font-medium text-gray-700">Wpłata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Brak faktur przychodowych.</td></tr>
              )}
              {invoices.map((inv) => {
                const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
                const payable = inv.amountGross - (inv.deposit || 0) - (inv.buildingCosts || 0)
                const left = payable - paid
                const overdue = isOverdue(inv.dueDate, inv.status === 'OPLACONA' ? 'OPLACONA' : 'WYSTAWIONA')
                return (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900 flex items-center gap-1.5">
                        {inv.recipientName}
                        {inv.recipientCompany && <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded">{COMPANY_SHORT[inv.recipientCompany as Company] || inv.recipientCompany}</span>}
                        {inv.isAdvance && <span className="text-[10px] bg-orange-100 text-orange-700 px-1 rounded">zaliczka</span>}
                      </div>
                      <div className="text-xs text-gray-400">{COMPANY_SHORT[inv.company as Company] || inv.company}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/finanse/przychody/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
                    </td>
                    <td className="px-3 py-2 text-gray-600 tabular-nums whitespace-nowrap">{fmtDate(inv.issueDate)}</td>
                    <td className={`px-3 py-2 tabular-nums whitespace-nowrap ${overdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{fmtDate(inv.dueDate)}{overdue && ' ⚠'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtMoney(inv.amountNet)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtMoney(inv.amountVat)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{fmtMoney(inv.amountGross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{paid > 0 ? fmtMoney(paid) : '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${left > 0.01 ? 'text-red-600' : 'text-gray-400'}`}>{left > 0.01 ? fmtMoney(left) : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SALES_INVOICE_STATUS_COLORS[inv.status as SalesInvoiceStatus] || 'bg-gray-100 text-gray-700'}`}>
                        {SALES_INVOICE_STATUS_LABELS[inv.status as SalesInvoiceStatus] || inv.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <QuickPaymentCell
                        invoiceId={inv.id}
                        remaining={Math.round(left * 100) / 100}
                        status={inv.status}
                        kind="sales"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {invoices.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-semibold text-gray-900">
                <tr>
                  <td colSpan={4} className="px-3 py-3">Razem ({invoices.length})</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(sums._sum.amountNet || 0)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(sums._sum.amountVat || 0)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(sums._sum.amountGross || 0)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
