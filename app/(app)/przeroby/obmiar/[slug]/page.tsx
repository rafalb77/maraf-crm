import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ObmiarTree } from '@/components/przeroby/ObmiarTree'

export default async function ObmiarScopePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const scope = await prisma.workScope.findUnique({
    where: { slug },
    include: {
      categories: {
        orderBy: { order: 'asc' },
        include: {
          items: {
            orderBy: [{ floor: 'asc' }, { elementType: 'asc' }, { name: 'asc' }],
          },
        },
      },
    },
  })
  if (!scope) notFound()

  // KPI
  let totalItems = 0
  let totalVolume = 0
  let totalArea = 0
  for (const c of scope.categories) {
    totalItems += c.items.length
    for (const it of c.items) {
      totalVolume += it.volumeM3 || 0
      totalArea += it.areaM2 || 0
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-2 text-sm">
        <Link href="/przeroby/obmiar" className="text-gray-500 hover:text-gray-700">
          ← Obmiary
        </Link>
      </div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{scope.name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            Bazowy rejestr pozycji — źródło prawdy do protokołów przerobowych.
          </p>
        </div>
        <Link
          href={`/przeroby/protokoly/nowy?scope=${scope.slug}`}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Nowy protokół
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Stat label="Pozycji obmiaru" value={totalItems.toString()} />
        <Stat label="Objętość żelbetu" value={`${totalVolume.toFixed(2)} m³`} />
        <Stat label="Powierzchnia płyt" value={`${totalArea.toFixed(2)} m²`} />
      </div>

      <ObmiarTree
        categories={scope.categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          primaryUnit: c.primaryUnit,
          items: c.items.map((it) => ({
            id: it.id,
            floor: it.floor,
            elementType: it.elementType,
            name: it.name,
            count: it.count,
            volumeM3: it.volumeM3,
            areaM2: it.areaM2,
            primaryUnit: it.primaryUnit,
            primaryQty: it.primaryQty,
            notes: it.notes,
            completedPct: 0,
          })),
        }))}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
