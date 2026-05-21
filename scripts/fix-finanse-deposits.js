// Jednorazowy fix: zeruje BLEDNE kaucje/potracenia zaimportowane z xlsx.
// Bug: importer czytal kolumny N/P/Q (deposit/KB/prad) z zakladek STAFFA/STAŁE/INNE
// gdzie byly to smieci (numery/daty) -> absurdalne kwoty kaucji (np. 2.9e25 zl).
// Kaucje maja byc wylacznie reczne. Ten skrypt czysci wszystkie pola kaucji.
//
// Uzycie (Coolify Terminal):
//   node scripts/fix-finanse-deposits.js            # pokaze ile faktur ma kaucje
//   node scripts/fix-finanse-deposits.js --confirm  # wyzeruje
//
// UWAGA: zeruje TEZ ewentualne recznie wpisane kaucje. Jesli wpisales juz
// jakies poprawne recznie — wpisz je ponownie po uruchomieniu (powinno byc
// ich malo, bo to swiezy modul).

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const confirm = process.argv.includes('--confirm')

  const withDeposit = await prisma.purchaseInvoice.count({
    where: { OR: [{ deposit: { not: null } }, { buildingCosts: { not: null } }, { electricity: { not: null } }] },
  })

  console.log(`\nFaktur z ustawiona kaucja/KB/pradem: ${withDeposit}`)

  if (!confirm) {
    // Pokaz przyklady
    const examples = await prisma.purchaseInvoice.findMany({
      where: { deposit: { not: null } },
      select: { number: true, deposit: true, buildingCosts: true, electricity: true, vendor: { select: { name: true } } },
      take: 10,
    })
    console.log('\nPrzyklady (do 10):')
    for (const e of examples) {
      console.log(`  ${e.vendor.name} ${e.number}: kaucja=${e.deposit} KB=${e.buildingCosts} prad=${e.electricity}`)
    }
    console.log('\n=== DRY-RUN — nic nie zmienione. Dodaj --confirm zeby wyzerowac. ===\n')
    return
  }

  const res = await prisma.purchaseInvoice.updateMany({
    data: {
      deposit: null,
      depositPct: null,
      buildingCosts: null,
      electricity: null,
      depositReturnDate: null,
      depositReturnedAt: null,
    },
  })

  console.log(`\nGOTOWE. Wyzerowano pola kaucji w ${res.count} fakturach.\n`)
}

main()
  .catch((e) => { console.error('\nBLAD:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
