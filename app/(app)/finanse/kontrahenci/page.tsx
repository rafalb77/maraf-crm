import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtMoney } from '@/lib/finanse-format'
import { VENDOR_CATEGORY_LABELS, type VendorCategory } from '@/lib/types'
import { getActiveCompany } from '@/lib/finanse-company'
import { VendorTermsCell } from '@/components/finanse/VendorTermsCell'

export default async function KontrahenciPage() {
  const company = getActiveCompany()
  // Kontrahenci aktywnej firmy = ci, ktorzy maja przynajmniej 1 fakture tej firmy.
  // Liczniki/sumy liczone tylko z faktur aktywnej firmy.
  const allVendors = await prisma.vendor.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      _count: { select: { invoices: { where: { company } } } },
      invoices: {
        where: { company, status: { notIn: ['OPLACONA', 'ANULOWANA'] } },
        select: { amountGross: true, payments: { select: { amount: true } } },
      },
      terms: {
        select: { investment: true, depositPct: true, depositReturnMonths: true, buildingCostsPct: true, calcBasis: true, notes: true },
        orderBy: { investment: 'asc' },
      },
    },
  })
  const vendors = allVendors.filter((v) => v._count.invoices > 0)

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kontrahenci</h1>
        <p className="text-gray-500 text-sm mt-1">{vendors.length} kontrahentów</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-700">Nazwa</th>
              <th className="px-4 py-3 font-medium text-gray-700">Kategoria</th>
              <th className="px-4 py-3 font-medium text-gray-700">NIP</th>
              <th className="px-4 py-3 font-medium text-gray-700" title="Warunki z umowy: % kaucji gwarancyjnej, po ilu miesiącach zwrot, % kosztów budowy. Prefilują fakturę i naliczają się z KSeF. Można ustawić osobno per budowa.">
                Warunki umowne (kaucja / zwrot / KB)
              </th>
              <th className="px-4 py-3 font-medium text-gray-700 text-right">Faktur</th>
              <th className="px-4 py-3 font-medium text-gray-700 text-right">Do zapłaty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vendors.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  Brak kontrahentów. Dodaj pierwszego importując xlsx z{' '}
                  <Link href="/finanse/import" className="text-blue-600 hover:underline">tej strony</Link>.
                </td>
              </tr>
            )}
            {vendors.map((v) => {
              const unpaid = v.invoices.reduce((s, i) => {
                const paid = i.payments.reduce((p, x) => p + x.amount, 0)
                return s + Math.max(0, i.amountGross - paid)
              }, 0)
              return (
                <tr key={v.id} className={!v.isActive ? 'opacity-50' : ''}>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/finanse/kontrahenci/${v.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                      title="Karta kontrahenta — warunki umowne i statystyki"
                    >
                      {v.name}
                    </Link>
                    {!v.isActive && <span className="ml-2 text-xs text-gray-400">(nieaktywny)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {VENDOR_CATEGORY_LABELS[v.category as VendorCategory] || v.category}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{v.nip || '—'}</td>
                  <td className="px-4 py-2.5">
                    <VendorTermsCell
                      vendorId={v.id}
                      terms={v.terms}
                      legacyDepositPct={v.defaultDepositPct}
                      legacyKbPct={v.defaultBuildingCostsPct}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                    <Link href={`/finanse/faktury?vendor=${v.id}`} className="hover:text-blue-600" title="Faktury kontrahenta">
                      {v._count.invoices}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">
                    {unpaid > 0.01 ? fmtMoney(unpaid) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Dodawanie/edycja kontrahentów ręczna — w przyszłości (Faza 2).
        Obecnie kontrahenci pojawiają się automatycznie przy imporcie xlsx.
      </p>
    </div>
  )
}
