import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ContractForm } from '@/components/sales/ContractForm'
import { expireSoftReservations } from '@/lib/reservations'

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: { clientId?: string; role?: string }
}) {
  const isSecondary = searchParams.role === 'secondary'
  await expireSoftReservations()

  const [clients, units, clientUnits] = await Promise.all([
    prisma.client.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.unit.findMany({
      where: { status: { not: 'SPRZEDANY' }, reservationType: { not: 'REZERWACJA' } },
      orderBy: { number: 'asc' },
    }),
    prisma.clientUnit.findMany({ select: { clientId: true, unitId: true } }),
  ])

  // Mapa klient → jego zarezerwowane lokale (do auto-zaznaczenia w formularzu).
  const reservedByClient: Record<string, string[]> = {}
  for (const cu of clientUnits) {
    ;(reservedByClient[cu.clientId] ??= []).push(cu.unitId)
  }

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
      <ContractForm
        clients={clients}
        units={units}
        defaultClientId={isSecondary ? undefined : searchParams.clientId}
        defaultSecondaryClientId={isSecondary ? searchParams.clientId : undefined}
        reservedByClient={reservedByClient}
      />
    </div>
  )
}
