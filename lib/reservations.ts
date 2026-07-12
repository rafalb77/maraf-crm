import { prisma } from './prisma'

/**
 * Auto-expire any soft reservations (MIEKKA) whose expiration date has passed.
 * Called on-the-fly whenever units are fetched.
 */
export async function expireSoftReservations() {
  const now = new Date()
  const expired = await prisma.unit.findMany({
    where: {
      reservationType: 'MIEKKA',
      reservationExpiresAt: { lt: now },
    },
    select: { id: true },
  })

  if (expired.length === 0) return

  const allIds = expired.map((u) => u.id)

  // NIE zwalniaj lokali, które są składnikiem AKTYWNEJ (niezrozwiązanej/nieanulowanej)
  // umowy — to nie jest „porzucona" miękka rezerwacja, tylko lokal pod umową.
  // (Dane z importu bywają miękko-zarezerwowane mimo podpisanej umowy — bez tego
  // strażnika auto-wygasanie po cichu zwalniało je i kasowało ClientUnit.)
  const contracted = await prisma.contractUnit.findMany({
    where: {
      unitId: { in: allIds },
      contract: { status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] } },
    },
    select: { unitId: true },
  })
  const contractedSet = new Set(contracted.map((c) => c.unitId))
  const ids = allIds.filter((id) => !contractedSet.has(id))
  if (ids.length === 0) return

  await prisma.$transaction([
    prisma.unit.updateMany({
      where: { id: { in: ids } },
      data: {
        status: 'WOLNY',
        reservationType: null,
        reservationExpiresAt: null,
        reservedById: null,
        reservationAlertsMuted: false,
      },
    }),
    prisma.clientUnit.deleteMany({
      where: { unitId: { in: ids } },
    }),
  ])
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export type ReservationClient = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  ownerId: string | null
}

/**
 * Wzbogaca listę lokali o pole `reservedBy` (klient zarezerwowujący) — pobierane
 * jednym dodatkowym zapytaniem (Unit nie ma Prisma-relacji na reservedById,
 * tylko FK string). Pomija zwolnione (reservedById = null).
 */
export async function attachReservedByClient<
  T extends { reservedById: string | null }
>(units: T[]): Promise<(T & { reservedBy: ReservationClient | null })[]> {
  const ids = Array.from(new Set(units.map((u) => u.reservedById).filter((x): x is string => !!x)))
  if (ids.length === 0) return units.map((u) => ({ ...u, reservedBy: null }))
  const clients = await prisma.client.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, ownerId: true },
  })
  const byId = new Map(clients.map((c) => [c.id, c]))
  return units.map((u) => ({
    ...u,
    reservedBy: u.reservedById ? byId.get(u.reservedById) ?? null : null,
  }))
}

/**
 * Przedłuża rezerwację miękką (MIEKKA) o `days` dni od TERAZ (nie od poprzedniej
 * daty wygaśnięcia — przedłużenie liczone jest jakby od nowa). Rzuca jeśli lokal
 * nie istnieje, nie jest MIEKKA, albo days nie jest liczbą > 0.
 */
export async function extendSoftReservation(unitId: string, days: number): Promise<Date> {
  if (!Number.isFinite(days) || days <= 0) throw new Error('Liczba dni musi być > 0')
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { reservationType: true },
  })
  if (!unit) throw new Error('Lokal nie istnieje')
  if (unit.reservationType !== 'MIEKKA') {
    throw new Error('Tylko rezerwacje miękkie można przedłużyć')
  }
  const newExpiresAt = addDays(new Date(), days)
  await prisma.unit.update({
    where: { id: unitId },
    data: { reservationExpiresAt: newExpiresAt },
  })
  return newExpiresAt
}

/**
 * Zwalnia rezerwację miękką (MIEKKA) ręcznie — przed wygaśnięciem. Lokal wraca
 * do WOLNY, usuwa też wpis ClientUnit (analogicznie do auto-expire). Twarde
 * rezerwacje (REZERWACJA) zwalniane przez zmianę statusu umowy.
 */
export async function releaseSoftReservation(unitId: string): Promise<void> {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { reservationType: true },
  })
  if (!unit) throw new Error('Lokal nie istnieje')
  if (unit.reservationType !== 'MIEKKA') {
    throw new Error('Tylko rezerwacje miękkie można zwolnić tym endpointem')
  }
  await prisma.$transaction([
    prisma.unit.update({
      where: { id: unitId },
      data: {
        status: 'WOLNY',
        reservationType: null,
        reservationExpiresAt: null,
        reservedById: null,
        reservationAlertsMuted: false,
      },
    }),
    prisma.clientUnit.deleteMany({ where: { unitId } }),
  ])
}

/**
 * Zamienia jeden zarezerwowany (miękko) lokal na inny WOLNY — atomowo, zachowując
 * klienta i datę wygaśnięcia. Cross-type dozwolony (np. parking → garaż).
 * Stary lokal → WOLNY (powiązanie ClientUnit usunięte), nowy → ZAREZERWOWANY/MIEKKA.
 *
 * Walidacje: stary musi być MIEKKA, nowy musi być WOLNY i różny od starego.
 */
export async function swapSoftReservation(oldUnitId: string, newUnitId: string): Promise<{
  newReservationExpiresAt: Date | null
}> {
  if (oldUnitId === newUnitId) throw new Error('Nowy lokal musi być inny niż obecny')

  const [oldUnit, newUnit] = await Promise.all([
    prisma.unit.findUnique({
      where: { id: oldUnitId },
      select: { reservationType: true, reservationExpiresAt: true, reservedById: true, reservationAlertsMuted: true },
    }),
    prisma.unit.findUnique({
      where: { id: newUnitId },
      select: { status: true, number: true },
    }),
  ])

  if (!oldUnit) throw new Error('Obecny lokal nie istnieje')
  if (oldUnit.reservationType !== 'MIEKKA') {
    throw new Error('Zamiana dostępna tylko dla rezerwacji miękkich')
  }
  if (!newUnit) throw new Error('Nowy lokal nie istnieje')
  if (newUnit.status !== 'WOLNY') {
    throw new Error(`Lokal ${newUnit.number} nie jest wolny (status: ${newUnit.status})`)
  }

  const clientId = oldUnit.reservedById
  const expiresAt = oldUnit.reservationExpiresAt

  await prisma.$transaction(async (tx) => {
    // Zwolnij stary
    await tx.unit.update({
      where: { id: oldUnitId },
      data: { status: 'WOLNY', reservationType: null, reservationExpiresAt: null, reservedById: null, reservationAlertsMuted: false },
    })
    await tx.clientUnit.deleteMany({ where: { unitId: oldUnitId } })

    // Zarezerwuj nowy (ten sam klient + data wygaśnięcia; wyciszenie powiadomień
    // podąża za rezerwacją — to wciąż ta sama rezerwacja, tylko inny lokal)
    await tx.unit.update({
      where: { id: newUnitId },
      data: { status: 'ZAREZERWOWANY', reservationType: 'MIEKKA', reservationExpiresAt: expiresAt, reservedById: clientId, reservationAlertsMuted: oldUnit.reservationAlertsMuted },
    })
    if (clientId) {
      await tx.clientUnit.upsert({
        where: { clientId_unitId: { clientId, unitId: newUnitId } },
        create: { clientId, unitId: newUnitId },
        update: {},
      })
    }
  })

  return { newReservationExpiresAt: expiresAt }
}

/**
 * Lista rezerwacji miękkich kończących się w ciągu `hoursAhead` godzin
 * (domyślnie 48h). Używana w cron-mailerze (codzienny digest dla handlowca)
 * i banner-alertach w UI modułu Rezerwacje.
 */
export async function getExpiringSoftReservations(hoursAhead = 48) {
  const now = new Date()
  const threshold = new Date(now.getTime() + hoursAhead * 3600_000)
  const units = await prisma.unit.findMany({
    where: {
      reservationType: 'MIEKKA',
      reservationExpiresAt: { gte: now, lte: threshold },
    },
    orderBy: { reservationExpiresAt: 'asc' },
  })
  return attachReservedByClient(units)
}
