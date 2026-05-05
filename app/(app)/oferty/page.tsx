import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function OfertyPage() {
  const offers = await prisma.offer.findMany({
    orderBy: [{ createdAt: 'desc' }],
    include: {
      client: true,
      _count: { select: { items: true } },
    },
  })

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Oferty</h1>
          <p className="text-gray-500 text-sm mt-1">
            Kalkulator cen lokali z rabatami per pozycja
          </p>
        </div>
        <Link
          href="/oferty/nowa"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Nowa oferta
        </Link>
      </div>

      {offers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Tytuł</th>
                <th className="text-left px-3 py-3 font-medium">Klient</th>
                <th className="text-right px-3 py-3 font-medium">Pozycji</th>
                <th className="text-right px-3 py-3 font-medium">Suma netto</th>
                <th className="text-right px-3 py-3 font-medium">Rabat</th>
                <th className="text-right px-3 py-3 font-medium">Po rabacie netto</th>
                <th className="text-right px-3 py-3 font-medium">Po rabacie brutto</th>
                <th className="text-right px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50/40">
                  <td className="px-5 py-3">
                    <Link href={`/oferty/${o.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {o.title || (o.number ? `Oferta #${o.number}` : 'Oferta bez tytułu')}
                    </Link>
                    <p className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleDateString('pl-PL')}</p>
                  </td>
                  <td className="px-3 py-3 text-gray-700">
                    {o.client ? `${o.client.firstName} ${o.client.lastName}` : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-gray-600">{o._count.items}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                    {fmt(o.subtotalNet)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-700">
                    {o.totalDiscountNet > 0 ? `−${fmt(o.totalDiscountNet)}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">
                    {fmt(o.totalNet)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-green-700">
                    {fmt(o.totalGross)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  return <span className={`inline-block px-2 py-0.5 text-xs rounded ${m.cls}`}>{m.label}</span>
}
