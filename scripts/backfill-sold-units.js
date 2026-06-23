/* eslint-disable */
/**
 * Backfill statusu lokali dla umów wiążących.
 *
 * Lokale umów, które są na etapie DEWELOPERSKA lub PRZENIESIENIA (wiążąca
 * sprzedaż), a nie są ROZWIAZANA/ANULOWANA, powinny mieć status SPRZEDANY.
 * Wcześniej podpisanie deweloperskiej ustawiało tylko ZAREZERWOWANY — ten skrypt
 * naprawia istniejące dane. Ustawia SPRZEDANY (reservationType=null,
 * reservedById=null) tym lokalom, które jeszcze nie są SPRZEDANE. Idempotentny.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/backfill-sold-units.js            # dry-run (podgląd)
 *   node scripts/backfill-sold-units.js --apply    # zapis
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const contracts = await prisma.contract.findMany({
    where: {
      type: { in: ['DEWELOPERSKA', 'PRZENIESIENIA'] },
      status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] },
    },
    select: {
      number: true,
      type: true,
      contractUnits: { select: { unit: { select: { id: true, number: true, status: true } } } },
    },
  })

  const toFix = new Map() // unitId -> { number, contractNumber, from }
  for (const c of contracts) {
    for (const cu of c.contractUnits) {
      if (cu.unit.status !== 'SPRZEDANY' && !toFix.has(cu.unit.id)) {
        toFix.set(cu.unit.id, { number: cu.unit.number, contractNumber: c.number, from: cu.unit.status })
      }
    }
  }

  console.log(`Umów wiążących (deweloperska/przeniesienia): ${contracts.length}`)
  console.log(`Lokali do oznaczenia SPRZEDANY: ${toFix.size}`)
  for (const [, v] of toFix) {
    console.log(`  - ${v.number} (${v.from} -> SPRZEDANY)  [umowa ${v.contractNumber}]`)
  }

  if (!apply) {
    console.log('\nDRY-RUN. Uruchom z --apply, aby zapisać.')
    return
  }

  const ids = [...toFix.keys()]
  if (ids.length === 0) {
    console.log('Nic do zmiany.')
    return
  }
  const res = await prisma.unit.updateMany({
    where: { id: { in: ids } },
    data: { status: 'SPRZEDANY', reservationType: null, reservationExpiresAt: null, reservedById: null },
  })
  console.log(`\nZaktualizowano ${res.count} lokali na SPRZEDANY.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
