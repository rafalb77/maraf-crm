// Hurtowe ujednolicenie etykiet podwykonawcow (subVendor) do oficjalnych
// nazw kontrahentow.
//
// Problem: import z Excela zostawil na fakturach robocze etykiety ("AL-BUD",
// "MBGeo"), a kontrahenci po scaleniu nosza oficjalne nazwy z KSeF
// ("AL-BUD ALINA GRANENKO"). Dopasowanie liczników/kart/filtrow wymaga
// IDENTYCZNEJ nazwy — ten skrypt masowo zmienia etykiety na nazwy vendorow.
//
// Dopasowanie etykieta -> vendor (znormalizowane: upper, bez znakow
// niealfanumerycznych):
//   1. rownosc znormalizowana ("AL-BUD" == "Al-Bud"),
//   2. nazwa vendora ZACZYNA SIE od etykiety ("ALBUD..." startsWith "ALBUD"),
//   3. etykieta zaczyna sie od nazwy vendora (rzadkie, np. skrot dluzszy).
// Niejednoznaczne (2+ vendorow) i niedopasowane — tylko raport.
//
// Uzycie (Coolify Terminal):
//   node scripts/unify-subvendor-labels.js            # dry-run
//   node scripts/unify-subvendor-labels.js --commit   # zapis

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const COMMIT = process.argv.includes('--commit')

// Parasole/grupy z Excela — etykiety NIE powinny byc mapowane na te wpisy.
const PROTECTED = new Set(['STAFFA', 'INNE', 'MURARZ', 'STALE'])

const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]/g, '')

async function main() {
  console.log(COMMIT ? '== TRYB ZAPISU (--commit) ==' : '== DRY-RUN (bez zmian; --commit zapisuje) ==')

  const [labelsRaw, vendors] = await Promise.all([
    prisma.purchaseInvoice.groupBy({
      by: ['subVendor'],
      where: { subVendor: { not: null } },
      _count: true,
    }),
    prisma.vendor.findMany({ select: { id: true, name: true, isActive: true } }),
  ])

  const candidates = vendors.filter((v) => !PROTECTED.has(norm(v.name)))

  let renames = 0
  let already = 0
  const ambiguous = []
  const unmatched = []

  for (const row of labelsRaw) {
    const label = (row.subVendor || '').trim()
    if (!label) continue
    const nl = norm(label)
    if (nl.length < 3) { unmatched.push({ label, count: row._count, why: 'za krotka etykieta' }); continue }

    const matches = candidates.filter((v) => {
      const nv = norm(v.name)
      return nv === nl || nv.startsWith(nl) || nl.startsWith(nv)
    })

    if (matches.length === 0) {
      unmatched.push({ label, count: row._count, why: 'brak kontrahenta' })
      continue
    }
    if (matches.length > 1) {
      // Preferuj dokladna rownosc znormalizowana, jesli jedyna.
      const exact = matches.filter((v) => norm(v.name) === nl)
      if (exact.length !== 1) {
        ambiguous.push({ label, count: row._count, names: matches.map((m) => m.name) })
        continue
      }
      matches.length = 0
      matches.push(exact[0])
    }

    const target = matches[0]
    if (target.name === label) { already++; continue }

    renames++
    console.log(`  "${label}" (${row._count} FV) -> "${target.name}"`)
    if (COMMIT) {
      await prisma.purchaseInvoice.updateMany({
        where: { subVendor: label },
        data: { subVendor: target.name },
      })
    }
  }

  if (ambiguous.length) {
    console.log(`\n--- Niejednoznaczne (recznie przez rename-subvendor.js) (${ambiguous.length}) ---`)
    for (const a of ambiguous) console.log(`  "${a.label}" (${a.count} FV): ${a.names.join(' / ')}`)
  }
  if (unmatched.length) {
    console.log(`\n--- Bez dopasowania (${unmatched.length}) — zostaja jak sa ---`)
    for (const u of unmatched) console.log(`  "${u.label}" (${u.count} FV) — ${u.why}`)
  }

  console.log(`\n${COMMIT ? 'Zmieniono' : 'Do zmiany'}: ${renames} etykiet, juz zgodnych: ${already}.`)
  if (!COMMIT && renames > 0) console.log('Uruchom z --commit aby zapisac.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
