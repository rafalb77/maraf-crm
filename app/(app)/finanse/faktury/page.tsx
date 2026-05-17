import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  PURCHASE_INVOICE_STATUS_LABELS,
  PURCHASE_INVOICE_STATUS_COLORS,
  type PurchaseInvoiceStatus,
} from '@/lib/types'
import { fmtDate, fmtMoney, isOverdue } from '@/lib/finanse-format'

type SearchParams = {
  vendor?: string
  status?: string
  q?: string
  overdue?: string
  from?: string
  to?: string
  page?: string
}

const PAGE_SIZE = 50

export default async function FakturyListPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const filters: any[] = []
  if (searchParams.vendor) filters.push({ vendorId: searchParams.vendor })
  if (searchParams.status) filters.push({ status: searchParams.status })
  if (searchParams.q) {
    filters.push({
      OR: [
        { number: { contains: searchParams.q, mode: 'insensitive' } },
        { subVendor: { contains: searchParams.q, mode: 'insensitive' } },
        { description: { contains: searchParams.q, mode: 'insensitive' } },
      ],
    })
  }
  if (searchParams.overdue === '1') {
    filters.push({
      dueDate: { lt: today },
      status: { in: ['ZATWIERDZONA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
    })
  }
  if (searchParams.from) filters.push({ issueDate: { gte: new Date(searchParams.from) } })
  if (searchParams.to) filters.push({ issueDate: { lte: new Date(searchParams.to) } })

  const where = filters.length ? { AND: filters } : {}
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1)
  const skip = (page - 1) * PAGE_SIZE

  const [invoices, total, vendors, statusCountsRaw] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { issueDate: 'desc' }],
      include: {
        vendor: { select: { name: true } },
        payments: { select: { amount: true } },
      },
      take: PAGE_SIZE,
      skip,
    }),
    prisma.purchaseInvoice.count({ where }),
    prisma.vendor.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.purchaseInvoice.groupBy({
      by: ['status'],
      _count: true,
    }),
  ])

  const statusCounts: Record<string, number> = {}
  for (const s of statusCountsRaw) statusCounts[s.status] = s._count

  const totalPages = Math.ceil(total / PAGE_SIZE)

  function qs(overrides: Partial<SearchParams>): string {
    const merged: Record<string, string | undefined> = { ...searchParams, ...overrides }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, String(v))
    }
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  const hasFilters = !!(searchParams.vendor || searchParams.status || searchParams.q || searchParams.overdue || searchParams.from || searchParams.to)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faktury zakupowe</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} {total === 1 ? 'faktura' : total < 5 ? 'faktury' : 'faktur'}
            {hasFilters && ' (po filtrach)'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/finanse/import"
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Import xlsx
          </Link>
          <Link
            href="/finanse/nowa"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Nowa faktura
          </Link>
        </div>
      </div>

      <form method="get" className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <input
          name="q"
          defaultValue={searchParams.q || ''}
          placeholder="Numer FV, podkontr., opis..."
          className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <select
          name="vendor"
          defaultValue={searchParams.vendor || ''}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Wszyscy kontrahenci</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={searchParams.status || ''}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Wszystkie statusy</option>
          {Object.entries(PURCHASE_INVOICE_STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label} ({statusCounts[k] || 0})
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={searchParams.from || ''}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          title="Data wystawienia od"
        />
        <input
          type="date"
          name="to"
          defaultValue={searchParams.to || ''}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          title="Data wystawienia do"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
          <input
            type="checkbox"
            name="overdue"
            value="1"
            defaultChecked={searchParams.overdue === '1'}
          />
          Tylko zaległe (po terminie i niezapłacone)
        </label>
        <div className="md:col-span-4 flex gap-2 justify-end">
          {hasFilters && (
            <Link href="/finanse/faktury" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
              Wyczyść filtry
            </Link>
          )}
          <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Zastosuj
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-700">Kontrahent</th>
                <th className="px-4 py-3 font-medium text-gray-700">Nr FV</th>
                <th className="px-4 py-3 font-medium text-gray-700">Data wyst.</th>
                <th className="px-4 py-3 font-medium text-gray-700">Termin</th>
                <th className="px-4 py-3 font-medium text-gray-700 text-right">Brutto</th>
                <th className="px-4 py-3 font-medium text-gray-700 text-right">Zapłacono</th>
                <th className="px-4 py-3 font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Brak faktur dla wybranych filtrów.
                  </td>
                </tr>
              )}
              {invoices.map((inv) => {
                const sumPaid = inv.payments.reduce((s, p) => s + p.amount, 0)
                const overdue = isOverdue(inv.dueDate, inv.status)
                return (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{inv.vendor.name}</div>
                      {inv.subVendor && (
                        <div className="text-xs text-gray-500">{inv.subVendor}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/finanse/faktury/${inv.id}`}
                        className="text-blue-600 hover:underline font-mono text-xs"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-700 tabular-nums">{fmtDate(inv.issueDate)}</td>
                    <td className={`px-4 py-2 tabular-nums ${overdue ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                      {fmtDate(inv.dueDate)}
                      {overdue && <span className="ml-1 text-xs">⚠</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{fmtMoney(inv.amountGross)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                      {sumPaid > 0 ? fmtMoney(sumPaid) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          PURCHASE_INVOICE_STATUS_COLORS[inv.status as PurchaseInvoiceStatus] ||
                          'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {PURCHASE_INVOICE_STATUS_LABELS[inv.status as PurchaseInvoiceStatus] || inv.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-gray-500">
            Strona {page} z {totalPages} • {total} faktur
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/finanse/faktury${qs({ page: String(page - 1) })}`}
                className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ← Poprzednia
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/finanse/faktury${qs({ page: String(page + 1) })}`}
                className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Następna →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
