import { prisma } from './prisma'

/**
 * Podbicie statusu klienta w lejku sprzedażowym — nigdy nie cofa.
 * Jedyny automat: ZAPYTANIE → OFERTA przy wysłaniu/zaakceptowaniu oferty.
 * updateMany z warunkiem na status = atomowe i bezpieczne: klient będący
 * dalej w lejku (OFERTA/REZERWACJA/UMOWA/ODBIOR) pozostaje nietknięty.
 */
export async function advanceClientToOferta(clientId: string): Promise<void> {
  await prisma.client.updateMany({
    where: { id: clientId, status: 'ZAPYTANIE' },
    data: { status: 'OFERTA' },
  })
}
