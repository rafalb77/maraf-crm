import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { ClientForm } from '@/components/clients/ClientForm'
import Link from 'next/link'

export default async function EditClientPage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({ where: { id: params.id } })
  if (!client) notFound()

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/clients" className="hover:text-blue-600">Klienci</Link>
          <span>/</span>
          <Link href={`/clients/${client.id}`} className="hover:text-blue-600">{client.firstName} {client.lastName}</Link>
          <span>/</span>
          <span>Edycja</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Edytuj klienta</h1>
      </div>
      <ClientForm client={client} />
    </div>
  )
}
