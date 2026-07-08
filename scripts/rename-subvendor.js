// Ujednolicenie etykiety podwykonawcy (subVendor) na fakturach kosztowych.
//
// subVendor to robocza etykieta z Excela (np. "Banaszczyk", "BANASZCZYK")
// na fakturach pod parasolami (STAFFA itd.) — NIE vendor. Gdy ta sama firma
// istnieje tez jako prawdziwy vendor z KSeF (np. "Rafał Banaszczyk Firma
// Budowlano-Remontowa"), ujednolicenie etykiety scala obie pozycje na
// pulpicie finansow (TOP10 grupuje po nazwie wykonawcy), a faktury zostaja
// pod parasolem (foldery i historia importu nietkniete).
//
// Match: subVendor rowne staremu case-insensitive (zlapie "Banaszczyk"
// i "BANASZCZYK" naraz).
//
// Uzycie (Coolify Terminal):
//   node scripts/rename-subvendor.js "Banaszczyk" "Rafał Banaszczyk Firma Budowlano-Remontowa"            # dry-run
//   node scripts/rename-subvendor.js "Banaszczyk" "Rafał Banaszczyk Firma Budowlano-Remontowa" --commit   # zapis

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const args = process.argv.slice(2).filter((a) => a !== '--commit')
const COMMIT = process.argv.includes('--commit')

async function main() {
  const [from, to] = args
  if (!from || !to) {
    console.log('Uzycie: node scripts/rename-subvendor.js "<stara etykieta>" "<nowa etykieta>" [--commit]')
    process.exit(1)
  }
  console.log(COMMIT ? '== TRYB ZAPISU (--commit) ==' : '== DRY-RUN (bez zmian; --commit zapisuje) ==')

  const invoices = await prisma.purchaseInvoice.findMany({
    where: { subVendor: { equals: from, mode: 'insensitive' } },
    select: {
      id: true, number: true, subVendor: true, amountGross: true,
      issueDate: true, status: true, vendor: { select: { name: true } },
    },
    orderBy: { issueDate: 'desc' },
  })

  if (!invoices.length) {
    console.log(`Brak faktur z subVendor = "${from}" (case-insensitive).`)
    return
  }

  console.log(`\nFaktury z subVendor ~ "${from}" (${invoices.length}) — nowa etykieta: "${to}"`)
  for (const i of invoices) {
    console.log(`  - ${i.number} | ${i.issueDate.toISOString().slice(0, 10)} | ${i.amountGross} zl | ${i.status} | parasol: ${i.vendor.name} | "${i.subVendor}"`)
  }

  if (!COMMIT) {
    console.log('\nDry-run zakonczony. Uruchom z --commit aby zapisac.')
    return
  }

  const res = await prisma.purchaseInvoice.updateMany({
    where: { id: { in: invoices.map((i) => i.id) } },
    data: { subVendor: to },
  })
  console.log(`\nOK: zaktualizowano ${res.count} faktur — subVendor = "${to}".`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
