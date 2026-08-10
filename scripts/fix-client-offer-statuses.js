/* eslint-disable */
/**
 * Backfill statusów klientów wg wysłanych/zaakceptowanych ofert.
 *
 * Każdy klient ze statusem ZAPYTANIE, który ma ofertę o statusie WYSLANA
 * lub ZAAKCEPTOWANA, dostaje status 'OFERTA'. Klientów dalej w lejku
 * (OFERTA / REZERWACJA / UMOWA / ODBIOR) skrypt NIE rusza. Idempotentny.
 *
 * Od 10.08.2026 automat robi to na bieżąco (lib/client-status.ts przy zmianie
 * statusu oferty i wysyłce mailem) — ten skrypt domyka klientów z ofertami
 * wysłanymi PRZED wdrożeniem automatu.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/fix-client-offer-statuses.js            # dry-run (tylko podgląd)
 *   node scripts/fix-client-offer-statuses.js --apply    # zapis do bazy
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const apply = process.argv.includes('--apply')

async function main() {
  const candidates = await prisma.client.findMany({
    where: {
      status: 'ZAPYTANIE',
      offers: { some: { status: { in: ['WYSLANA', 'ZAAKCEPTOWANA'] } } },
    },
    select: { id: true, firstName: true, lastName: true, status: true },
  })

  console.log(`Do podniesienia na OFERTA: ${candidates.length}`)
  for (const c of candidates) {
    console.log(`  - ${c.lastName} ${c.firstName}  (${c.status} -> OFERTA)`)
  }

  if (!apply) {
    console.log('\nDRY-RUN. Uruchom z --apply, aby zapisać zmiany.')
    return
  }

  const result = await prisma.client.updateMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    data: { status: 'OFERTA' },
  })
  console.log(`\nZaktualizowano ${result.count} klientów.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
