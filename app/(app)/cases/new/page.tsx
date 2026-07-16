import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { CaseForm } from '@/components/cases/CaseForm'

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: { clientId?: string }
}) {
  const [clients, units, users] = await Promise.all([
    prisma.client.findMany({
      orderBy: { lastName: 'asc' },
      select: { id: true, firstName: true, lastName: true, phone: true },
    }),
    prisma.unit.findMany({ orderBy: { number: 'asc' }, select: { id: true, number: true } }),
    prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
  ])

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link href="/cases" className="hover:text-blue-600">
          Sprawy
        </Link>
        <span>/</span>
        <span>Nowa</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nowa sprawa</h1>
      <CaseForm clients={clients} units={units} users={users} defaultClientId={searchParams.clientId} />
    </div>
  )
}
