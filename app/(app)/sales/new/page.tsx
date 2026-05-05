import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ContractForm } from '@/components/sales/ContractForm'
import { expireSoftReservations } from '@/lib/reservations'

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: { clientId?: string }
}) {
  await expireSoftReservations()

  const [clients, units] = await Promise.all([
    prisma.client.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.unit.findMany({
      where: { status: { not: 'SPRZEDANY' }, reservationType: { not: 'REZERWACJA' } },
      orderBy: { number: 'asc' },
    }),
  ])

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
        <Link href="/sales" className="hover:text-blue-600">
          Sprzedaż
        </Link>
        <span>/</span>
        <span>Nowa umowa</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nowa umowa</h1>
      <ContractForm clients={clients} units={units} defaultClientId={searchParams.clientId} />
    </div>
  )
}
