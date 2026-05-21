// Czyszczenie wszystkich danych modulu Finanse — do re-importu po zmianach w importerze.
//
// Uzycie (Coolify Terminal):
//   node scripts/wipe-finanse.js              # dry-run (pokaze ile rekordow skasuje)
//   node scripts/wipe-finanse.js --confirm    # faktyczne usuniecie
//
// Kolejnosc: platnosci/akceptacje/zalaczniki (cascade na invoice i tak je usuwa,
// ale liczymy je osobno dla raportu) -> faktury -> vendory.
// NIE rusza User, Settings ani innych modulow.

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const confirm = process.argv.includes('--confirm')

  const [payments, approvals, attachments, invoices, vendors] = await Promise.all([
    prisma.purchaseInvoicePayment.count(),
    prisma.purchaseInvoiceApproval.count(),
    prisma.purchaseInvoiceAttachment.count(),
    prisma.purchaseInvoice.count(),
    prisma.vendor.count(),
  ])

  console.log('\nStan tabel Finansow:')
  console.log(`  PurchaseInvoicePayment:    ${payments}`)
  console.log(`  PurchaseInvoiceApproval:   ${approvals}`)
  console.log(`  PurchaseInvoiceAttachment: ${attachments}`)
  console.log(`  PurchaseInvoice:           ${invoices}`)
  console.log(`  Vendor:                    ${vendors}`)

  if (!confirm) {
    console.log('\n=== DRY-RUN — nic nie skasowane. Dodaj --confirm zeby wyczyscic. ===\n')
    return
  }

  console.log('\nKasuje...')
  // onDelete: Cascade na invoice usuwa payments/approvals/attachments,
  // ale robimy jawnie zeby miec licznik i pewnosc kolejnosci.
  await prisma.purchaseInvoicePayment.deleteMany({})
  await prisma.purchaseInvoiceApproval.deleteMany({})
  await prisma.purchaseInvoiceAttachment.deleteMany({})
  const delInvoices = await prisma.purchaseInvoice.deleteMany({})
  const delVendors = await prisma.vendor.deleteMany({})

  console.log(`\nGOTOWE.`)
  console.log(`  Faktur usunieto:   ${delInvoices.count}`)
  console.log(`  Vendorow usunieto: ${delVendors.count}`)
  console.log(`\nTeraz mozesz zaimportowac od nowa: /finanse/import (UI) lub node scripts/import-finanse.js <plik> --commit\n`)
}

main()
  .catch((e) => { console.error('\nBLAD:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
