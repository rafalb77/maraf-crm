import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { OfferActions } from '@/components/oferty/OfferActions'

const TYPE_LABELS: Record<string, string> = {
  MIESZKALNY: 'Mieszkanie',
  USLUGOWY: 'Usługowy',
  PARKING: 'Miejsce postojowe',
  GARAZ: 'Garaż',
  KOMORKA: 'Komórka',
}
const TYPE_BADGE: Record<string, string> = {
  MIESZKALNY: 'bg-blue-50 text-blue-700',
  USLUGOWY: 'bg-purple-50 text-purple-700',
  PARKING: 'bg-amber-50 text-amber-700',
  GARAZ: 'bg-orange-50 text-orange-700',
  KOMORKA: 'bg-gray-100 text-gray-700',
}

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      client: true,
      items: { orderBy: { position: 'asc' } },
    },
  })
  if (!offer) notFound()

  return (
    <div className="p-8">
      <div className="mb-2 text-sm">
        <Link href="/oferty" className="text-gray-500 hover:text-gray-700">← Oferty</Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {offer.title || `Oferta ${offer.number}`}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {offer.number}
            {offer.client && (
              <> · <Link href={`/clients/${offer.client.id}`} className="hover:text-blue-600">
                {offer.client.firstName} {offer.client.lastName}
              </Link></>
            )}
            {' · '}
            {new Date(offer.createdAt).toLocaleDateString('pl-PL')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={offer.status} />
        </div>
      </div>

      <div className="mb-5">
        <OfferActions
          id={offer.id}
          number={offer.number || offer.id}
          status={offer.status}
          clientEmail={offer.client?.email || null}
          hasClient={!!offer.clientId}
          hasUnitsForReservation={offer.items.some((it) => !!it.unitId)}
        />
      </div>

      {/* Pozycje */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Pozycje oferty ({offer.items.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50/60">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Lp.</th>
                <th className="text-left px-3 py-2 font-medium">Typ</th>
                <th className="text-left px-3 py-2 font-medium">Nr</th>
                <th className="text-right px-2 py-2 font-medium">Pow.</th>
                <th className="text-right px-2 py-2 font-medium">Cena/m²<br/>netto</th>
                <th className="text-right px-2 py-2 font-medium">Cena/m²<br/>brutto</th>
                <th className="text-right px-2 py-2 font-medium">Cena netto</th>
                <th className="text-right px-2 py-2 font-medium">Cena brutto</th>
                <th className="text-right px-2 py-2 font-medium">Rabat</th>
                <th className="text-right px-2 py-2 font-medium bg-amber-50/40">Po rabacie<br/>netto</th>
                <th className="text-right px-3 py-2 font-medium bg-green-50/40">Po rabacie<br/>brutto</th>
              </tr>
            </thead>
            <tbody>
              {offer.items.map((it, idx) => (
                <tr key={it.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-500 text-xs">{idx + 1}.</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 text-[10px] uppercase rounded ${TYPE_BADGE[it.unitType] || 'bg-gray-100'}`}>
                      {TYPE_LABELS[it.unitType] || it.unitType}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono font-medium">{it.label}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{it.area.toFixed(2)} m²</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmt(it.pricePerSqmNet)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmt(it.pricePerSqmGross)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(it.priceNet)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(it.priceGross)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-amber-700">
                    {it.discountValue > 0 ? (
                      it.discountType === 'PCT'
                        ? `${it.discountValue}%`
                        : `${fmt(it.discountValue)} zł`
                    ) : '—'}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium bg-amber-50/40">
                    {fmt(it.finalNet)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold bg-green-50/40 text-green-800">
                    {fmt(it.finalGross)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-gray-50/60">
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right text-sm font-medium text-gray-700">RAZEM</td>
                <td className="px-2 py-2 text-right tabular-nums font-medium">{fmt(offer.subtotalNet)}</td>
                <td className="px-2 py-2 text-right tabular-nums font-medium">{fmt(offer.subtotalGross)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-amber-700">
                  {offer.totalDiscountNet > 0 ? `−${fmt(offer.totalDiscountNet)}` : '—'}
                </td>
                <td className="px-2 py-2 text-right tabular-nums font-bold bg-amber-50/60">
                  {fmt(offer.totalNet)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold bg-green-50/60 text-green-800">
                  {fmt(offer.totalGross)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">Suma netto przed rabatem</p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{fmt(offer.subtotalNet)} zł</p>
          <p className="text-xs text-gray-500 mt-3 mb-1">Suma brutto przed rabatem</p>
          <p className="text-xl font-medium text-gray-700 tabular-nums">{fmt(offer.subtotalGross)} zł</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-xs text-amber-700 mb-1">Łączny rabat netto</p>
          <p className="text-xl font-bold text-amber-800 tabular-nums">
            {offer.totalDiscountNet > 0 ? `−${fmt(offer.totalDiscountNet)}` : '0,00'} zł
          </p>
          <p className="text-xs text-amber-700 mt-3 mb-1">Łączny rabat brutto</p>
          <p className="text-xl font-medium text-amber-800 tabular-nums">
            {offer.totalDiscountGross > 0 ? `−${fmt(offer.totalDiscountGross)}` : '0,00'} zł
          </p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <p className="text-xs text-green-700 mb-1">Do zapłaty netto</p>
          <p className="text-2xl font-bold text-green-800 tabular-nums">{fmt(offer.totalNet)} zł</p>
          <p className="text-xs text-green-700 mt-3 mb-1">Do zapłaty brutto</p>
          <p className="text-3xl font-bold text-green-800 tabular-nums">{fmt(offer.totalGross)} zł</p>
        </div>
      </div>

      {offer.notes && (
        <div className="mt-5 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-2 text-sm">Notatki / warunki</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{offer.notes}</p>
        </div>
      )}

      {offer.validUntil && (
        <p className="text-xs text-gray-500 mt-4">
          Oferta ważna do: <strong>{new Date(offer.validUntil).toLocaleDateString('pl-PL')}</strong>
        </p>
      )}
    </div>
  )
}

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    SZKIC:          { label: 'szkic', cls: 'bg-gray-100 text-gray-600' },
    WYSLANA:        { label: 'wysłana', cls: 'bg-blue-50 text-blue-700' },
    ZAAKCEPTOWANA:  { label: 'zaakceptowana', cls: 'bg-green-50 text-green-700' },
    ODRZUCONA:      { label: 'odrzucona', cls: 'bg-red-50 text-red-700' },
    ANULOWANA:      { label: 'anulowana', cls: 'bg-gray-100 text-gray-500' },
  }
  const m = map[status] || { label: status, cls: 'bg-gray-100' }
  return <span className={`inline-block px-2.5 py-1 text-xs rounded-lg ${m.cls}`}>{m.label}</span>
}
