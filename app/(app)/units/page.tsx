import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import {
  UNIT_STATUS_LABELS,
  type UnitStatus
} from '@/lib/types'
import { UnitFilters } from '@/components/units/UnitFilters'
import { UnitsTable } from '@/components/units/UnitsTable'

async function getUnits(type?: string, status?: string, search?: string) {
  return prisma.unit.findMany({
    where: {
      AND: [
        search ? { number: { contains: search } } : {},
        type ? { type } : {},
        status ? { status } : {},
      ],
    },
    include: { clientUnits: { include: { client: true } } },
    orderBy: { number: 'asc' },
  })
}

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: { type?: string; status?: string; search?: string }
}) {
  const units = await getUnits(searchParams.type, searchParams.status, searchParams.search)

  const statsByStatus = units.reduce((acc, u) => {
    acc[u.status] = (acc[u.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lokale</h1>
          <p className="text-gray-500 text-sm mt-1">{units.length} lokali</p>
        </div>
        <Link
          href="/units/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Dodaj lokal
        </Link>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { status: 'WOLNY', color: 'green' },
          { status: 'ZAREZERWOWANY', color: 'yellow' },
          { status: 'SPRZEDANY', color: 'blue' },
          { status: 'NIEDOSTEPNY', color: 'gray' },
        ].map(({ status, color }) => (
          <div key={status} className={`rounded-lg p-3 border ${colorBg(color)}`}>
            <p className="text-xs text-gray-500">{UNIT_STATUS_LABELS[status as UnitStatus]}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{statsByStatus[status] || 0}</p>
          </div>
        ))}
      </div>

      <UnitFilters />

      <UnitsTable units={units.map((u) => ({
        id: u.id,
        number: u.number,
        type: u.type,
        floor: u.floor,
        area: u.area,
        pricePerSqmNet: u.pricePerSqmNet,
        pricePerSqmGross: u.pricePerSqmGross,
        priceNet: u.priceNet,
        priceGross: u.priceGross,
        vatRate: u.vatRate,
        status: u.status,
        clientUnits: u.clientUnits.map((cu) => ({
          clientId: cu.clientId,
          client: { firstName: cu.client.firstName, lastName: cu.client.lastName },
        })),
      }))} />
    </div>
  )
}

function colorBg(color: string) {
  const map: Record<string, string> = {
    green: 'bg-green-50 border-green-100',
    yellow: 'bg-yellow-50 border-yellow-100',
    blue: 'bg-blue-50 border-blue-100',
    gray: 'bg-gray-50 border-gray-100',
  }
  return map[color] || 'bg-gray-50 border-gray-100'
}
