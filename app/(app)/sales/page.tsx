import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { SalesTable } from '@/components/sales/SalesTable'
import { NewContractFromReservationButton } from '@/components/sales/NewContractFromReservationButton'

export default async function SalesPage({
  searchParams,
}: {
  searchParams: { status?: string; type?: string }
}) {
  const contracts = await prisma.contract.findMany({
    where: {
      AND: [
        searchParams.status ? { status: searchParams.status } : {},
        searchParams.type ? { type: searchParams.type } : {},
      ],
    },
    include: { client: true, contractUnits: { include: { unit: true } } },
    orderBy: { createdAt: 'desc' },
  })

  // Klienci z zarezerwowanymi lokalami — do „Nowa z rezerwacji".
  const reservingClients = await prisma.client.findMany({
    where: { clientUnits: { some: {} } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      clientUnits: { select: { unit: { select: { number: true } } } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  const clientsWithReservation = reservingClients.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    unitNumbers: c.clientUnits.map((cu) => cu.unit.number),
  }))

  // Wartość brutto umowy: pole valueGross, a gdy puste — suma cen brutto powiązanych lokali.
  const grossOf = (c: (typeof contracts)[number]) =>
    c.valueGross ?? c.contractUnits.reduce((s, cu) => s + (cu.unit.priceGross || 0), 0)

  // KPI liczone z aktualnie wczytanej (przefiltrowanej) listy — zero nowych zapytań.
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const signedValue = contracts
    .filter((c) => c.status === 'PODPISANA')
    .reduce((s, c) => s + grossOf(c), 0)
  const signedThisMonth = contracts.filter(
    (c) => c.signedAt && new Date(c.signedAt) >= monthStart,
  ).length
  const ppsm = contracts
    .flatMap((c) => c.contractUnits.map((cu) => cu.unit.pricePerSqmGross))
    .filter((v) => v > 0)
  const avgPpsm = ppsm.length ? ppsm.reduce((a, b) => a + b, 0) / ppsm.length : 0

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[30px] font-bold text-gray-900" style={{ letterSpacing: '-0.02em' }}>Sprzedaż</h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Umowy i transakcje · {contracts.length} {contracts.length === 1 ? 'umowa' : 'umów'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/sales/import"
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Import z Excela
          </Link>
          <Link
            href="/sales/link-units"
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Powiąż lokale
          </Link>
          <NewContractFromReservationButton clients={clientsWithReservation} />
          <Link
            href="/sales/new"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nowa umowa
          </Link>
        </div>
      </div>

      {/* KPI sprzedaży (bento v2) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <SalesKpi label="Wartość podpisanych umów" value={formatCurrency(signedValue)} delay={0} />
        <SalesKpi label="Umowy w tym miesiącu" value={String(signedThisMonth)} delay={0.06} />
        <SalesKpi label="Średnia cena m²" value={avgPpsm > 0 ? formatCurrency(avgPpsm) : '—'} delay={0.1} />
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        {[
          { href: '/sales', label: 'Wszystkie' },
          { href: '/sales?status=W_PRZYGOTOWANIU', label: 'W przygotowaniu' },
          { href: '/sales?status=PODPISANA', label: 'Podpisane' },
          { href: '/sales?status=ROZWIAZANA', label: 'Rozwiązane' },
          { href: '/sales?status=ANULOWANA', label: 'Anulowane' },
        ].map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            {i.label}
          </Link>
        ))}
        {[
          { href: '/sales?type=REZERWACYJNA', label: 'Rezerwacyjne' },
          { href: '/sales?type=DEWELOPERSKA', label: 'Deweloperskie' },
          { href: '/sales?type=PRZENIESIENIA', label: 'Przeniesienia' },
        ].map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="px-3 py-1.5 border border-blue-200 rounded-lg text-sm text-blue-600 hover:bg-blue-50"
          >
            {i.label}
          </Link>
        ))}
      </div>

      <SalesTable
        rows={contracts.map((c) => ({
          id: c.id,
          number: c.number,
          investmentName: c.investmentName,
          type: c.type,
          clientName: `${c.client.firstName} ${c.client.lastName}`,
          unitLabel: c.contractUnits.map((cu) => cu.unit.number).join(' + ') || '—',
          amountGross: grossOf(c) || null,
          introducedAt: c.introducedAt.toISOString(),
          signedAt: c.signedAt ? c.signedAt.toISOString() : null,
          status: c.status,
        }))}
      />
    </div>
  )
}

function SalesKpi({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-[18px] v2-card-in" style={{ animationDelay: `${delay}s` }}>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="mt-1.5 text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
    </div>
  )
}
