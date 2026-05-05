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
