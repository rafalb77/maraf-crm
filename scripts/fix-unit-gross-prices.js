/* eslint-disable */
/**
 * Naprawa cen brutto lokali wycenianych za m² po zmianie reguły liczenia
 * (lib/unit-pricing.ts): brutto lokalu = netto lokalu × (1 + VAT).
 *
 * Stara reguła (powierzchnia × zaokrąglona stawka brutto/m²) dawała rozjazd
 * rzędu kilku groszy. Skrypt znajduje lokale, których priceGross różni się od
 * round2(priceNet × (1+VAT)) i wyrównuje brutto (netto i stawki bez zmian).
 * Pomija lokale bez stawek za m² (ryczałt) i bez powierzchni.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/fix-unit-gross-prices.js            # dry-run (podgląd)
 *   node scripts/fix-unit-gross-prices.js --apply    # zapis do bazy
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const apply = process.argv.includes('--apply')
const round2 = (n) => Math.round(n * 100) / 100

async function main() {
  const units = await prisma.unit.findMany({
    where: { pricePerSqmNet: { gt: 0 }, area: { gt: 0 } },
    select: { id: true, number: true, area: true, vatRate: true, priceNet: true, priceGross: true },
    orderBy: { number: 'asc' },
  })

  const fixes = []
  for (const u of units) {
    const expected = round2(u.priceNet * (1 + (u.vatRate ?? 8) / 100))
    if (Math.abs(expected - u.priceGross) >= 0.005) {
      fixes.push({ id: u.id, number: u.number, from: u.priceGross, to: expected })
    }
  }

  console.log(`Lokali za m²: ${units.length}, z rozjazdem brutto: ${fixes.length}`)
  for (const f of fixes) {
    console.log(`  - ${f.number}: ${f.from.toFixed(2)} -> ${f.to.toFixed(2)} (${(f.to - f.from).toFixed(2)} zł)`)
  }

  if (!apply) {
    console.log('\nDRY-RUN. Uruchom z --apply, aby zapisać zmiany.')
    return
  }

  let n = 0
  for (const f of fixes) {
    await prisma.unit.update({ where: { id: f.id }, data: { priceGross: f.to } })
    n++
  }
  console.log(`\nZaktualizowano ${n} lokali.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
