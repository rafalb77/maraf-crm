import { NewSalesInvoiceForm } from '@/components/finanse/NewSalesInvoiceForm'
import { getActiveCompany } from '@/lib/finanse-company'
import { COMPANY_LABELS } from '@/lib/types'

export default function NowaPrzychodowaPage() {
  const company = getActiveCompany()
  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nowa faktura przychodowa</h1>
        <p className="text-gray-500 text-sm mt-1">Wystawia: <strong>{COMPANY_LABELS[company]}</strong></p>
      </div>
      <NewSalesInvoiceForm company={company} />
    </div>
  )
}
