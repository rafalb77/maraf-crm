import { notFound } from 'next/navigation'
import Image from 'next/image'
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

const NAVY = '#2C3E54'
const GOLD = '#C9A37A'
const GOLD_DARK = '#8B6F47'

export default async function OfferPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [offer, settings] = await Promise.all([
    prisma.offer.findUnique({
      where: { id },
      include: { client: true, items: { orderBy: { position: 'asc' } } },
    }),
    prisma.settings.findMany({
      where: { key: { in: ['companyName', 'investmentName', 'emailSignature', 'bankAccount'] } },
    }),
  ])
  if (!offer) notFound()

  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 14mm 12mm 14mm 12mm; }
        @media print {
          html, body { background: white !important; }
          .no-print, .print\\:hidden { display: none !important; }
          .page-break-avoid { page-break-inside: avoid; }
          .page-break-before { page-break-before: always; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
        .print-doc { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: ${NAVY}; }
        .gold-line { background: linear-gradient(90deg, ${GOLD} 0%, ${GOLD_DARK} 50%, ${GOLD} 100%); height: 2px; }
      `}</style>

      <div className="bg-white min-h-screen p-8 print:p-0 print-doc">
        <PrintActions />

        <div className="mx-auto" style={{ maxWidth: '186mm', position: 'relative' }}>
          {/* ===================== SYGNET W TLE ===================== */}
          <div
            aria-hidden
            className="pointer-events-none select-none"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '120mm',
              height: '120mm',
              opacity: 0.05,
              zIndex: 0,
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }}
          >
            <Image src="/logo-icon.png" alt="" fill priority className="object-contain" sizes="454px" />
          </div>

          {/* ===================== TREŚĆ (nad sygnetem) ===================== */}
          <div style={{ position: 'relative', zIndex: 1 }}>
          {/* ===================== HEADER ===================== */}
          <header className="page-break-avoid">
            <div className="flex items-center justify-between gap-6">
              <div style={{ width: 220, height: 64, position: 'relative' }}>
                <Image
                  src="/logo-icon-light.png"
                  alt="MARAF Development"
                  fill
                  priority
                  className="object-contain object-left"
                  sizes="220px"
                />
              </div>
              <div style={{ width: 90, height: 90, position: 'relative' }}>
                {/* Logo Nova Staffa — wgraj plik do public/logo-novastaffa.png */}
                <Image
                  src="/logo-novastaffa.png"
                  alt="Nova Staffa"
                  fill
                  priority
                  className="object-contain object-right"
                  sizes="90px"
                />
              </div>
            </div>
            <div className="gold-line mt-4" />
          </header>

          {/* ===================== OFFER META ===================== */}
          <section className="mt-5 page-break-avoid">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: GOLD_DARK }}>
                  Oferta indywidualna
                </p>
                <h1 className="text-3xl font-bold mt-1 leading-none" style={{ color: NAVY }}>
                  {offer.number || 'OFERTA'}
                </h1>
                {offer.title && (
                  <p className="text-sm mt-2 text-gray-600">{offer.title}</p>
                )}
              </div>
              <div className="text-right text-xs text-gray-600">
                <p>Data wystawienia: <strong>{new Date(offer.createdAt).toLocaleDateString('pl-PL')}</strong></p>
                {offer.validUntil && (
                  <p className="mt-0.5">Ważna do: <strong style={{ color: GOLD_DARK }}>{new Date(offer.validUntil).toLocaleDateString('pl-PL')}</strong></p>
                )}
              </div>
            </div>
          </section>

          {/* ===================== CLIENT ===================== */}
          {offer.client && (
            <section className="mt-5 p-4 rounded-md page-break-avoid"
                     style={{ background: '#F7F5F1', borderLeft: `3px solid ${GOLD}` }}>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Adresat</p>
              <p className="text-base font-semibold" style={{ color: NAVY }}>
                {offer.client.firstName} {offer.client.lastName}
              </p>
              <div className="flex gap-4 text-xs text-gray-600 mt-1">
                {offer.client.email && <span>✉ {offer.client.email}</span>}
                {offer.client.phone && <span>☎ {offer.client.phone}</span>}
              </div>
            </section>
          )}

          {/* ===================== INVESTMENT MARKETING ===================== */}
          <section className="mt-6 page-break-avoid">
            <h2 className="text-[11px] uppercase tracking-[0.2em] mb-2" style={{ color: GOLD_DARK }}>
              Inwestycja
            </h2>
            <h3 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>
              Nova Staffa <span className="text-base font-normal text-gray-500">— Zgierz</span>
            </h3>
            <p className="text-sm leading-relaxed text-gray-700 mb-3">
              Nowoczesny kompleks mieszkaniowy łączący zalety natury z wygodą miasta.
              Bezpośrednie sąsiedztwo <strong>Lasu Krogulec</strong> w zacisznej części Zgierza,
              z doskonałą komunikacją do <strong>centrum Zgierza i Łodzi</strong>.
            </p>

            <div className="flex gap-x-5 text-[11px] text-gray-700">
              <div className="flex-1 flex flex-col gap-y-1.5">
                <Bullet>Sąsiedztwo <strong>Lasu Krogulec</strong> — spacery, jogging, świeże powietrze</Bullet>
                <Bullet>Loggie lub balkony w <strong>każdym mieszkaniu</strong></Bullet>
                <Bullet>ŁKA, autobus i rower miejski w <strong>300 m</strong></Bullet>
                <Bullet>Mieszkania <strong>1–4 pokojowe</strong> z przemyślanymi metrażami</Bullet>
                <Bullet><strong>Zielone tarasy</strong> z roślinnością ekstensywną</Bullet>
              </div>
              <div className="flex-1 flex flex-col gap-y-1.5">
                <Bullet>Windy w <strong>każdej klatce</strong> + plac zabaw</Bullet>
                <Bullet>Możliwość montażu <strong>stacji ładowania EV</strong> na parkingach zewnętrznych</Bullet>
                <Bullet><strong>Doświadczony deweloper</strong> — Maraf Development</Bullet>
              </div>
            </div>
          </section>

          <div className="gold-line my-6" />

          {/* ===================== TABLE ===================== */}
          <section>
            <h2 className="text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: GOLD_DARK }}>
              Propozycja ofertowa
            </h2>
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr style={{ background: NAVY, color: 'white' }}>
                  <th className="text-left p-2 font-medium" style={{ width: '5%' }}>Lp.</th>
                  <th className="text-left p-2 font-medium" style={{ width: '15%' }}>Typ</th>
                  <th className="text-left p-2 font-medium" style={{ width: '14%' }}>Numer</th>
                  <th className="text-right p-2 font-medium" style={{ width: '11%' }}>Pow.</th>
                  <th className="text-right p-2 font-medium" style={{ width: '17%' }}>Cena brutto</th>
                  <th className="text-right p-2 font-medium" style={{ width: '12%' }}>Rabat</th>
                  <th className="text-right p-2 font-semibold" style={{ width: '26%', borderLeft: `2px solid ${GOLD}` }}>Po rabacie brutto</th>
                </tr>
              </thead>
              <tbody>
                {offer.items.map((it, idx) => (
                  <tr key={it.id} className="border-b" style={{ borderColor: '#E2DCD0' }}>
                    <td className="p-2 text-gray-500">{idx + 1}.</td>
                    <td className="p-2">{TYPE_LABELS[it.unitType] || it.unitType}</td>
                    <td className="p-2 font-mono font-medium">{it.label}</td>
                    <td className="p-2 text-right tabular-nums">{it.area > 0 ? `${it.area.toFixed(2)} m²` : '—'}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(it.priceGross)}</td>
                    <td className="p-2 text-right tabular-nums" style={{ color: '#BE185D' }}>
                      {it.discountValue > 0
                        ? (it.discountType === 'PCT' ? `−${it.discountValue}%` : `−${fmt(it.discountValue)}`)
                        : '—'}
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold"
                        style={{ borderLeft: `2px solid ${GOLD}`, color: NAVY }}>
                      {fmt(it.finalGross)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F1EEE7' }}>
                  <td colSpan={4} className="p-2 text-right font-semibold" style={{ color: NAVY }}>RAZEM</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{fmt(offer.subtotalGross)}</td>
                  <td className="p-2 text-right tabular-nums font-semibold" style={{ color: '#BE185D' }}>
                    {offer.totalDiscountGross > 0 ? `−${fmt(offer.totalDiscountGross)}` : '—'}
                  </td>
                  <td className="p-2 text-right tabular-nums font-bold text-base"
                      style={{ borderLeft: `2px solid ${GOLD}`, color: NAVY }}>
                    {fmt(offer.totalGross)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          {/* ===================== TOTALS HIGHLIGHT ===================== */}
          <section className="mt-5 grid grid-cols-3 gap-3 page-break-avoid">
            <div className="p-3 rounded" style={{ background: '#F7F5F1', border: '1px solid #E2DCD0' }}>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Suma brutto przed rabatem</p>
              <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: NAVY }}>{fmt(offer.subtotalGross)} zł</p>
            </div>
            <div className="p-3 rounded" style={{ background: '#FFF1F2', border: '1px solid #FECDD3' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: '#9F1239' }}>Łączny rabat brutto</p>
              <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: '#9F1239' }}>
                {offer.totalDiscountGross > 0 ? `−${fmt(offer.totalDiscountGross)}` : '0,00'} zł
              </p>
            </div>
            <div className="p-3 rounded text-white" style={{ background: NAVY }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: GOLD }}>Do zapłaty (brutto)</p>
              <p className="text-2xl font-bold tabular-nums mt-0.5">{fmt(offer.totalGross)} zł</p>
            </div>
          </section>

          {/* ===================== NOTES ===================== */}
          {offer.notes && (
            <section className="mt-5 p-4 rounded-md page-break-avoid"
                     style={{ background: '#F7F5F1', border: '1px solid #E2DCD0' }}>
              <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Warunki / uwagi</h3>
              <p className="text-xs whitespace-pre-wrap text-gray-700">{offer.notes}</p>
            </section>
          )}

          {/* ===================== FOOTER ===================== */}
          <footer className="mt-10 pt-4 border-t text-[10px] text-gray-500 page-break-avoid"
                  style={{ borderColor: '#E2DCD0' }}>
            <div className="flex justify-between items-end">
              <div>
                <p className="font-semibold" style={{ color: NAVY }}>{settingsMap.companyName || 'MARAF Development'}</p>
                <p>Biuro: ul. Struga 23, 95-100 Zgierz</p>
                <p>www.novastaffa.pl · biuro@novastaffa.pl</p>
              </div>
              <div className="text-right">
                <p>Oferta wystawiona przez system CRM Maraf</p>
                <p>{new Date().toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</p>
              </div>
            </div>
            {settingsMap.emailSignature && (
              <div className="mt-3 text-gray-600 whitespace-pre-wrap text-[10px]">
                {settingsMap.emailSignature}
              </div>
            )}
          </footer>
          </div>
        </div>
      </div>
    </>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span style={{ color: GOLD_DARK, fontWeight: 700 }}>·</span>
      <span>{children}</span>
    </div>
  )
}
