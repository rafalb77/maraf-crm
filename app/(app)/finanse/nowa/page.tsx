import { prisma } from '@/lib/prisma'
import { NewInvoiceForm } from '@/components/finanse/NewInvoiceForm'

export default async function NowaFakturaPage() {
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    select: { id: true, name: true, category: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nowa faktura zakupowa</h1>
        <p className="text-gray-500 text-sm mt-1">
          Po zapisaniu faktura ma status <strong>Wprowadzona</strong>. Wyślij ją do akceptacji w widoku szczegółów.
        </p>
      </div>

      <NewInvoiceForm vendors={vendors} />
    </div>
  )
}
