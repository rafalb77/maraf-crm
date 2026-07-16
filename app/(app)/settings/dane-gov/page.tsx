import Link from 'next/link'
import { DaneGovPanel } from '@/components/settings/DaneGovPanel'

export default function DaneGovPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-blue-600 hover:text-blue-700">← Ustawienia</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Raportowanie cen — dane.gov.pl</h1>
        <p className="text-gray-500 text-sm mt-1">
          Codzienny wykaz cen ofertowych lokali wymagany ustawą o jawności cen (Dz.U.2025.758).
        </p>
      </div>
      <DaneGovPanel />
    </div>
  )
}
