/**
 * Import kontrahentów budowlanych z Finansów (Vendor) do rejestru wykonawców (Subcontractor).
 * Moduł Budowa — zasilenie dropdownu "wykonawca" w harmonogramie i check-inie.
 *
 * Bierze TYLKO Vendor.category DOSTAWCA i PODWYKONAWCA (aktywnych) — banki, leasingi,
 * urzędy i "stałe" (Play/Toya itd. jeśli mają inną kategorię) zostają w Finansach.
 * Pomija kontrahentów, którzy już są w rejestrze wykonawców (dopasowanie po NIP,
 * a gdy brak NIP — po nazwie bez wielkości liter).
 *
 * UWAGA: subkontrahenci STAFFY (Janpol, PATRIMEX, Bauma...) są w Finansach tylko
 * NAPISAMI na fakturach (PurchaseInvoice.subVendor), nie kontrahentami — ten skrypt
 * ich nie widzi. Jeśli mają być wybieralni w harmonogramie, dodaj ich ręcznie
 * w /przeroby/podwykonawcy.
 *
 * Docelowy mostek Vendor↔Subcontractor (FK vendorId) = Etap 3 modułu Budowa;
 * ten skrypt przygotowuje dane (zgodne NIP-y ułatwią auto-dopasowanie).
 *
 * Uruchomienie:  node scripts/import-subcontractors-from-vendors.js          (DRY-RUN)
 *                node scripts/import-subcontractors-from-vendors.js --commit (zapis)
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const COMMIT = process.argv.includes('--commit')
const CATEGORIES = ['DOSTAWCA', 'PODWYKONAWCA']

function norm(s) {
  return (s || '').trim().toLowerCase()
}

async function main() {
  console.log(COMMIT ? '== ZAPIS ==' : '== DRY-RUN (bez zmian; --commit zapisuje) ==')

  const [vendors, subs, skippedCats] = await Promise.all([
    prisma.vendor.findMany({
      where: { isActive: true, category: { in: CATEGORIES } },
      select: { id: true, name: true, nip: true, category: true, notes: true },
      orderBy: { name: 'asc' },
    }),
    prisma.subcontractor.findMany({ select: { name: true, nip: true } }),
    prisma.vendor.groupBy({
      by: ['category'],
      where: { isActive: true, category: { notIn: CATEGORIES } },
      _count: true,
    }),
  ])

  const subNips = new Set(subs.map((s) => norm(s.nip)).filter(Boolean))
  const subNames = new Set(subs.map((s) => norm(s.name)))

  const toImport = []
  const skipped = []
  for (const v of vendors) {
    const nipMatch = v.nip && subNips.has(norm(v.nip))
    const nameMatch = subNames.has(norm(v.name))
    if (nipMatch || nameMatch) skipped.push(`${v.name} (już w rejestrze${nipMatch ? ', NIP' : ''})`)
    else toImport.push(v)
  }

  console.log(`\nKontrahenci Finansów (${CATEGORIES.join('/')}): ${vendors.length}`)
  if (skippedCats.length) {
    console.log(
      'Pominięte kategorie:',
      skippedCats.map((c) => `${c.category}×${c._count}`).join(', '),
    )
  }
  console.log(`Już w rejestrze wykonawców: ${skipped.length}`)
  for (const s of skipped) console.log('  =', s)
  console.log(`Do importu: ${toImport.length}`)
  for (const v of toImport) console.log(`  + ${v.name}${v.nip ? ' (NIP ' + v.nip + ')' : ''} [${v.category}]`)

  if (!COMMIT || toImport.length === 0) {
    if (!COMMIT && toImport.length > 0) console.log('\nUruchom z --commit żeby zapisać.')
    return
  }

  for (const v of toImport) {
    await prisma.subcontractor.create({
      data: {
        name: v.name.trim(),
        nip: v.nip || null,
        notes: `Zaimportowany z kontrahentów Finansów (${v.category}).`,
      },
    })
  }
  console.log(`\nZapisano ${toImport.length} wykonawców. Widoczni w /przeroby/podwykonawcy i w dropdownach Budowy.`)
}

main()
  .catch((e) => {
    console.error('BŁĄD:', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
