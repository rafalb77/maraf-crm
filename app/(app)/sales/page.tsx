import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import {
  CONTRACT_TYPE_LABELS, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS,
  type ContractType, type ContractStatus,
} from '@/lib/types'

export default async function SalesPage({
  searchParams,
}: {
  searchParams: { status?: string; type?: string }
}) {
  const contracts = await prisma.contract.findMany({
    where: {
      AND: [
        searchParams.status ? { status: searchParams.status } : {},
        searchParams.type ? { type: searchParams.type } : {},
      ],
    },
    include: { client: true, contractUnits: { include: { unit: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sprzedaż</h1>
          <p className="text-gray-500 text-sm mt-1">{contracts.length} umów</p>
        </div>
        <Link
          href="/sales/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nowa umowa
        </Link>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        {[
          { href: '/sales', label: 'Wszystkie' },
          { href: '/sales?status=W_PRZYGOTOWANIU', label: 'W przygotowaniu' },
          { href: '/sales?status=PODPISANA', label: 'Podpisane' },
          { href: '/sales?status=ROZWIAZANA', label: 'Rozwiązane' },
          { href: '/sales?status=ANULOWANA', label: 'Anulowane' },
        ].map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            {i.label}
          </Link>
        ))}
        {[
          { href: '/sales?type=REZERWACYJNA', label: 'Rezerwacyjne' },
          { href: '/sales?type=DEWELOPERSKA', label: 'Deweloperskie' },
          { href: '/sales?type=PRZENIESIENIA', label: 'Przeniesienia' },
        ].map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="px-3 py-1.5 border border-blue-200 rounded-lg text-sm text-blue-600 hover:bg-blue-50"
          >
            {i.label}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Numer</th>
              <th className="text-left px-4 py-3 font-medium">Inwestycja</th>
              <th className="text-left px-4 py-3 font-medium">Typ</th>
              <th className="text-left px-4 py-3 font-medium">Klient</th>
              <th className="text-left px-4 py-3 font-medium">Data wprow.</th>
              <th className="text-left px-4 py-3 font-medium">Data podpisania</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contracts.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-400">
                  Brak umów
                </td>
              </tr>
            ) : (
              contracts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/sales/${c.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                      {c.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{c.investmentName}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {CONTRACT_TYPE_LABELS[c.type as ContractType]}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {c.client.firstName} {c.client.lastName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(c.introducedAt)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {c.signedAt ? formatDate(c.signedAt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${CONTRACT_STATUS_COLORS[c.status as ContractStatus]}`}
                    >
                      {CONTRACT_STATUS_LABELS[c.status as ContractStatus]}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
