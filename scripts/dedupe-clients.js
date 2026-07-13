// Scalanie zduplikowanych klientów (np. po wielokrotnym imporcie).
//
// Grupuje klientów po kluczu: imię|nazwisko|email (lowercase) — TYLKO gdy email
// NIEPUSTY (rekordy bez maila NIE są deduplikowane: imię+nazwisko to za słaby
// klucz, homonimy zostałyby scalone/skasowane). W każdej grupie >1 zostawia
// JEDNEGO ("keeper" — z największą liczbą powiązań, remis: najstarszy), SCALA
// brakujące pola kontaktowe/osobowe z duplikatów na keepera, loguje snapshot
// kasowanego rekordu do AuditLog, przepina powiązania i kasuje duplikaty.
//
// ⚠️ SCALANIE PÓL (dodane 2026-07-12 po incydencie utraty danych): keeper
// wybierany jest po LICZBIE POWIĄZAŃ, nie po kompletności danych — więc keeper
// może mieć pusty telefon/adres, a bogatszy w dane duplikat być kasowany.
// WCZEŚNIEJ delete duplikatu kasował te dane bezpowrotnie (klient tracił telefon,
// czasem wszystkie dane). Teraz: przed usunięciem duplikatu każde PUSTE pole
// keepera jest uzupełniane wartością z duplikatu (nigdy nie nadpisujemy pola
// niepustego). Wartości kopiowane są 1:1 przez bazowy PrismaClient — pola
// szyfrowane (pesel/adres/…) są kopiowane jako ciphertext (ten sam klucz), więc
// pozostają odczytywalne przez extension w lib/prisma.ts.
//
// Powiązania przepinane: Contract.clientId, ContractClient, ClientUnit,
// Activity, ServiceRequest, Offer. Dla relacji z unikalnym kluczem
// (ContractClient[contractId,clientId], ClientUnit[clientId,unitId]) konflikt
// rozwiązywany przez skasowanie zdublowanego wiersza (keeper już ma powiązanie).
//
// Użycie (Coolify Terminal):
//   node scripts/dedupe-clients.js            # RAPORT — nic nie zmienia
//   node scripts/dedupe-clients.js --apply    # wykonuje scalanie
//
// PESEL nie jest używany w kluczu (klienci z PESEL nie dublują się — dedup
// importu po nim działa; duplikaty to rekordy bez PESEL). Email jest plaintext,
// więc bazowy PrismaClient (bez deszyfrowania) wystarcza.
const { PrismaClient } = require('@prisma/client')

const APPLY = process.argv.includes('--apply')
const norm = (s) => String(s ?? '').trim().toLowerCase()

// Pola scalane z duplikatu na keepera, gdy u keepera są puste. Wartości
// kopiowane 1:1 (dla szyfrowanych = ciphertext, ten sam klucz). NIE scalamy
// firstName/lastName (klucz grupy) ani status (etap lejka — keeper wygrywa).
const MERGE_FIELDS = [
  'email', 'phone', 'phone2', 'pesel', 'nip', 'idNumber',
  'fatherName', 'motherName', 'address', 'city', 'zipCode',
  'source', 'notes', 'ownerId',
]

const isEmpty = (v) => v === null || v === undefined || String(v).trim() === ''

/** Zwraca { pole: wartość } z pól duplikatu, którymi uzupełnić PUSTE pola keepera. */
function scalarFill(keeper, dup) {
  const fill = {}
  for (const f of MERGE_FIELDS) {
    if (isEmpty(keeper[f]) && !isEmpty(dup[f])) fill[f] = dup[f]
  }
  return fill
}

async function relationCounts(prisma, clientId) {
  const [contracts, contractClients, clientUnits, activities, serviceRequests, offers] = await Promise.all([
    prisma.contract.count({ where: { clientId } }),
    prisma.contractClient.count({ where: { clientId } }),
    prisma.clientUnit.count({ where: { clientId } }),
    prisma.activity.count({ where: { clientId } }),
    prisma.serviceRequest.count({ where: { clientId } }),
    prisma.offer.count({ where: { clientId } }),
  ])
  return { contracts, contractClients, clientUnits, activities, serviceRequests, offers,
    total: contracts + contractClients + clientUnits + activities + serviceRequests + offers }
}

async function relink(tx, dupId, keepId) {
  // Proste FK (bez unikalnych ograniczeń kolidujących):
  await tx.contract.updateMany({ where: { clientId: dupId }, data: { clientId: keepId } })
  await tx.activity.updateMany({ where: { clientId: dupId }, data: { clientId: keepId } })
  await tx.serviceRequest.updateMany({ where: { clientId: dupId }, data: { clientId: keepId } })
  await tx.offer.updateMany({ where: { clientId: dupId }, data: { clientId: keepId } })

  // ContractClient — unikalny [contractId, clientId]
  const ccs = await tx.contractClient.findMany({ where: { clientId: dupId } })
  for (const cc of ccs) {
    const exists = await tx.contractClient.findUnique({
      where: { contractId_clientId: { contractId: cc.contractId, clientId: keepId } },
    })
    if (exists) await tx.contractClient.delete({ where: { id: cc.id } })
    else await tx.contractClient.update({ where: { id: cc.id }, data: { clientId: keepId } })
  }

  // ClientUnit — unikalny [clientId, unitId]
  const cus = await tx.clientUnit.findMany({ where: { clientId: dupId } })
  for (const cu of cus) {
    const exists = await tx.clientUnit.findUnique({
      where: { clientId_unitId: { clientId: keepId, unitId: cu.unitId } },
    })
    if (exists) await tx.clientUnit.delete({ where: { id: cu.id } })
    else await tx.clientUnit.update({ where: { id: cu.id }, data: { clientId: keepId } })
  }
}

async function main() {
  const prisma = new PrismaClient()
  try {
    // Pełne rekordy (wszystkie pola scalane) — potrzebne do uzupełniania keepera.
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: 'asc' },
    })

    // Grupowanie — TYLKO rekordy z NIEPUSTYM e-mailem.
    // ⚠️ KRYTYCZNE (2026-07-13, po incydencie „Soszyński bez danych"): klucz
    // imię|nazwisko|email przy pustym mailu redukuje się do imię|nazwisko —
    // a to za słaby identyfikator: DWIE RÓŻNE OSOBY o tym samym nazwisku bez
    // maila (homonimy) trafiały do jednej grupy i jedna była KASOWANA w całości.
    // Bez wspólnego silnego identyfikatora NIE wolno automatycznie kasować.
    // Takie rekordy zostawiamy nietknięte (ewentualna ręczna weryfikacja).
    const groups = new Map()
    let skippedNoEmail = 0
    for (const c of clients) {
      if (norm(c.email) === '') { skippedNoEmail++; continue }
      const key = `${norm(c.firstName)}|${norm(c.lastName)}|${norm(c.email)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(c)
    }

    const dupGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1)
    console.log(`Klientów łącznie: ${clients.length}`)
    console.log(`Pominięto (brak e-maila, NIE deduplikowane): ${skippedNoEmail}`)
    console.log(`Grup z duplikatami (po e-mailu): ${dupGroups.length}`)
    if (dupGroups.length === 0) {
      console.log('Brak duplikatów z e-mailem — nic do zrobienia.')
      return
    }

    let toDelete = 0
    for (const [key, arr] of dupGroups) {
      // licz powiązania dla każdego, wybierz keepera (max total, remis: najstarszy)
      const withCounts = []
      for (const c of arr) withCounts.push({ c, rc: await relationCounts(prisma, c.id) })
      withCounts.sort((a, b) => b.rc.total - a.rc.total || a.c.createdAt - b.c.createdAt)
      const keeper = withCounts[0]
      const dups = withCounts.slice(1)
      toDelete += dups.length

      const name = `${arr[0].firstName} ${arr[0].lastName}`.trim()
      console.log(`\n• ${name} (${arr[0].email || 'brak email'}) — ${arr.length} kopii`)
      console.log(`    KEEP  ${keeper.c.id}  (powiązań: ${keeper.rc.total})`)
      for (const d of dups) {
        const preview = scalarFill(keeper.c, d.c)
        const mergeNote = Object.keys(preview).length ? `  → scali: ${Object.keys(preview).join(', ')}` : ''
        console.log(`    DEL   ${d.c.id}  (powiązań: ${d.rc.total})${mergeNote}`)
      }

      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          for (const d of dups) {
            // NAJPIERW uzupełnij puste pola keepera danymi z duplikatu, żeby
            // delete nie skasował np. jedynego telefonu klienta.
            const fill = scalarFill(keeper.c, d.c)
            if (Object.keys(fill).length > 0) {
              await tx.client.update({ where: { id: keeper.c.id }, data: fill })
              Object.assign(keeper.c, fill) // keeper w pamięci też uzupełniony (kolejne dups)
              console.log(`    MERGE ${Object.keys(fill).join(', ')} ← ${d.c.id}`)
            }
            // Pełny snapshot kasowanego rekordu do AuditLog — ODWRACALNOŚĆ.
            // (skrypt używa bazowego klienta, więc pola szyfrowane zapisują się
            // jako ciphertext — i tak w pełni odtwarzalne tym samym kluczem)
            await tx.auditLog.create({
              data: {
                action: 'DELETE',
                entity: 'Client',
                entityId: d.c.id,
                userEmail: 'script:dedupe-clients',
                path: 'scripts/dedupe-clients.js',
                metadata: JSON.stringify({ mergedIntoKeeper: keeper.c.id, deleted: d.c }).slice(0, 4000),
              },
            })
            await relink(tx, d.c.id, keeper.c.id)
            await tx.client.delete({ where: { id: d.c.id } })
          }
        }, { timeout: 120_000 })
      }
    }

    console.log(`\n${APPLY ? '✓ Scalono' : 'DO SCALENIA (uruchom z --apply)'}: ${toDelete} duplikatów do usunięcia, ${dupGroups.length} grup.`)
    if (!APPLY) console.log('To był tylko RAPORT. Aby wykonać: node scripts/dedupe-clients.js --apply')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error('Błąd:', e); process.exit(1) })
