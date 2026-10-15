import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { getActiveCompany } from '@/lib/finanse-company'
import { loadObciazenia } from '@/lib/obciazenia'
import { ObciazeniaKontrahent } from '@/components/finanse/ObciazeniaKontrahent'

// Obciazenia JEDNEGO kontrahenta (efektywnego — etykieta podwykonawcy lub
// vendor): kaucje gw. / koszty budowy / kary / prad, z wyborem pozycji,
// sumowaniem na zywo i rejestrem kar. [label] = nazwa URL-encoded.
export default async function ObciazeniaKontrahentPage({ params }: { params: { label: string } }) {
  const company = getActiveCompany()
  const session = await getServerSession(authOptions)
  const label = decodeURIComponent(params.label)

  const map = await loadObciazenia(company)
  // Dopasowanie case-insensitive — etykiety bywaja roznie wpisane.
  const bucket = map.get(label)
    || [...map.values()].find((b) => b.label.toLowerCase() === label.toLowerCase())
    || { label, umbrella: null, items: [], netKaucje: 0, netKb: 0, netPrad: 0, netKary: 0, netTotal: 0, grossKaucje: 0, grossKb: 0, grossPrad: 0, grossKary: 0, grossTotal: 0, overdueReturns: 0 }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-5">
        <Link href="/finanse/obciazenia" className="text-sm text-gray-500 hover:text-gray-700">← Obciążenia kontrahentów</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{bucket.label}</h1>
        {bucket.umbrella && <p className="text-sm text-gray-400">rozliczany pod: {bucket.umbrella}</p>}
      </div>
      <ObciazeniaKontrahent
        label={bucket.label}
        items={bucket.items}
        netKaucje={bucket.netKaucje}
        netKb={bucket.netKb}
        netPrad={bucket.netPrad}
        netKary={bucket.netKary}
        netTotal={bucket.netTotal}
        grossKaucje={bucket.grossKaucje}
        grossKb={bucket.grossKb}
        grossTotal={bucket.grossTotal}
        overdueReturns={bucket.overdueReturns}
        isAdmin={isAdmin(session?.user?.email)}
      />
    </div>
  )
}
