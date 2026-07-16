import { UnitForm } from '@/components/units/UnitForm'
import Link from 'next/link'

export default function NewUnitPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/units" className="hover:text-blue-600">Lokale</Link>
          <span>/</span>
          <span>Nowy lokal</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Dodaj lokal</h1>
      </div>
      <UnitForm />
    </div>
  )
}
