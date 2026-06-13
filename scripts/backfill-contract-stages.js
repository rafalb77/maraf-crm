/* eslint-disable */
/**
 * Backfill osi etapów (ContractStage) dla istniejących umów.
 *
 * Dla każdej umowy, która nie ma jeszcze wpisu etapu dla swojego bieżącego
 * `type`, tworzy jeden wpis ContractStage = { stage: type, status, signedAt }.
 * Dzięki temu stare umowy też mają oś etapów (z zachowaną datą podpisania).
 * Idempotentny — można odpalać wielokrotnie.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/backfill-contract-stages.js            # dry-run (podgląd)
 *   node scripts/backfill-contract-stages.js --apply    # zapis
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const contracts = await prisma.contract.findMany({
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      signedAt: true,
      stages: { select: { stage: true } },
    },
  })

  const toCreate = contracts.filter((c) => !c.stages.some((s) => s.stage === c.type))

  console.log(`Umów: ${contracts.length}`)
  console.log(`Do uzupełnienia osi: ${toCreate.length}`)
  for (const c of toCreate) {
    console.log(`  - ${c.number} (etap ${c.type}, status ${c.status})`)
  }

  if (!apply) {
    console.log('\nDRY-RUN. Uruchom z --apply, aby zapisać.')
    return
  }

  let created = 0
  for (const c of toCreate) {
    await prisma.contractStage.create({
      data: { contractId: c.id, stage: c.type, status: c.status, signedAt: c.signedAt },
    })
    created++
  }
  console.log(`\nUtworzono ${created} wpisów ContractStage.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
