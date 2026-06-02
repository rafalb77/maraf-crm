import { prisma } from '@/lib/prisma'
import { NewInvoiceForm } from '@/components/finanse/NewInvoiceForm'
import { getActiveCompany } from '@/lib/finanse-company'
import { COMPANY_LABELS } from '@/lib/types'

export default async function NowaFakturaPage() {
  const company = getActiveCompany()
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    select: { id: true, name: true, category: true, defaultDepositPct: true, defaultBuildingCostsPct: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nowa faktura zakupowa</h1>
        <p className="text-gray-500 text-sm mt-1">
          Firma: <strong>{COMPANY_LABELS[company]}</strong> • status po zapisie: <strong>Zatwierdzona</strong>.
        </p>
      </div>

      <NewInvoiceForm vendors={vendors} company={company} />
    </div>
  )
}
