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

  const ids = expired.map((u) => u.id)

  await prisma.$transaction([
    prisma.unit.updateMany({
      where: { id: { in: ids } },
      data: {
        status: 'WOLNY',
        reservationType: null,
        reservationExpiresAt: null,
        reservedById: null,
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
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
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
      },
    }),
    prisma.clientUnit.deleteMany({ where: { unitId } }),
  ])
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
