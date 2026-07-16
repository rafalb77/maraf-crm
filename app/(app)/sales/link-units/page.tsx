import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { UnitsLinker } from '@/components/sales/UnitsLinker'

export default function LinkUnitsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <Link href="/sales" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3">
          <ArrowLeft className="w-4 h-4" />
          Powrót do umów
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Powiąż lokale z umowami</h1>
        <p className="text-gray-500 text-sm mt-1">
          Wgraj eksport lokali z kolumną „Umowa" — utworzę powiązania lokal↔umowa i lokal↔klient. Podgląd przed zapisem.
        </p>
      </div>
      <UnitsLinker />
    </div>
  )
}
