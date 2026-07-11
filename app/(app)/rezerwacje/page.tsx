import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Clock, Lock, Ban, AlertTriangle } from 'lucide-react'
import { expireSoftReservations, attachReservedByClient } from '@/lib/reservations'
import { formatDate } from '@/lib/utils'
import { ExtendButton, ReleaseButton, SwapButton, RestoreFromUnavailableButton, MuteAlertsButton } from '@/components/reservations/ReservationActions'
import { NewReservationModal } from '@/components/reservations/NewReservationModal'
import { PromoteReservationButton } from '@/components/clients/PromoteReservationButton'

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(d))
}

function hoursLeft(d: Date | null | undefined): number {
  if (!d) return 0
  return Math.max(0, Math.round((new Date(d).getTime() - Date.now()) / 3600_000))
}

function expiryBadge(hoursLeft: number) {
  if (hoursLeft <= 24) return 'bg-red-50 text-red-700 border-red-200'
  if (hoursLeft <= 72) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-blue-50 text-blue-700 border-blue-200'
}

function expiryLabel(hoursLeft: number) {
  if (hoursLeft <= 1) return '< 1h'
  if (hoursLeft < 24) return `${hoursLeft}h`
  const days = Math.floor(hoursLeft / 24)
  const h = hoursLeft % 24
  return h > 0 ? `${days}d ${h}h` : `${days} dni`
}

export default async function ReservationsPage() {
  // Wymuś auto-expire (jak na liście /units) — gdyby cron padł, wciąż zwalniamy
  // przeterminowane przed wyświetleniem.
  await expireSoftReservations()

  // 3 sekcje + dane do modalu „Nowa rezerwacja" (klienci + wolne lokale) równolegle.
  const [softUnits, hardUnits, unavailableUnits, allClients, freeUnits] = await Promise.all([
    prisma.unit.findMany({
      where: { status: 'ZAREZERWOWANY', reservationType: 'MIEKKA' },
      orderBy: { reservationExpiresAt: 'asc' },
    }),
    prisma.unit.findMany({
      where: { status: 'ZAREZERWOWANY', reservationType: 'REZERWACJA' },
      orderBy: { updatedAt: 'desc' },
      include: {
        contractUnits: {
          where: { contract: { status: 'PODPISANA' } },
          include: { contract: { select: { id: true, number: true, signedAt: true, type: true } } },
        },
      },
    }),
    prisma.unit.findMany({
      where: { status: 'NIEDOSTEPNY' },
      orderBy: { number: 'asc' },
    }),
    prisma.client.findMany({
      select: { id: true, firstName: true, lastName: true, phone: true },
      orderBy: { lastName: 'asc' },
    }),
    prisma.unit.findMany({
      where: { status: 'WOLNY' },
      select: { id: true, number: true, type: true, priceGross: true },
      orderBy: { number: 'asc' },
    }),
  ])

  const soft = await attachReservedByClient(softUnits)
  const hard = await attachReservedByClient(hardUnits)

  const criticalCount = soft.filter((u) => hoursLeft(u.reservationExpiresAt) <= 24).length

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold text-gray-900" style={{ letterSpacing: '-0.02em' }}>Rezerwacje</h1>
          <p className="text-gray-500 text-sm mt-1.5 max-w-2xl">
            Stan rezerwacji lokali — miękkie (z czasem), twarde (umowa rezerwacyjna) i wyłączenia ze sprzedaży.
          </p>
        </div>
        <NewReservationModal clients={allClients} units={freeUnits} />
      </div>

      {/* Banner krytyczne */}
      {criticalCount > 0 && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-red-900">
              {criticalCount} rezerwacja{criticalCount === 1 ? '' : criticalCount < 5 ? 'e' : 'i'} kończy się w ciągu 24h
            </p>
            <p className="text-red-800 mt-0.5">
              Skontaktuj się z klientami lub przedłuż rezerwacje, inaczej lokale wrócą do statusu „Wolny" automatycznie.
            </p>
          </div>
        </div>
      )}

      {/* Statystyki na górze — klikalne, przewijają do sekcji */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard href="#soft" icon={<Clock className="w-5 h-5 text-blue-600" />} label="Miękkie" value={soft.length} accent="blue" />
        <StatCard href="#hard" icon={<Lock className="w-5 h-5 text-purple-600" />} label="Twarde (umowa)" value={hard.length} accent="purple" />
        <StatCard href="#unavailable" icon={<Ban className="w-5 h-5 text-gray-600" />} label="Wyłączone ze sprzedaży" value={unavailableUnits.length} accent="gray" />
      </div>

      {/* SEKCJA: MIĘKKIE */}
      <Section
        icon={<Clock className="w-5 h-5 text-blue-600" />}
        id="soft"
        title={`Rezerwacje miękkie (${soft.length})`}
        description={'Lokal jest blokowany na czas określony (zwykle 7 dni). Po wygaśnięciu wraca automatycznie do „Wolny".'}
      >
        {soft.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Brak miękkich rezerwacji.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-soft)' }}>
                  <Th>Lokal</Th>
                  <Th>Klient</Th>
                  <Th>Kontakt</Th>
                  <Th>Wygasa</Th>
                  <Th>Pozostało</Th>
                  <Th right>Akcje</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {soft.map((u) => {
                  const h = hoursLeft(u.reservationExpiresAt)
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2">
                        <Link href={`/units/${u.id}`} className="font-medium text-blue-600 hover:text-blue-700">{u.number}</Link>
                      </td>
                      <td className="px-2 py-2 text-gray-700">
                        {u.reservedBy ? (
                          <Link href={`/clients/${u.reservedBy.id}`} className="hover:text-blue-700">
                            {u.reservedBy.firstName} {u.reservedBy.lastName}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-500">
                        {u.reservedBy?.phone ? <div>{u.reservedBy.phone}</div> : null}
                        {u.reservedBy?.email ? <div>{u.reservedBy.email}</div> : null}
                        {!u.reservedBy?.phone && !u.reservedBy?.email ? '—' : null}
                      </td>
                      <td className="px-2 py-2 text-gray-700">{fmtDateTime(u.reservationExpiresAt)}</td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${expiryBadge(h)}`}>{expiryLabel(h)}</span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {u.reservedBy && <PromoteReservationButton clientId={u.reservedBy.id} variant="compact" />}
                          <ExtendButton unitId={u.id} defaultDays={7} />
                          <SwapButton unitId={u.id} unitNumber={u.number} unitType={u.type} />
                          <MuteAlertsButton unitId={u.id} muted={u.reservationAlertsMuted} />
                          <ReleaseButton unitId={u.id} unitNumber={u.number} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* SEKCJA: TWARDE */}
      <Section
        icon={<Lock className="w-5 h-5 text-purple-600" />}
        id="hard"
        title={`Rezerwacje twarde — umowa rezerwacyjna (${hard.length})`}
        description="Lokal zarezerwowany podpisaną umową. Zwalniany przez zmianę statusu umowy (Rozwiązana / Anulowana)."
      >
        {hard.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Brak twardych rezerwacji.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-soft)' }}>
                  <Th>Lokal</Th>
                  <Th>Klient</Th>
                  <Th>Umowa</Th>
                  <Th>Data podpisania</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hard.map((u) => {
                  const cu = u.contractUnits[0]
                  const contract = cu?.contract ?? null
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2">
                        <Link href={`/units/${u.id}`} className="font-medium text-blue-600 hover:text-blue-700">{u.number}</Link>
                      </td>
                      <td className="px-2 py-2 text-gray-700">
                        {u.reservedBy ? (
                          <Link href={`/clients/${u.reservedBy.id}`} className="hover:text-blue-700">
                            {u.reservedBy.firstName} {u.reservedBy.lastName}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {contract ? (
                          <Link href={`/sales/${contract.id}`} className="text-blue-600 hover:text-blue-700 font-mono text-xs">{contract.number}</Link>
                        ) : <span className="text-gray-400 text-xs">brak aktywnej</span>}
                      </td>
                      <td className="px-2 py-2 text-gray-700">{contract?.signedAt ? formatDate(contract.signedAt) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* SEKCJA: WYŁĄCZONE */}
      <Section
        icon={<Ban className="w-5 h-5 text-gray-600" />}
        id="unavailable"
        title={`Wyłączone ze sprzedaży (${unavailableUnits.length})`}
        description="Lokale tymczasowo nieoferowane (np. przed wprowadzeniem do sprzedaży, zarezerwowane wewnętrznie)."
      >
        {unavailableUnits.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Wszystkie lokale są w sprzedaży.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-soft)' }}>
                  <Th>Lokal</Th>
                  <Th>Typ</Th>
                  <Th>Budynek</Th>
                  <Th>Opis</Th>
                  <Th right>Akcje</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {unavailableUnits.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2">
                      <Link href={`/units/${u.id}`} className="font-medium text-blue-600 hover:text-blue-700">{u.number}</Link>
                    </td>
                    <td className="px-2 py-2 text-gray-700">{u.type}</td>
                    <td className="px-2 py-2 text-gray-700">{u.building || '—'}</td>
                    <td className="px-2 py-2 text-gray-500 text-xs max-w-md truncate">{u.description || '—'}</td>
                    <td className="px-2 py-2 text-right">
                      <RestoreFromUnavailableButton unitId={u.id} unitNumber={u.number} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

function StatCard({ href, icon, label, value, accent }: { href: string; icon: React.ReactNode; label: string; value: number; accent: 'blue' | 'purple' | 'gray' }) {
  const ring: Record<string, string> = { blue: 'bg-blue-50 border-blue-200 hover:border-blue-300', purple: 'bg-purple-50 border-purple-200 hover:border-purple-300', gray: 'bg-gray-50 border-gray-200 hover:border-gray-300' }
  return (
    <a href={href} className={`rounded-xl border px-[18px] py-4 flex items-center gap-3.5 transition-colors ${ring[accent]}`}>
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-gray-600">{label}</p>
        <p className="text-[26px] font-bold text-gray-900 tabular-nums">{value}</p>
      </div>
    </a>
  )
}

// Nagłówek kolumny w stylu v2 (11px, weight 600, letter-spacing, text-muted)
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-2 py-2.5 text-[11px] font-semibold uppercase ${right ? 'text-right' : 'text-left'}`}
      style={{ letterSpacing: '.06em', color: 'var(--text-muted)' }}
    >
      {children}
    </th>
  )
}

function Section({ id, icon, title, description, children }: { id?: string; icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="bg-white rounded-xl border border-gray-200 p-5 mb-5 scroll-mt-6">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">{icon}<h2 className="font-semibold text-gray-900">{title}</h2></div>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
      {children}
    </div>
  )
}
