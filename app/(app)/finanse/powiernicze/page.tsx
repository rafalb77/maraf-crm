import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'
import { PowiernniczeView } from '@/components/finanse/powiernicze/PowiernniczeView'

export default async function PowiernniczePage() {
  const company = getActiveCompany()

  if (company !== 'MARAF_DEVELOPMENT') {
    return (
      <div className="p-8 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Rozliczenia powiernicze</h1>
          <p className="text-gray-500 text-sm mt-1">Kontrola wpłat nabywców z rachunków powierniczych</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">🏦</div>
          <h2 className="font-semibold text-gray-900 mb-2">Tylko dla Maraf Development</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Rozliczenia z rachunków powierniczych (OMRP/ZMRP) dotyczą spółki deweloperskiej.
            Przełącz firmę w nagłówku na <strong>Maraf Development</strong>.
          </p>
        </div>
      </div>
    )
  }

  const accounts = await prisma.escrowAccount.findMany({
    where: { company, status: 'AKTYWNY' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, accountNumber: true },
  })

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rozliczenia powiernicze</h1>
        <p className="text-gray-500 text-sm mt-1">
          Kontrola wpłat nabywców z harmonogramu umowy deweloperskiej wobec wyciągu z ING Banku Śląskiego.
          Import MT940 / CSV / camt.053, automatyczne dopasowanie, rejestr wpłat i odsetek.
        </p>
      </div>
      <PowiernniczeView accounts={accounts} />
    </div>
  )
}
