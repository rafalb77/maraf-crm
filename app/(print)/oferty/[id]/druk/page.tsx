import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PrintActions } from '@/components/oferty/PrintActions'

const TYPE_LABELS: Record<string, string> = {
  MIESZKALNY: 'Mieszkanie',
  USLUGOWY: 'Usługowy',
  PARKING: 'Miejsce postojowe',
  GARAZ: 'Garaż',
  KOMORKA: 'Komórka',
}

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default async function OfferPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [offer, settings] = await Promise.all([
    prisma.offer.findUnique({
      where: { id },
      include: { client: true, items: { orderBy: { position: 'asc' } } },
    }),
    prisma.settings.findMany({
      where: { key: { in: ['companyName', 'investmentName', 'emailSignature'] } },
    }),
  ])
  if (!offer) notFound()

  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  return (
    <>
      {/* Style druku: A4 pozioma, marginesy, ukrycie elementów print:hidden */}
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        @media print {
          html, body { background: white !important; }
          .no-print, .print\\:hidden { display: none !important; }
          table { font-size: 10px; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
      `}</style>

    <div className="bg-white text-gray-900 p-8 min-h-screen print:p-0">
      <PrintActions />

      <div className="max-w-4xl mx-auto">
        <header className="border-b-2 border-gray-900 pb-4 mb-6">
          <div className="flex items-baseline justify-between">
            <div>
              <h1 className="text-3xl font-bold">OFERTA</h1>
              <p className="text-lg font-mono mt-1">{offer.number}</p>
            </div>
            <div className="text-right text-sm">
              {settingsMap.companyName && <p className="font-semibold">{settingsMap.companyName}</p>}
              {settingsMap.investmentName && <p>{settingsMap.investmentName}</p>}
              <p className="text-gray-600">Data: {new Date(offer.createdAt).toLocaleDateString('pl-PL')}</p>
              {offer.validUntil && (
                <p className="text-gray-600">Ważna do: <strong>{new Date(offer.validUntil).toLocaleDateString('pl-PL')}</strong></p>
              )}
            </div>
          </div>
        </header>

        {offer.title && (
          <p className="text-lg mb-4">{offer.title}</p>
        )}

        {offer.client && (
          <section className="mb-6">
            <p className="text-sm text-gray-600 mb-1">Dla:</p>
            <p className="text-base font-medium">{offer.client.firstName} {offer.client.lastName}</p>
            {offer.client.email && <p className="text-sm text-gray-600">{offer.client.email}</p>}
            {offer.client.phone && <p className="text-sm text-gray-600">tel. {offer.client.phone}</p>}
          </section>
        )}

        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="bg-gray-100 text-xs uppercase">
              <th className="text-left p-2 border border-gray-300">Lp.</th>
              <th className="text-left p-2 border border-gray-300">Typ</th>
              <th className="text-left p-2 border border-gray-300">Nr</th>
              <th className="text-right p-2 border border-gray-300">Pow.</th>
              <th className="text-right p-2 border border-gray-300">Cena/m² netto</th>
              <th className="text-right p-2 border border-gray-300">Cena/m² brutto</th>
              <th className="text-right p-2 border border-gray-300">Cena netto</th>
              <th className="text-right p-2 border border-gray-300">Cena brutto</th>
              <th className="text-right p-2 border border-gray-300">Rabat</th>
              <th className="text-right p-2 border border-gray-300">Po rabacie netto</th>
              <th className="text-right p-2 border border-gray-300 bg-yellow-50">Po rabacie brutto</th>
            </tr>
          </thead>
          <tbody>
            {offer.items.map((it, idx) => (
              <tr key={it.id}>
                <td className="p-2 border border-gray-300">{idx + 1}.</td>
                <td className="p-2 border border-gray-300 text-xs">{TYPE_LABELS[it.unitType] || it.unitType}</td>
                <td className="p-2 border border-gray-300 font-mono font-medium">{it.label}</td>
                <td className="p-2 border border-gray-300 text-right">{it.area.toFixed(2)} m²</td>
                <td className="p-2 border border-gray-300 text-right">{fmt(it.pricePerSqmNet)}</td>
                <td className="p-2 border border-gray-300 text-right">{fmt(it.pricePerSqmGross)}</td>
                <td className="p-2 border border-gray-300 text-right">{fmt(it.priceNet)}</td>
                <td className="p-2 border border-gray-300 text-right">{fmt(it.priceGross)}</td>
                <td className="p-2 border border-gray-300 text-right">
                  {it.discountValue > 0
                    ? (it.discountType === 'PCT' ? `${it.discountValue}%` : `${fmt(it.discountValue)} zł`)
                    : '—'}
                </td>
                <td className="p-2 border border-gray-300 text-right font-medium">{fmt(it.finalNet)}</td>
                <td className="p-2 border border-gray-300 text-right font-bold bg-yellow-50">{fmt(it.finalGross)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold">
              <td className="p-2 border border-gray-300" colSpan={6}>RAZEM</td>
              <td className="p-2 border border-gray-300 text-right">{fmt(offer.subtotalNet)}</td>
              <td className="p-2 border border-gray-300 text-right">{fmt(offer.subtotalGross)}</td>
              <td className="p-2 border border-gray-300 text-right text-amber-700">
                {offer.totalDiscountNet > 0 ? `−${fmt(offer.totalDiscountNet)}` : '—'}
              </td>
              <td className="p-2 border border-gray-300 text-right">{fmt(offer.totalNet)}</td>
              <td className="p-2 border border-gray-300 text-right text-base bg-yellow-100">{fmt(offer.totalGross)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 border border-gray-300">
            <p className="text-xs text-gray-600">Suma brutto przed rabatem</p>
            <p className="text-xl font-bold tabular-nums mt-1">{fmt(offer.subtotalGross)} zł</p>
          </div>
          <div className="p-4 border border-amber-300 bg-amber-50">
            <p className="text-xs text-amber-700">Łączny rabat brutto</p>
            <p className="text-xl font-bold tabular-nums text-amber-800 mt-1">
              {offer.totalDiscountGross > 0 ? `−${fmt(offer.totalDiscountGross)}` : '0,00'} zł
            </p>
          </div>
          <div className="p-4 border-2 border-green-700 bg-green-50">
            <p className="text-xs text-green-700">Do zapłaty (brutto)</p>
            <p className="text-2xl font-bold tabular-nums text-green-800 mt-1">{fmt(offer.totalGross)} zł</p>
          </div>
        </div>

        {offer.notes && (
          <section className="mb-6 p-4 border border-gray-300 bg-yellow-50/40">
            <h3 className="font-semibold mb-2 text-sm">Warunki / notatki:</h3>
            <p className="text-sm whitespace-pre-wrap">{offer.notes}</p>
          </section>
        )}

        {settingsMap.emailSignature && (
          <footer className="mt-12 pt-6 border-t border-gray-300 text-sm text-gray-600 whitespace-pre-wrap">
            {settingsMap.emailSignature}
          </footer>
        )}

        <div className="grid grid-cols-2 gap-12 mt-16 print:mt-24">
          <div className="text-center">
            <div className="border-b border-gray-400 pb-1 mb-1">&nbsp;</div>
            <p className="text-xs text-gray-600">Podpis klienta</p>
          </div>
          <div className="text-center">
            <div className="border-b border-gray-400 pb-1 mb-1">&nbsp;</div>
            <p className="text-xs text-gray-600">Podpis sprzedawcy</p>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
