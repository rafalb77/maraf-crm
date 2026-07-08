// Ujednolicenie nazw kontrahentow wg oficjalnych nazw z KSeF (match po NIP).
//
// Problem: import z Excela tworzyl vendorow z nazwami roboczymi (czesto bez NIP),
// a sync KSeF tworzy/matchuje vendorow po NIP z oficjalna nazwa sprzedawcy.
// Efekt: duplikaty vendorow i rozne nazwy tej samej firmy.
//
// Co robi:
//  1. Buduje mape NIP -> oficjalna nazwa (z ksefData.seller, najnowsza faktura wygrywa).
//  2. Vendorom bez NIP probuje wywnioskowac NIP z ich wlasnych faktur KSeF
//     (tylko gdy WSZYSTKIE wskazuja jeden NIP).
//  3. Zmienia nazwy vendorow na oficjalne z KSeF (+ backfill NIP).
//  4. Scala duplikaty vendorow o tym samym NIP (faktury przenosi do targeta;
//     kolizje numerow raportuje jako prawdopodobne duplikaty Excel vs KSeF).
//  5. Raportuje faktury KSeF, ktorych numer wystepuje tez pod parasolem
//     (STAFFA itd.) — potencjalne duplikaty do recznej decyzji.
//
// NIE rusza parasoli z Excela (STAFFA, PROMATBUD, BAUTER, INNE + sekcje STALE) —
// to grupy kosztowe, nie firmy; lib/finanse-folders.ts matchuje po dokladnej nazwie.
//
// Uzycie (Coolify Terminal po deployu):
//   node scripts/fix-vendor-names-ksef.js            # dry-run (raport, bez zmian)
//   node scripts/fix-vendor-names-ksef.js --commit   # faktyczny zapis do DB

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const COMMIT = process.argv.includes('--commit')

// Nazwy chronione — parasole zakladek Excela + sekcje STALE (kopia z lib/finanse-folders.ts;
// tam TS, tu JS — utrzymywac razem przy zmianach).
const PROTECTED_NAMES = new Set([
  'STAFFA', 'PROMATBUD', 'BAUTER', 'INNE', 'STAŁE', 'STALE', 'MURARZ',
  'EURON', 'Euron', 'PLAY', 'Play', 'TOYA', 'Toya', 'POLISA', 'Polisa',
  'Jawne', 'JAWNE', 'DEVELOGIC', 'Develogic', 'MD',
  'Bogdan', 'BOGDAN', 'MARTA', 'Marta', 'RAFAŁ', 'Rafał', 'RAFAL', 'Rafal',
])

const normNip = (s) => {
  const d = String(s || '').replace(/\D/g, '')
  return d.length >= 9 ? d : null // NIP=10 cyfr; krotsze smieci odrzucamy
}

async function main() {
  console.log(COMMIT ? '== TRYB ZAPISU (--commit) ==' : '== DRY-RUN (bez zmian; --commit zapisuje) ==')

  // ---- 1. Oficjalne nazwy z KSeF ----
  const ksefInvoices = await prisma.purchaseInvoice.findMany({
    where: { ksefNumber: { not: null } },
    select: {
      id: true, vendorId: true, number: true, issueDate: true,
      importSheet: true, amountGross: true, ksefData: true,
    },
  })
  const officialByNip = new Map() // nip -> { name, issueDate }
  const sellerNipsByVendor = new Map() // vendorId -> Set<nip>
  for (const inv of ksefInvoices) {
    const seller = inv.ksefData && inv.ksefData.seller
    const nip = normNip(seller && seller.nip)
    if (!nip) continue
    if (!sellerNipsByVendor.has(inv.vendorId)) sellerNipsByVendor.set(inv.vendorId, new Set())
    sellerNipsByVendor.get(inv.vendorId).add(nip)
    const name = seller && seller.name ? String(seller.name).trim() : null
    if (!name) continue
    const cur = officialByNip.get(nip)
    if (!cur || inv.issueDate > cur.issueDate) officialByNip.set(nip, { name, issueDate: inv.issueDate })
  }
  console.log(`Faktur powiazanych z KSeF: ${ksefInvoices.length}; NIP-ow z oficjalna nazwa: ${officialByNip.size}\n`)

  // ---- 2. Vendorzy + NIP (znany lub wywnioskowany) ----
  const vendors = await prisma.vendor.findMany({
    include: { _count: { select: { invoices: true } } },
  })
  const byName = new Map(vendors.map((v) => [v.name, v]))
  const protectedVendorIds = new Set(vendors.filter((v) => PROTECTED_NAMES.has(v.name)).map((v) => v.id))

  const vendorNip = new Map() // vendorId -> nip
  for (const v of vendors) {
    let nip = normNip(v.nip)
    if (!nip && !protectedVendorIds.has(v.id)) {
      // Inferencja tylko dla zwyklych vendorow — parasole maja faktury wielu firm.
      const inferred = sellerNipsByVendor.get(v.id)
      if (inferred && inferred.size === 1) nip = [...inferred][0]
    }
    if (nip) vendorNip.set(v.id, nip)
  }

  const byNip = new Map() // nip -> Vendor[]
  for (const v of vendors) {
    const nip = vendorNip.get(v.id)
    if (!nip) continue
    if (!byNip.has(nip)) byNip.set(nip, [])
    byNip.get(nip).push(v)
  }

  // ---- 3. Plan zmian ----
  const renames = []          // { vendor, to|null, nipBackfill|null }
  const merges = []           // { source, target }
  const skippedProtected = [] // { vendor, officialName }
  const conflicts = []        // { vendor, to, reason }

  for (const [nip, group] of byNip) {
    const official = officialByNip.get(nip)
    if (!official) continue
    const officialName = official.name

    for (const p of group.filter((v) => protectedVendorIds.has(v.id))) {
      skippedProtected.push({ vendor: p, officialName })
    }
    const candidates = group.filter((v) => !protectedVendorIds.has(v.id))
    if (!candidates.length) continue

    // Target: juz nazwany oficjalnie > ma NIP w bazie > najwiecej faktur
    const target =
      candidates.find((v) => v.name === officialName) ||
      candidates.filter((v) => normNip(v.nip) === nip).sort((a, b) => b._count.invoices - a._count.invoices)[0] ||
      [...candidates].sort((a, b) => b._count.invoices - a._count.invoices)[0]

    if (target.name !== officialName) {
      const clash = byName.get(officialName)
      if (clash && clash.id !== target.id && !candidates.some((c) => c.id === clash.id)) {
        conflicts.push({ vendor: target, to: officialName, reason: `nazwa zajeta przez innego vendora (${clash.name}, id=${clash.id})` })
      } else {
        renames.push({ vendor: target, to: officialName, nipBackfill: normNip(target.nip) ? null : nip })
      }
    } else if (!normNip(target.nip)) {
      renames.push({ vendor: target, to: null, nipBackfill: nip })
    }

    for (const v of candidates) {
      if (v.id !== target.id) merges.push({ source: v, target })
    }
  }

  // ---- 4. Potencjalne duplikaty: faktura KSeF vs ten sam numer pod parasolem ----
  const umbrellaInvoices = protectedVendorIds.size
    ? await prisma.purchaseInvoice.findMany({
        where: { vendorId: { in: [...protectedVendorIds] } },
        select: { id: true, number: true, subVendor: true, vendorId: true, amountGross: true },
      })
    : []
  const umbrellaByNumber = new Map()
  for (const u of umbrellaInvoices) {
    const k = u.number.trim()
    if (!umbrellaByNumber.has(k)) umbrellaByNumber.set(k, [])
    umbrellaByNumber.get(k).push(u)
  }
  const vendorById = new Map(vendors.map((v) => [v.id, v]))
  const possibleDups = []
  for (const inv of ksefInvoices) {
    if (protectedVendorIds.has(inv.vendorId)) continue
    for (const u of umbrellaByNumber.get(inv.number.trim()) || []) {
      possibleDups.push({ ksef: inv, umbrella: u })
    }
  }

  // ---- 5. Raport ----
  if (renames.length) {
    console.log(`--- Zmiany nazw / backfill NIP (${renames.length}) ---`)
    for (const r of renames) {
      if (r.to) console.log(`  "${r.vendor.name}" -> "${r.to}"${r.nipBackfill ? ` (+NIP ${r.nipBackfill})` : ''} [${r.vendor._count.invoices} FV]`)
      else console.log(`  "${r.vendor.name}" — tylko backfill NIP ${r.nipBackfill}`)
    }
  } else console.log('--- Brak zmian nazw ---')

  if (merges.length) {
    console.log(`\n--- Scalenia duplikatow vendorow (${merges.length}) ---`)
    for (const m of merges) {
      console.log(`  "${m.source.name}" [${m.source._count.invoices} FV] -> "${m.target.name}" (NIP ${vendorNip.get(m.target.id)})`)
    }
  } else console.log('\n--- Brak duplikatow vendorow do scalenia ---')

  if (skippedProtected.length) {
    console.log(`\n--- Pominiete parasole/grupy (chronione) (${skippedProtected.length}) ---`)
    for (const s of skippedProtected) {
      console.log(`  "${s.vendor.name}" — KSeF wskazuje "${s.officialName}", ale to grupa kosztowa, nie firma`)
    }
  }

  if (conflicts.length) {
    console.log(`\n--- Konflikty (do recznej decyzji) (${conflicts.length}) ---`)
    for (const c of conflicts) console.log(`  "${c.vendor.name}" -> "${c.to}": ${c.reason}`)
  }

  if (possibleDups.length) {
    console.log(`\n--- Potencjalne duplikaty FV: KSeF vs parasol z Excela (${possibleDups.length}) — tylko raport ---`)
    for (const d of possibleDups) {
      const kv = vendorById.get(d.ksef.vendorId)
      const uv = vendorById.get(d.umbrella.vendorId)
      console.log(`  nr "${d.ksef.number}": KSeF u "${kv ? kv.name : d.ksef.vendorId}" (${d.ksef.amountGross} zl) vs Excel u "${uv ? uv.name : d.umbrella.vendorId}"${d.umbrella.subVendor ? ` / ${d.umbrella.subVendor}` : ''} (${d.umbrella.amountGross} zl)`)
    }
  }

  // ---- 6. Zapis ----
  if (!COMMIT) {
    console.log('\nDry-run zakonczony. Uruchom z --commit aby zapisac.')
    return
  }

  console.log('\n== ZAPIS ==')
  for (const r of renames) {
    try {
      await prisma.vendor.update({
        where: { id: r.vendor.id },
        data: { ...(r.to ? { name: r.to } : {}), ...(r.nipBackfill ? { nip: r.nipBackfill } : {}) },
      })
      console.log(`  OK: ${r.to ? `"${r.vendor.name}" -> "${r.to}"` : `NIP dla "${r.vendor.name}"`}`)
    } catch (e) {
      console.log(`  BLAD przy "${r.vendor.name}": ${e.message}`)
    }
  }

  for (const m of merges) {
    try {
      const targetNumbers = new Set(
        (await prisma.purchaseInvoice.findMany({ where: { vendorId: m.target.id }, select: { number: true } })).map((i) => i.number)
      )
      const sourceInvoices = await prisma.purchaseInvoice.findMany({
        where: { vendorId: m.source.id },
        select: { id: true, number: true },
      })
      const movable = sourceInvoices.filter((i) => !targetNumbers.has(i.number))
      const colliding = sourceInvoices.filter((i) => targetNumbers.has(i.number))
      if (movable.length) {
        await prisma.purchaseInvoice.updateMany({
          where: { id: { in: movable.map((i) => i.id) } },
          data: { vendorId: m.target.id },
        })
      }
      if (colliding.length) {
        console.log(`  UWAGA "${m.source.name}": ${colliding.length} FV o numerach istniejacych u targeta (duplikaty?) — zostaly przy zrodle: ${colliding.map((i) => i.number).join(', ')}`)
        await prisma.vendor.update({ where: { id: m.source.id }, data: { isActive: false } })
        console.log(`  OK: "${m.source.name}" dezaktywowany (zostalo ${colliding.length} FV), ${movable.length} FV przeniesionych do "${m.target.name}"`)
      } else {
        await prisma.vendor.delete({ where: { id: m.source.id } })
        console.log(`  OK: "${m.source.name}" scalony z "${m.target.name}" (${movable.length} FV przeniesionych, vendor usuniety)`)
      }
    } catch (e) {
      console.log(`  BLAD przy scalaniu "${m.source.name}": ${e.message}`)
    }
  }
  console.log('Zapis zakonczony.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
