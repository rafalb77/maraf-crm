import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { UnitsImporter } from '@/components/units/UnitsImporter'

export default function UnitsImportPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <Link
          href="/units"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Powrót do listy lokali
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Import lokali z Excela</h1>
        <p className="text-gray-500 text-sm mt-1">
          Wybierz plik .xlsx — zobaczysz podgląd zmian zanim cokolwiek zostanie zapisane do bazy.
        </p>
      </div>
      <UnitsImporter />
    </div>
  )
}
