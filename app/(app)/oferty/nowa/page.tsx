import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { OfferCalculator } from '@/components/oferty/OfferCalculator'

export default async function NowaOfertaPage() {
  const [units, clients] = await Promise.all([
    prisma.unit.findMany({
      where: { status: { in: ['WOLNY', 'ZAREZERWOWANY'] } },
      orderBy: [{ type: 'asc' }, { number: 'asc' }],
    }),
    prisma.client.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
  ])

  return (
    <div className="p-8">
      <div className="mb-2 text-sm">
        <Link href="/oferty" className="text-gray-500 hover:text-gray-700">← Oferty</Link>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kalkulator oferty</h1>
        <p className="text-gray-500 text-sm mt-1">
          Wybierz lokale, ustaw rabaty per pozycja, system policzy sumy netto i brutto.
        </p>
      </div>

      <OfferCalculator
        units={units.map((u) => ({
          id: u.id,
          number: u.number,
          type: u.type,
          area: u.area,
          pricePerSqmNet: u.pricePerSqmNet,
          pricePerSqmGross: u.pricePerSqmGross,
          priceNet: u.priceNet,
          priceGross: u.priceGross,
          vatRate: u.vatRate,
          status: u.status,
        }))}
        clients={clients.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
        }))}
      />
    </div>
  )
}
