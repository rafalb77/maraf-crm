// Lista kontrahentow (vendorow) — do znajdowania dokladnych nazw przed
// merge-vendors.js / fix-vendor-names-ksef.js.
//
// Uzycie (Coolify Terminal):
//   node scripts/list-vendors.js            # wszyscy
//   node scripts/list-vendors.js rafa       # tylko nazwy zawierajace fragment (case-insensitive)

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const filter = process.argv[2] || null

async function main() {
  const vendors = await prisma.vendor.findMany({
    where: filter ? { name: { contains: filter, mode: 'insensitive' } } : undefined,
    include: { _count: { select: { invoices: true } } },
    orderBy: { name: 'asc' },
  })
  if (!vendors.length) {
    console.log(filter ? `Brak vendorow pasujacych do "${filter}".` : 'Brak vendorow.')
    return
  }
  const w = Math.max(...vendors.map((v) => v.name.length))
  for (const v of vendors) {
    console.log(
      `${v.isActive ? ' ' : 'X'} ${v.name.padEnd(w)} | NIP ${String(v.nip || '—').padEnd(10)} | ${String(v._count.invoices).padStart(4)} FV | ${v.category}`
    )
  }
  console.log(`\n${vendors.length} vendorow${filter ? ` (filtr: "${filter}")` : ''}. X = nieaktywny.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
