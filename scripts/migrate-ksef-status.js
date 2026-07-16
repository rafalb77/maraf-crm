// Migracja statusow faktur pobranych z KSeF:
//  A) faktury z KSeF (nie zatwierdzone recznie, bez platnosci) w statusie
//     ZATWIERDZONA/WPROWADZONA  ->  POBRANA
//  B) faktury ING Leasing z KSeF (platnosc automatyczna) -> OPLACONA + pelna
//     platnosc (polecenie zaplaty; data = termin lub wystawienie)
//
// Ten sam efekt daje kolejna synchronizacja KSeF (krok 0 migracji w kliencie),
// ale skrypt pozwala zrobic to od razu. Idempotentny.
//
// Uzycie (Coolify Terminal):
//   node scripts/migrate-ksef-status.js            # dry-run
//   node scripts/migrate-ksef-status.js --commit   # zapis

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const COMMIT = process.argv.includes('--commit')

const isIngLeasing = (name) => /ing\s*leas/i.test(name || '')

// Faktury POCHODZACE z KSeF, nie tkniete recznie (jak w reconcile klienta).
const KSEF_OWNED = {
  ksefNumber: { not: null },
  createdById: null,
  importSheet: null,
  sourceSalesInvoiceId: null,
  description: { startsWith: 'Z KSeF' },
}

async function main() {
  console.log(COMMIT ? '== TRYB ZAPISU (--commit) ==' : '== DRY-RUN (bez zmian; --commit zapisuje) ==')

  // --- B) ING Leasing -> OPLACONA (najpierw, zanim polecimy reszcie POBRANA) ---
  const ingCandidates = await prisma.purchaseInvoice.findMany({
    where: {
      ...KSEF_OWNED,
      status: { in: ['ZATWIERDZONA', 'WPROWADZONA', 'POBRANA'] },
      payments: { none: {} },
      vendor: { name: { contains: 'ING', mode: 'insensitive' } },
    },
    select: { id: true, number: true, amountGross: true, dueDate: true, issueDate: true, vendor: { select: { name: true } } },
  })
  const ing = ingCandidates.filter((i) => isIngLeasing(i.vendor.name) && i.amountGross > 0)
  console.log(`\n--- ING Leasing -> OPLACONA (${ing.length}) ---`)
  for (const i of ing) console.log(`  ${i.number} (${i.vendor.name}, ${i.amountGross} zl)`)
  if (COMMIT) {
    for (const i of ing) {
      await prisma.$transaction([
        prisma.purchaseInvoice.update({ where: { id: i.id }, data: { status: 'OPLACONA' } }),
        prisma.purchaseInvoicePayment.create({
          data: { invoiceId: i.id, amount: i.amountGross, paidAt: i.dueDate || i.issueDate, reference: 'Leasing — polecenie zaplaty (auto)' },
        }),
      ])
    }
  }

  // --- A) reszta KSeF-owych -> POBRANA (bez ING, bez platnosci, bez APPROVE) ---
  const ingIds = new Set(ing.map((i) => i.id))
  const toPobrana = await prisma.purchaseInvoice.findMany({
    where: {
      ...KSEF_OWNED,
      status: { in: ['ZATWIERDZONA', 'WPROWADZONA'] },
      payments: { none: {} },
      approvals: { none: { action: { in: ['APPROVE', 'APPROVED'] } } },
    },
    select: { id: true, number: true, status: true },
  })
  const pobrana = toPobrana.filter((i) => !ingIds.has(i.id))
  console.log(`\n--- -> POBRANA (${pobrana.length}) ---`)
  const byStatus = {}
  for (const i of pobrana) byStatus[i.status] = (byStatus[i.status] || 0) + 1
  console.log('  z:', JSON.stringify(byStatus))
  if (COMMIT && pobrana.length) {
    await prisma.purchaseInvoice.updateMany({ where: { id: { in: pobrana.map((i) => i.id) } }, data: { status: 'POBRANA' } })
  }

  console.log(`\n${COMMIT ? 'Zapisano' : 'Do zapisania'}: ${ing.length} -> OPLACONA, ${pobrana.length} -> POBRANA.`)
  if (!COMMIT) console.log('Uruchom z --commit aby zapisac.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
