// Detektor podejrzanych duplikatow kontrahentow.
//
// Heurystyki (od najpewniejszej):
//  1. NIP — ten sam NIP w dwoch wpisach = na pewno ta sama firma.
//  2. PREFIKS — znormalizowana nazwa jednego jest prefiksem drugiego
//     (EURON vs "Euron sp. z o.o.").
//  3. SLOWO — identyczne pierwsze slowo nazwy (>=4 znaki).
//
// Nic nie zmienia — tylko raport + gotowe komendy merge-vendors.js.
// Uzycie (Coolify Terminal):
//   node scripts/find-vendor-duplicates.js

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Parasole/grupy — scalanie zwykle NIEwskazane (STAFFA to grupa kosztowa).
const PROTECTED = new Set(['STAFFA', 'INNE', 'MURARZ', 'MD', 'BOGDAN', 'MARTA'])

const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]/g, '')
const normNip = (s) => {
  const d = String(s || '').replace(/\D/g, '')
  return d.length >= 9 ? d : null
}
const firstWord = (s) => (s.trim().split(/\s+/)[0] || '').toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]/g, '')

async function main() {
  const vendors = await prisma.vendor.findMany({
    include: { _count: { select: { invoices: true } } },
    orderBy: { name: 'asc' },
  })

  const pairs = new Map() // key a.id|b.id -> { a, b, reasons: [] }
  function addPair(a, b, reason) {
    const [x, y] = a.id < b.id ? [a, b] : [b, a]
    const key = `${x.id}|${y.id}`
    if (!pairs.has(key)) pairs.set(key, { a: x, b: y, reasons: [] })
    const p = pairs.get(key)
    if (!p.reasons.includes(reason)) p.reasons.push(reason)
  }

  for (let i = 0; i < vendors.length; i++) {
    for (let j = i + 1; j < vendors.length; j++) {
      const a = vendors[i]; const b = vendors[j]
      const nipA = normNip(a.nip); const nipB = normNip(b.nip)
      if (nipA && nipB && nipA === nipB) addPair(a, b, 'NIP')
      const na = norm(a.name); const nb = norm(b.name)
      if (na.length >= 4 && nb.length >= 4 && na !== nb && (na.startsWith(nb) || nb.startsWith(na))) {
        addPair(a, b, 'PREFIKS')
      }
      const fa = firstWord(a.name); const fb = firstWord(b.name)
      if (fa.length >= 4 && fa === fb && na !== nb) addPair(a, b, 'SLOWO')
    }
  }

  const found = [...pairs.values()]
    .sort((p, q) => {
      const rank = (r) => (r.reasons.includes('NIP') ? 0 : r.reasons.includes('PREFIKS') ? 1 : 2)
      return rank(p) - rank(q)
    })

  if (!found.length) {
    console.log('Brak podejrzanych par — lista kontrahentow wyglada czysto.')
    return
  }

  console.log(`Podejrzane pary: ${found.length}\n`)
  for (const { a, b, reasons } of found) {
    const nipA = normNip(a.nip); const nipB = normNip(b.nip)
    // Konflikt NIP: oba maja NIP, ale ROZNY -> to rozne firmy, nie scalac.
    if (nipA && nipB && nipA !== nipB && !reasons.includes('NIP')) {
      console.log(`✗ "${a.name}" vs "${b.name}" [${reasons.join('+')}]`)
      console.log(`  ROZNE NIP-y (${nipA} vs ${nipB}) — to rozne firmy, NIE scalac.\n`)
      continue
    }
    // Kierunek: target = wpis z NIP-em, a przy remisie dluzsza (oficjalna) nazwa.
    let source = a; let target = b
    if (nipA && !nipB) { source = b; target = a }
    else if (!nipA && nipB) { source = a; target = b }
    else if (a.name.length > b.name.length) { source = b; target = a }

    const prot = [a, b].filter((v) => PROTECTED.has(norm(v.name)))
    console.log(`${reasons.includes('NIP') ? '‼' : '?'} "${a.name}" (NIP ${nipA || '—'}, ${a._count.invoices} FV${a.isActive ? '' : ', nieakt.'})`)
    console.log(`   vs "${b.name}" (NIP ${nipB || '—'}, ${b._count.invoices} FV${b.isActive ? '' : ', nieakt.'}) [${reasons.join('+')}]`)
    if (prot.length) {
      console.log(`  UWAGA: "${prot.map((v) => v.name).join('", "')}" to grupa/parasol — scalaj tylko jesli na pewno ta sama firma.`)
    }
    console.log(`  node scripts/merge-vendors.js "${source.name}" "${target.name}" --commit\n`)
  }
  console.log('Komendy najpierw uruchom BEZ --commit (podglad). Kierunek: source -> target (target zostaje).')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
