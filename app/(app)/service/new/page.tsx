import { prisma } from '@/lib/prisma'
import { ServiceForm } from '@/components/service/ServiceForm'
import Link from 'next/link'

export default async function NewServicePage({
  searchParams,
}: {
  searchParams: { clientId?: string }
}) {
  const [clients, units] = await Promise.all([
    prisma.client.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.unit.findMany({ orderBy: { number: 'asc' } }),
  ])

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/service" className="hover:text-blue-600">Serwis</Link>
          <span>/</span>
          <span>Nowe zgłoszenie</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Nowe zgłoszenie serwisowe</h1>
      </div>
      <ServiceForm clients={clients} units={units} defaultClientId={searchParams.clientId} />
    </div>
  )
}
