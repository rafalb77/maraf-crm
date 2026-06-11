/* eslint-disable */
/**
 * Backfill statusów klientów wg podpisanych umów.
 *
 * Każdy klient (główny + współrezerwujący) powiązany z umową o statusie
 * PODPISANA dostaje status 'UMOWA', o ile jego obecny status jest niższy
 * w lejku (ZAPYTANIE / OFERTA / REZERWACJA). Klientów już na UMOWA lub
 * ODBIOR skrypt NIE rusza (nie cofa lejka). Idempotentny.
 *
 * Uwaga: bierze pod uwagę WYŁĄCZNIE umowy, które mają w bazie status
 * PODPISANA. Umowy podpisane „w realu", ale nieoznaczone w CRM, najpierw
 * oznacz przyciskiem „Oznacz jako podpisaną" na karcie umowy.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/fix-client-statuses.js            # dry-run (tylko podgląd)
 *   node scripts/fix-client-statuses.js --apply    # zapis do bazy
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const BELOW_UMOWA = ['ZAPYTANIE', 'OFERTA', 'REZERWACJA']
const apply = process.argv.includes('--apply')

async function main() {
  const signed = await prisma.contract.findMany({
    where: { status: 'PODPISANA' },
    select: {
      clientId: true,
      contractClients: { select: { clientId: true } },
    },
  })

  const clientIds = new Set()
  for (const c of signed) {
    clientIds.add(c.clientId)
    for (const cc of c.contractClients) clientIds.add(cc.clientId)
  }

  const candidates = await prisma.client.findMany({
    where: { id: { in: [...clientIds] }, status: { in: BELOW_UMOWA } },
    select: { id: true, firstName: true, lastName: true, status: true },
  })

  console.log(`Umów PODPISANA:           ${signed.length}`)
  console.log(`Klientów powiązanych:     ${clientIds.size}`)
  console.log(`Do podniesienia na UMOWA: ${candidates.length}`)
  for (const c of candidates) {
    console.log(`  - ${c.lastName} ${c.firstName}  (${c.status} -> UMOWA)`)
  }

  if (!apply) {
    console.log('\nDRY-RUN. Uruchom z --apply, aby zapisać zmiany.')
    return
  }

  const result = await prisma.client.updateMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    data: { status: 'UMOWA' },
  })
  console.log(`\nZaktualizowano ${result.count} klientów.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
