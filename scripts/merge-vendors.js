// Reczne scalenie dwoch kontrahentow w jednego (source -> target).
// Target zachowuje swoja nazwe (docelowo oficjalna z KSeF) i NIP; faktury
// source przenoszone do targeta. Kolizje numerow FV (ta sama FV u obu —
// prawdopodobnie duplikat Excel vs KSeF) zostaja przy source, ktory jest
// wtedy dezaktywowany zamiast usuniety.
//
// Uzycie (Coolify Terminal):
//   node scripts/merge-vendors.js "Banaszczyk" "Rafał Banaszczyk Firma Budowlano-Remontowa"            # dry-run
//   node scripts/merge-vendors.js "Banaszczyk" "Rafał Banaszczyk Firma Budowlano-Remontowa" --commit   # zapis
//
// Nazwy: najpierw dopasowanie dokladne, potem case-insensitive zawieranie.
// Gdy fragment pasuje do wielu vendorow — wypisuje kandydatow i konczy.

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const args = process.argv.slice(2).filter((a) => a !== '--commit')
const COMMIT = process.argv.includes('--commit')

async function resolveVendor(label, needle) {
  const exact = await prisma.vendor.findUnique({
    where: { name: needle },
    include: { _count: { select: { invoices: true } } },
  })
  if (exact) return exact
  const candidates = await prisma.vendor.findMany({
    where: { name: { contains: needle, mode: 'insensitive' } },
    include: { _count: { select: { invoices: true } } },
  })
  if (candidates.length === 1) return candidates[0]
  if (candidates.length === 0) {
    console.log(`BLAD: nie znaleziono vendora dla ${label} "${needle}"`)
  } else {
    console.log(`BLAD: ${label} "${needle}" pasuje do ${candidates.length} vendorow — podaj dokladna nazwe:`)
    for (const c of candidates) console.log(`  - "${c.name}" (NIP ${c.nip || '—'}, ${c._count.invoices} FV)`)
  }
  return null
}

async function main() {
  const [sourceNeedle, targetNeedle] = args
  if (!sourceNeedle || !targetNeedle) {
    console.log('Uzycie: node scripts/merge-vendors.js "<source>" "<target>" [--commit]')
    process.exit(1)
  }
  console.log(COMMIT ? '== TRYB ZAPISU (--commit) ==' : '== DRY-RUN (bez zmian; --commit zapisuje) ==')

  const source = await resolveVendor('source', sourceNeedle)
  const target = await resolveVendor('target', targetNeedle)
  if (!source || !target) process.exit(1)
  if (source.id === target.id) {
    console.log('BLAD: source i target to ten sam vendor.')
    process.exit(1)
  }

  const sourceInvoices = await prisma.purchaseInvoice.findMany({
    where: { vendorId: source.id },
    select: { id: true, number: true, amountGross: true, issueDate: true },
  })
  const targetNumbers = new Set(
    (await prisma.purchaseInvoice.findMany({ where: { vendorId: target.id }, select: { number: true } })).map((i) => i.number)
  )
  const movable = sourceInvoices.filter((i) => !targetNumbers.has(i.number))
  const colliding = sourceInvoices.filter((i) => targetNumbers.has(i.number))

  console.log(`\nSource: "${source.name}" (NIP ${source.nip || '—'}, ${sourceInvoices.length} FV, ${source.isActive ? 'aktywny' : 'nieaktywny'})`)
  console.log(`Target: "${target.name}" (NIP ${target.nip || '—'}, ${targetNumbers.size} FV)`)
  console.log(`\nDo przeniesienia: ${movable.length} FV`)
  for (const i of movable) console.log(`  - ${i.number} (${i.amountGross} zl, ${i.issueDate.toISOString().slice(0, 10)})`)
  if (colliding.length) {
    console.log(`\nKOLIZJE (numer FV istnieje u targeta — prawdopodobnie duplikat Excel vs KSeF, zostana przy source): ${colliding.length}`)
    for (const i of colliding) console.log(`  - ${i.number} (${i.amountGross} zl)`)
  }
  if (source.nip && !target.nip) console.log(`\nNIP ${source.nip} zostanie przepisany na targeta.`)
  console.log(colliding.length
    ? `\nPo scaleniu: source zostanie DEZAKTYWOWANY (zostana na nim kolizje).`
    : `\nPo scaleniu: source zostanie USUNIETY.`)

  if (!COMMIT) {
    console.log('\nDry-run zakonczony. Uruchom z --commit aby zapisac.')
    return
  }

  console.log('\n== ZAPIS ==')
  if (movable.length) {
    await prisma.purchaseInvoice.updateMany({
      where: { id: { in: movable.map((i) => i.id) } },
      data: { vendorId: target.id },
    })
    console.log(`  OK: przeniesiono ${movable.length} FV do "${target.name}"`)
  }
  if (source.nip && !target.nip) {
    // NIP przenosimy na targeta — najpierw zdejmujemy ze zrodla (nip nie ma unique,
    // ale nie chcemy dwoch vendorow z tym samym NIP w przyszlych matchach KSeF).
    await prisma.vendor.update({ where: { id: source.id }, data: { nip: null } })
    await prisma.vendor.update({ where: { id: target.id }, data: { nip: source.nip } })
    console.log(`  OK: NIP ${source.nip} przepisany na "${target.name}"`)
  }
  if (colliding.length) {
    await prisma.vendor.update({ where: { id: source.id }, data: { isActive: false } })
    console.log(`  OK: "${source.name}" dezaktywowany (${colliding.length} FV-kolizji zostalo przy nim)`)
  } else {
    await prisma.vendor.delete({ where: { id: source.id } })
    console.log(`  OK: "${source.name}" usuniety`)
  }
  console.log('Zapis zakonczony.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
