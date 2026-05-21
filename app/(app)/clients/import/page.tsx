import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ClientsImporter } from '@/components/clients/ClientsImporter'

export default function ClientsImportPage() {
  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Powrót do listy klientów
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Import klientów z Excela</h1>
        <p className="text-gray-500 text-sm mt-1">
          Wybierz plik .xlsx — zobaczysz podgląd zanim cokolwiek zostanie zapisane. Dodawani są tylko nowi klienci (dedup po PESEL).
        </p>
      </div>
      <ClientsImporter />
    </div>
  )
}
