import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { OfferCalculator } from '@/components/oferty/OfferCalculator'

export default async function EdytujOfertePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { items: { orderBy: { position: 'asc' } } },
  })
  if (!offer) notFound()
  if (offer.status === 'ZAAKCEPTOWANA' || offer.status === 'ANULOWANA') {
    redirect(`/oferty/${id}`)
  }

  const [units, clients] = await Promise.all([
    prisma.unit.findMany({
      where: {
        OR: [
          { status: { in: ['WOLNY', 'ZAREZERWOWANY'] } },
          { id: { in: offer.items.map((it) => it.unitId).filter(Boolean) as string[] } },
        ],
      },
      orderBy: [{ type: 'asc' }, { number: 'asc' }],
    }),
    prisma.client.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
  ])

  return (
    <div className="p-8">
      <div className="mb-2 text-sm">
        <Link href={`/oferty/${id}`} className="text-gray-500 hover:text-gray-700">← Powrót do oferty</Link>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Edycja oferty {offer.number}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Zmień pozycje, rabaty, dane klienta. Zapisanie nadpisze bieżącą ofertę.
        </p>
      </div>

      <OfferCalculator
        units={units.map((u) => ({
          id: u.id, number: u.number, type: u.type, area: u.area,
          pricePerSqmNet: u.pricePerSqmNet, pricePerSqmGross: u.pricePerSqmGross,
          priceNet: u.priceNet, priceGross: u.priceGross, vatRate: u.vatRate, status: u.status,
        }))}
        clients={clients.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }))}
        initial={{
          id: offer.id,
          title: offer.title,
          clientId: offer.clientId,
          validUntil: offer.validUntil ? offer.validUntil.toISOString() : null,
          notes: offer.notes,
          items: offer.items.map((it) => ({
            key: it.id,
            unitId: it.unitId,
            label: it.label,
            unitType: it.unitType,
            area: it.area,
            pricePerSqmNet: it.pricePerSqmNet,
            pricePerSqmGross: it.pricePerSqmGross,
            priceNet: it.priceNet,
            priceGross: it.priceGross,
            vatRate: it.vatRate,
            discountType: (it.discountType === 'AMOUNT_NET' ? 'AMOUNT_NET' : 'PCT') as 'PCT' | 'AMOUNT_NET',
            discountValue: it.discountValue,
          })),
        }}
      />
    </div>
  )
}
