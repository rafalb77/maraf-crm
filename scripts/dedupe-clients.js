// Scalanie zduplikowanych klientów (np. po wielokrotnym imporcie).
//
// Grupuje klientów po kluczu: imię|nazwisko|email (lowercase). W każdej grupie
// >1 zostawia JEDNEGO ("keeper" — z największą liczbą powiązań, remis: najstarszy),
// przepina wszystkie powiązania pozostałych na keepera i kasuje duplikaty.
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
    const clients = await prisma.client.findMany({
      select: { id: true, firstName: true, lastName: true, email: true, pesel: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    // Grupowanie
    const groups = new Map()
    for (const c of clients) {
      const key = `${norm(c.firstName)}|${norm(c.lastName)}|${norm(c.email)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(c)
    }

    const dupGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1)
    console.log(`Klientów łącznie: ${clients.length}`)
    console.log(`Grup z duplikatami: ${dupGroups.length}`)
    if (dupGroups.length === 0) {
      console.log('Brak duplikatów — nic do zrobienia.')
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
      for (const d of dups) console.log(`    DEL   ${d.c.id}  (powiązań: ${d.rc.total})`)

      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          for (const d of dups) {
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
