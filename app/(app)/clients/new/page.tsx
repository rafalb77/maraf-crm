import { ClientForm } from '@/components/clients/ClientForm'
import Link from 'next/link'

export default function NewClientPage() {
  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/clients" className="hover:text-blue-600">Klienci</Link>
          <span>/</span>
          <span>Nowy klient</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Dodaj klienta</h1>
      </div>
      <ClientForm />
    </div>
  )
}
