import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { OffersTable } from '@/components/oferty/OffersTable'

export default async function OfertyPage() {
  const offers = await prisma.offer.findMany({
    orderBy: [{ createdAt: 'desc' }],
    include: {
      client: true,
      _count: { select: { items: true } },
    },
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Oferty</h1>
          <p className="text-gray-500 text-sm mt-1">
            Kalkulator cen lokali z rabatami per pozycja
          </p>
        </div>
        <Link
          href="/oferty/nowa"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium w-full sm:w-auto text-center"
        >
          + Nowa oferta
        </Link>
      </div>

      {offers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
          <div className="text-4xl mb-3">💼</div>
          <h2 className="font-semibold text-gray-900 mb-2">Brak ofert</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            Utwórz pierwszą ofertę — wybierz lokale, ustaw rabaty, system policzy sumy netto i brutto.
          </p>
          <Link
            href="/oferty/nowa"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Utwórz pierwszą ofertę
          </Link>
        </div>
      ) : (
        <OffersTable
          rows={offers.map((o) => ({
            id: o.id,
            title: o.title,
            number: o.number,
            createdAt: o.createdAt.toISOString(),
            clientName: o.client ? `${o.client.firstName} ${o.client.lastName}` : null,
            itemsCount: o._count.items,
            subtotalNet: o.subtotalNet,
            totalDiscountNet: o.totalDiscountNet,
            totalNet: o.totalNet,
            totalGross: o.totalGross,
            status: o.status,
          }))}
        />
      )}
    </div>
  )
}
