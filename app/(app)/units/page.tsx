import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Upload, Plus } from 'lucide-react'
import {
  UNIT_STATUS_LABELS,
  type UnitStatus
} from '@/lib/types'
import { UnitFilters } from '@/components/units/UnitFilters'
import { UnitsTable } from '@/components/units/UnitsTable'

type UnitFilterParams = {
  type?: string
  status?: string
  search?: string
  areaMin?: number
  areaMax?: number
  priceMin?: number
  priceMax?: number
  rooms?: number
  floor?: number
}

function parseNum(v?: string): number | undefined {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

async function getUnits(f: UnitFilterParams) {
  return prisma.unit.findMany({
    where: {
      AND: [
        f.search ? { number: { contains: f.search, mode: 'insensitive' } } : {},
        f.type ? { type: f.type } : {},
        f.status ? { status: f.status } : {},
        f.areaMin !== undefined ? { area: { gte: f.areaMin } } : {},
        f.areaMax !== undefined ? { area: { lte: f.areaMax } } : {},
        f.priceMin !== undefined ? { priceGross: { gte: f.priceMin } } : {},
        f.priceMax !== undefined ? { priceGross: { lte: f.priceMax } } : {},
        f.rooms !== undefined ? { rooms: f.rooms } : {},
        f.floor !== undefined ? { floor: f.floor } : {},
      ],
    },
    include: { clientUnits: { include: { client: true } } },
    orderBy: { number: 'asc' },
  })
}

// Wartości do list rozwijanych (piętro / liczba pokoi) — pełna pula, niezależnie od aktywnych filtrów.
async function getFilterOptions() {
  const [floors, rooms] = await Promise.all([
    prisma.unit.findMany({
      where: { floor: { not: null } },
      select: { floor: true },
      distinct: ['floor'],
      orderBy: { floor: 'asc' },
    }),
    prisma.unit.findMany({
      where: { rooms: { not: null } },
      select: { rooms: true },
      distinct: ['rooms'],
      orderBy: { rooms: 'asc' },
    }),
  ])
  return {
    floors: floors.map((f) => f.floor as number),
    rooms: rooms.map((r) => r.rooms as number),
  }
}

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: {
    type?: string
    status?: string
    search?: string
    areaMin?: string
    areaMax?: string
    priceMin?: string
    priceMax?: string
    rooms?: string
    floor?: string
  }
}) {
  const filters: UnitFilterParams = {
    type: searchParams.type,
    status: searchParams.status,
    search: searchParams.search,
    areaMin: parseNum(searchParams.areaMin),
    areaMax: parseNum(searchParams.areaMax),
    priceMin: parseNum(searchParams.priceMin),
    priceMax: parseNum(searchParams.priceMax),
    rooms: parseNum(searchParams.rooms),
    floor: parseNum(searchParams.floor),
  }
  const [units, filterOptions] = await Promise.all([getUnits(filters), getFilterOptions()])

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
        <div className="flex gap-2">
          <Link
            href="/units/import"
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import z Excela
          </Link>
          <Link
            href="/units/new"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Dodaj lokal
          </Link>
        </div>
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

      <UnitFilters floors={filterOptions.floors} rooms={filterOptions.rooms} />

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
