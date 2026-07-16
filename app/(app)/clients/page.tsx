import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ClientFilters } from '@/components/clients/ClientFilters'
import { ClientsTable } from '@/components/clients/ClientsTable'

async function getClients(status?: string, search?: string) {
  return prisma.client.findMany({
    where: {
      AND: [
        search ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        } : {},
        status ? { status } : {},
      ],
    },
    include: {
      clientUnits: { include: { unit: true } },
      // Lokale z aktywnych umów (ContractUnit) — żeby kolumna „Lokale" nie pustoszała
      // gdy miękka rezerwacja (ClientUnit) wygaśnie, a lokal jest pod podpisaną umową.
      contracts: {
        where: { status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] } },
        select: { contractUnits: { select: { unit: { select: { number: true } } } } },
      },
      _count: { select: { activities: true, serviceRequests: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { status?: string; search?: string }
}) {
  const clients = await getClients(searchParams.status, searchParams.search)

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Klienci</h1>
          <p className="text-gray-500 text-sm mt-1">{clients.length} klientów</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link
            href="/clients/import"
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Importuj z Excela
          </Link>
          <Link
            href="/clients/new"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Dodaj klienta
          </Link>
        </div>
      </div>

      <ClientFilters />

      <ClientsTable
        rows={clients.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          source: c.source,
          phone: c.phone,
          email: c.email,
          status: c.status,
          unitNumbers: Array.from(new Set([
            ...c.clientUnits.map((cu) => cu.unit.number),
            ...c.contracts.flatMap((ct) => ct.contractUnits.map((cu) => cu.unit.number)),
          ])),
          activitiesCount: c._count.activities,
          updatedAt: c.updatedAt.toISOString(),
        }))}
      />
    </div>
  )
}
