// Migracja legacy pol Vendor.defaultDepositPct / defaultBuildingCostsPct
// do tabeli VendorTerms (wiersz domyslny investment='').
//
// Bezpieczna: nie nadpisuje istniejacych wierszy VendorTerms, legacy pol
// nie kasuje (zostaja jako fallback, UI juz ich nie edytuje).
//
// Uzycie (Coolify Terminal po deployu + db push):
//   node scripts/migrate-vendor-terms.js            # dry-run
//   node scripts/migrate-vendor-terms.js --commit   # zapis

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const COMMIT = process.argv.includes('--commit')

async function main() {
  console.log(COMMIT ? '== TRYB ZAPISU (--commit) ==' : '== DRY-RUN (bez zmian; --commit zapisuje) ==')

  const vendors = await prisma.vendor.findMany({
    where: { OR: [{ defaultDepositPct: { not: null } }, { defaultBuildingCostsPct: { not: null } }] },
    select: { id: true, name: true, defaultDepositPct: true, defaultBuildingCostsPct: true },
  })
  if (!vendors.length) {
    console.log('Brak vendorow z legacy domyslnymi % — nic do migracji.')
    return
  }

  let planned = 0
  let skipped = 0
  for (const v of vendors) {
    const existing = await prisma.vendorTerms.findUnique({
      where: { vendorId_investment: { vendorId: v.id, investment: '' } },
    })
    if (existing) {
      skipped++
      console.log(`  POMINIETY (ma juz warunki domyslne): "${v.name}"`)
      continue
    }
    planned++
    console.log(`  "${v.name}": kaucja ${v.defaultDepositPct ?? '—'}%, KB ${v.defaultBuildingCostsPct ?? '—'}% -> VendorTerms('')`)
    if (COMMIT) {
      await prisma.vendorTerms.create({
        data: {
          vendorId: v.id,
          investment: '',
          depositPct: v.defaultDepositPct,
          buildingCostsPct: v.defaultBuildingCostsPct,
          notes: 'Zmigrowane z domyslnych % kontrahenta',
        },
      })
    }
  }
  console.log(`\n${COMMIT ? 'Zapisano' : 'Do zapisania'}: ${planned}, pominieto: ${skipped}.`)
  if (!COMMIT) console.log('Uruchom z --commit aby zapisac.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
