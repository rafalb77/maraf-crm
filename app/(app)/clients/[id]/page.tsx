import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import {
  SERVICE_STATUS_COLORS, SERVICE_STATUS_LABELS,
  CONTRACT_TYPE_LABELS, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS,
  type ClientStatus, type ServiceStatus, type ContractType, type ContractStatus,
} from '@/lib/types'
import { expireSoftReservations } from '@/lib/reservations'
import { maybeGenerateTasks } from '@/lib/tasks'
import {
  isActiveContract, groupPriceHistory, buildDealCardData, buildPortfolioRows,
  computePortfolioSums, computeClientKpi, computeAttentionFlags, buildTimeline,
} from '@/lib/client-portfolio'
import { ActivityForm } from '@/components/clients/ActivityForm'
import { DeleteClientButton } from '@/components/clients/DeleteClientButton'
import { ClientStatusChanger } from '@/components/clients/ClientStatusChanger'
import { PromoteReservationButton } from '@/components/clients/PromoteReservationButton'
import { ClientOwnerChanger } from '@/components/clients/ClientOwnerChanger'
import { ClientSummaryBar } from '@/components/clients/ClientSummaryBar'
import { ClientOffersPanel, type ClientOfferRow } from '@/components/clients/ClientOffersPanel'
import { ClientTasksPanel, type ClientTaskRow } from '@/components/clients/ClientTasksPanel'
import { ContractDealCard } from '@/components/clients/ContractDealCard'
import { ClientUnitsPanel } from '@/components/clients/ClientUnitsPanel'
import { ClientTimeline } from '@/components/clients/ClientTimeline'

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  await expireSoftReservations()
  // Świeże zadania z silnika przypomnień (throttling 10 min, nigdy nie rzuca) —
  // sekcja „Zaplanowane" pokazuje także reguły (raty, rezerwacje, koniec rezerwacji).
  await maybeGenerateTasks()
  const [client, contracts, allUnits, users, calendarToken, openTasks, offers] = await Promise.all([
    prisma.client.findUnique({
      where: { id: params.id },
      include: {
        clientUnits: { include: { unit: true } },
        activities: { orderBy: { date: 'desc' } },
        serviceRequests: { include: { unit: true }, orderBy: { createdAt: 'desc' } },
      },
    }),
    // Umowy klienta: jako główny kupujący LUB współkupujący (ContractClient).
    prisma.contract.findMany({
      where: { OR: [{ clientId: params.id }, { contractClients: { some: { clientId: params.id } } }] },
      orderBy: { createdAt: 'desc' },
      include: {
        contractUnits: {
          include: {
            unit: {
              select: {
                id: true, number: true, type: true, status: true, priceGross: true,
                reservationType: true, reservationExpiresAt: true,
              },
            },
          },
        },
        client: { select: { id: true, firstName: true, lastName: true } },
        stages: true,
        annexes: { orderBy: { createdAt: 'desc' } },
        contractClients: { include: { client: { select: { id: true, firstName: true, lastName: true } } } },
        // Filtr eventów PRZED take — inaczej szum (EDYCJA_SKLADNIKOW, WYSLANO_MAILEM)
        // zjadałby budżet 50 i wypychał z osi stare zdarzenia istotne.
        // Lista zsynchronizowana z CONTRACT_EVENT_TITLES w lib/client-portfolio.ts.
        history: {
          where: { event: { in: ['UTWORZONO', 'UTWORZONA', 'ZMIANA_STATUSU', 'ZMIANA_ETAPU', 'ANEKS', 'WSPOLKUPUJACY'] } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    }),
    prisma.unit.findMany({ orderBy: { number: 'asc' } }),
    prisma.user.findMany({
      select: { id: true, name: true, preferredName: true, email: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    }),
    // Aktywne połączenie OAuth z Google Calendar (moduł Kalendarz) —
    // steruje checkboxem „Dodaj do Kalendarza Google" w formularzu działania.
    prisma.calendarToken.findFirst({ select: { id: true } }),
    // Otwarte zadania klienta (ręczne + z reguł) — sekcja „Zaplanowane".
    prisma.task.findMany({
      where: { clientId: params.id, status: 'OTWARTE' },
      orderBy: [{ pinned: 'desc' }, { dueAt: 'asc' }],
      select: { id: true, title: true, description: true, type: true, dueAt: true, pinned: true, source: true },
    }),
    // Oferty klienta — lejek przed umową, panel „Oferty" + kafel etapu w KPI.
    prisma.offer.findMany({
      where: { clientId: params.id },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { position: 'asc' }, select: { label: true } } },
    }),
  ])

  if (!client) notFound()

  // Cennik z dnia umowy (PriceHistory) dla lokali z aktywnych umów — do rabatów.
  const activeUnitIds = [...new Set(contracts.filter(isActiveContract).flatMap((c) => c.contractUnits.map((cu) => cu.unitId)))]
  const priceHistory = activeUnitIds.length
    ? await prisma.priceHistory.findMany({
        where: { unitId: { in: activeUnitIds } },
        orderBy: { changedAt: 'asc' },
        select: { unitId: true, priceGross: true, changedAt: true },
      })
    : []
  const historyByUnit = groupPriceHistory(priceHistory)

  const activeContracts = contracts.filter(isActiveContract)
  const archivedContracts = contracts.filter((c) => !isActiveContract(c))
  const dealCards = activeContracts.map((c) => buildDealCardData(c, client.id, historyByUnit))
  const portfolioRows = buildPortfolioRows(client.clientUnits, contracts, historyByUnit)
  const portfolioSums = computePortfolioSums(portfolioRows)
  const kpi = computeClientKpi(portfolioRows, contracts)
  const flags = computeAttentionFlags(portfolioRows, contracts)
  const timeline = buildTimeline(client.activities, contracts)

  const taskRows: ClientTaskRow[] = openTasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    dueAtISO: t.dueAt?.toISOString() ?? null,
    pinned: t.pinned,
    source: t.source,
  }))

  const offerRows: ClientOfferRow[] = offers.map((o) => ({
    id: o.id,
    number: o.number,
    title: o.title,
    status: o.status,
    createdAtISO: o.createdAt.toISOString(),
    validUntilISO: o.validUntil?.toISOString() ?? null,
    totalGross: o.totalGross,
    totalDiscountGross: o.totalDiscountGross,
    itemLabels: o.items.map((i) => i.label),
  }))
  // Najdalsza oferta do kafla KPI (gdy brak umów): zaakceptowana > wysłana > szkic;
  // odrzucone/anulowane pomijamy. Lista jest posortowana malejąco po dacie,
  // więc przy remisie wygrywa najnowsza.
  const OFFER_RANK: Record<string, number> = { ZAAKCEPTOWANA: 3, WYSLANA: 2, SZKIC: 1 }
  const topOffer = offers
    .filter((o) => OFFER_RANK[o.status])
    .sort((a, b) => OFFER_RANK[b.status] - OFFER_RANK[a.status])[0] ?? null

  const assignedUnitIds = client.clientUnits.map((cu) => cu.unitId)
  // Available = not already assigned and not sold/hard-reserved by someone else
  const availableUnits = allUnits.filter(
    (u) =>
      !assignedUnitIds.includes(u.id) &&
      u.status !== 'SPRZEDANY' &&
      u.reservationType !== 'REZERWACJA',
  )

  // Meta pod nazwiskiem: klient od · źródło (lokal jest teraz w pasku KPI)
  const heroMeta = [
    `Klient od ${formatDate(client.createdAt)}`,
    client.source ? `Źródło: ${client.source}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      {/* Powrót do listy */}
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 -mt-1.5 mb-4 -ml-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        ← Klienci
      </Link>

      {/* Hero: avatar-inicjały + nazwisko + status + meta + akcje */}
      <div className="flex items-center gap-[18px] mb-4 flex-wrap v2-card-in">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-[19px] font-bold text-white flex-shrink-0"
          style={{ background: 'var(--gradient-brand)', boxShadow: 'var(--shadow-sm)' }}
        >
          {(client.firstName[0] || '') + (client.lastName[0] || '')}
        </div>
        <div className="flex-1 min-w-[200px]">
          {/* flex-col na mobile: status-changer zawsze zaczyna nowy wiersz od lewej krawędzi,
              dzięki czemu jego dropdown (absolute left-0) nigdy nie ucieka poza ekran 375px
              gdy imię+nazwisko jest krótkie i badge zmieściłby się w tej samej linii. */}
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <h1 className="text-2xl font-bold text-gray-900" style={{ letterSpacing: '-0.01em' }}>
              {client.firstName} {client.lastName}
            </h1>
            <ClientStatusChanger clientId={client.id} currentStatus={client.status as ClientStatus} />
          </div>
          {heroMeta && <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>{heroMeta}</p>}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/oferty/nowa"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--accent)' }}
          >
            + Nowa oferta
          </Link>
          <Link href={`/clients/${client.id}/edit`}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Edytuj
          </Link>
          <DeleteClientButton id={client.id} name={`${client.firstName} ${client.lastName}`} />
        </div>
      </div>

      {/* Pasek KPI: co i za ile kupił + flagi „Wymaga uwagi" */}
      <div className="mb-4 v2-card-in" style={{ animationDelay: '.05s' }}>
        <ClientSummaryBar
          kpi={kpi}
          flags={flags}
          clientId={client.id}
          unitCount={client.clientUnits.length}
          topOffer={topOffer ? { id: topOffer.id, status: topOffer.status } : null}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Lewa (szeroka): umowy + portfel lokali + historia działań */}
        <div className="lg:col-span-2 space-y-4">
          {/* Umowy — karty transakcji */}
          <div className="v2-card-in" style={{ animationDelay: '.08s' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Umowy</h2>
              <Link href={`/sales/new?clientId=${client.id}`}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                + Nowa
              </Link>
            </div>
            {dealCards.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
                <p className="text-gray-400 text-sm">Brak umów</p>
                <div className="mt-3">
                  <PromoteReservationButton clientId={client.id} unitCount={client.clientUnits.length} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {dealCards.map((deal) => (
                  <ContractDealCard key={deal.id} deal={deal} />
                ))}
                <PromoteReservationButton clientId={client.id} unitCount={client.clientUnits.length} />
              </div>
            )}
            {archivedContracts.length > 0 && (
              <details className="mt-3">
                <summary className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer font-medium select-none">
                  Umowy archiwalne ({archivedContracts.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {archivedContracts.map((c) => (
                    <Link key={c.id} href={`/sales/${c.id}`} prefetch={false}
                      className="flex gap-3 items-center p-2.5 rounded-lg bg-white border border-gray-100 hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{c.number}</p>
                        <p className="text-xs text-gray-500">{CONTRACT_TYPE_LABELS[c.type as ContractType]}</p>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${CONTRACT_STATUS_COLORS[c.status as ContractStatus]}`}>
                        {CONTRACT_STATUS_LABELS[c.status as ContractStatus]}
                      </span>
                    </Link>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Oferty — lejek przed umową */}
          <div className="v2-card-in" style={{ animationDelay: '.10s' }}>
            <ClientOffersPanel offers={offerRows} hasContracts={dealCards.length > 0} />
          </div>

          {/* Portfel lokali: co, za ile, z jakim rabatem */}
          <div className="v2-card-in" style={{ animationDelay: '.12s' }}>
            <ClientUnitsPanel clientId={client.id} rows={portfolioRows} sums={portfolioSums} availableUnits={availableUnits} />
          </div>

          {/* Historia działań: aktywności + zdarzenia umów */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 v2-card-in" style={{ animationDelay: '.16s' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Historia działań</h2>
            </div>
            <ActivityForm clientId={client.id} calendarConnected={!!calendarToken} />
            <div className="mt-5">
              <ClientTimeline items={timeline} />
            </div>
          </div>
        </div>

        {/* Prawa (wąska): zaplanowane + dane osobowe + serwis + notatki */}
        <div className="lg:col-span-1 space-y-4">
          {/* Zaplanowane działania (zadania z pulpitu przypięte do klienta) */}
          <div className="v2-card-in" style={{ animationDelay: '.07s' }}>
            <ClientTasksPanel clientId={client.id} tasks={taskRows} />
          </div>

          {/* Personal data */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 v2-card-in" style={{ animationDelay: '.09s' }}>
            <h2 className="font-semibold text-gray-900 mb-3.5">Dane osobowe</h2>
            <div className="space-y-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase" style={{ letterSpacing: '.1em', color: 'var(--text-muted)' }}>
                  Opiekun
                </span>
                <ClientOwnerChanger clientId={client.id} ownerId={client.ownerId} users={users} />
              </div>
              <DataRow label="Imię i nazwisko" value={`${client.firstName} ${client.lastName}`} />
              <DataRow label="Telefon" value={client.phone || '—'} href={client.phone ? `tel:${client.phone}` : undefined} />
              {client.phone2 && <DataRow label="Telefon 2" value={client.phone2} href={`tel:${client.phone2}`} />}
              <DataRow label="E-mail" value={client.email || '—'} href={client.email ? `mailto:${client.email}` : undefined} />
              <DataRow label="PESEL" value={client.pesel || '—'} />
              {client.nip && <DataRow label="NIP" value={client.nip} />}
              <DataRow label="Adres" value={[client.address, client.zipCode, client.city].filter(Boolean).join(', ') || '—'} />
            </div>
          </div>

          {/* Service requests */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 v2-card-in" style={{ animationDelay: '.15s' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Serwis / Usterki</h2>
              <Link href={`/service/new?clientId=${client.id}`}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                + Nowe
              </Link>
            </div>
            {client.serviceRequests.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak zgłoszeń</p>
            ) : (
              <div className="space-y-2">
                {client.serviceRequests.map((s) => (
                  <Link key={s.id} href={`/service/${s.id}`}
                    className="flex gap-3 items-start p-2 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                      <p className="text-xs text-gray-500">{s.unit?.number || 'Brak lokalu'}</p>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SERVICE_STATUS_COLORS[s.status as ServiceStatus]}`}>
                        {SERVICE_STATUS_LABELS[s.status as ServiceStatus]}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          {client.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 v2-card-in" style={{ animationDelay: '.21s' }}>
              <h2 className="font-semibold text-gray-900 mb-3.5">Notatki</h2>
              <div
                className="px-3.5 py-3 rounded-[10px] text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap"
                style={{ background: 'var(--surface-alt)' }}
              >
                {client.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Etykieta nad wartością (styl v2) zamiast dwóch kolumn
function DataRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[10px] font-semibold uppercase"
        style={{ letterSpacing: '.1em', color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      {href ? (
        <a href={href} className="text-sm text-blue-600 hover:text-blue-700">{value}</a>
      ) : (
        <span className="text-sm text-gray-900">{value}</span>
      )}
    </div>
  )
}
