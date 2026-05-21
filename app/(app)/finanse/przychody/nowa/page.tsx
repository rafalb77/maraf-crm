import { NewSalesInvoiceForm } from '@/components/finanse/NewSalesInvoiceForm'

export default function NowaPrzychodowaPage() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nowa faktura przychodowa</h1>
        <p className="text-gray-500 text-sm mt-1">Faktura wystawiona przez nas (Maraf / Maraf Development).</p>
      </div>
      <NewSalesInvoiceForm />
    </div>
  )
}
