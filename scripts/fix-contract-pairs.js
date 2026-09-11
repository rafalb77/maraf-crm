/* eslint-disable */
/**
 * Porządki w PARACH umów z importu (rekord …/R rezerwacyjny + …/D deweloperski
 * tego samego numeru). Dwa problemy znalezione 11.09.2026 diagnostyką
 * harmonogramów (scripts/diagnose-contract-payments.js):
 *
 *  1. ZAMIENIONE TYPY: rekord …/D ma type=REZERWACYJNA, a …/R type=DEWELOPERSKA
 *     (Filipiak MD/UF/2025/6). Harmonogram wpisany na …/D jest wtedy niewidoczny
 *     w module powierniczym (filtruje po type=DEWELOPERSKA). Naprawa: zamiana
 *     typów zgodnie z numerem + ContractStage dla nowego typu + wpis w historii.
 *     Dotyczy WYŁĄCZNIE pary, w której oba typy są skrzyżowane — pojedynczy
 *     rekord …/R z type=DEWELOPERSKA (deal awansowany etapem, np. 6/2026/R)
 *     jest poprawny i NIE jest ruszany.
 *
 *  2. ZDUBLOWANY HARMONOGRAM: raty wpisane i na …/D, i na …/R z identycznymi
 *     kwotami (Olszewska MD/UF/2025/2). Naprawa (tylko z --dedupe): usunięcie
 *     rat z rekordu …/R, wpis w historii obu umów. Raty na …/D zostają.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/fix-contract-pairs.js                    # dry-run (podgląd)
 *   node scripts/fix-contract-pairs.js --apply            # naprawa typów
 *   node scripts/fix-contract-pairs.js --apply --dedupe   # + usunięcie dubli rat z …/R
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const apply = process.argv.includes('--apply')
const dedupe = process.argv.includes('--dedupe')
const money = (n) => (Number(n) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'

async function main() {
  // Prisma nie ma regexa — końcówki /R i /D filtrujemy w JS.
  const all = await prisma.contract.findMany({
    where: { status: { notIn: ['ANULOWANA', 'ROZWIAZANA'] } },
    include: {
      payments: { orderBy: [{ position: 'asc' }] },
      stages: true,
      client: { select: { firstName: true, lastName: true } },
    },
  })
  const pairs = new Map() // prefix → { R, D }
  for (const c of all) {
    const m = c.number.match(/^(.*)\/(R|D)$/)
    if (!m) continue
    if (!pairs.has(m[1])) pairs.set(m[1], {})
    pairs.get(m[1])[m[2]] = c
  }

  let swapped = 0
  let duplicates = 0
  for (const [prefix, pair] of pairs) {
    if (!pair.R || !pair.D) continue
    const client = pair.D.client ? `${pair.D.client.lastName} ${pair.D.client.firstName}` : '—'

    // --- 1. skrzyżowane typy ---
    if (pair.R.type === 'DEWELOPERSKA' && pair.D.type === 'REZERWACYJNA') {
      swapped++
      // Raty dodane, gdy rekord …/D był typu REZERWACYJNA, dostały toEscrow=false
      // (domyślnie true tylko dla DEWELOPERSKA) — po zamianie typów odhaczenie nie
      // tworzyłoby wpłaty na rachunek powierniczy. Naprawiamy razem z typem.
      const noEscrow = pair.D.payments.filter((p) => !p.toEscrow).length
      console.log(
        `\n[TYPY] ${prefix} (${client}): ${pair.R.number} ma type=DEWELOPERSKA (raty: ${pair.R.payments.length}), ` +
          `${pair.D.number} ma type=REZERWACYJNA (raty: ${pair.D.payments.length}, z toEscrow=false: ${noEscrow}) → zamiana typów zgodnie z numerem` +
          (noEscrow ? ` + ${noEscrow} rat dostanie toEscrow=true` : ''),
      )
      if (apply) {
        await prisma.$transaction(async (tx) => {
          if (noEscrow) {
            await tx.contractPayment.updateMany({ where: { contractId: pair.D.id, toEscrow: false }, data: { toEscrow: true } })
          }
          for (const [c, newType] of [
            [pair.R, 'REZERWACYJNA'],
            [pair.D, 'DEWELOPERSKA'],
          ]) {
            await tx.contract.update({ where: { id: c.id }, data: { type: newType } })
            await tx.contractStage.upsert({
              where: { contractId_stage: { contractId: c.id, stage: newType } },
              create: { contractId: c.id, stage: newType, status: c.status, signedAt: c.signedAt ?? null },
              update: {},
            })
            await tx.contractHistory.create({
              data: {
                contractId: c.id,
                event: 'KOREKTA',
                details: `Typ umowy ${c.type} → ${newType} (skrypt fix-contract-pairs: typy pary …/R i …/D były zamienione)`,
              },
            })
          }
        })
        console.log('   zapisano.')
      }
    }

    // --- 2. zdublowany harmonogram na …/R ---
    if (pair.R.payments.length > 0 && pair.D.payments.length > 0) {
      const sig = (ps) => ps.map((p) => Number(p.plannedAmount).toFixed(2)).sort().join('|')
      const same = sig(pair.R.payments) === sig(pair.D.payments)
      duplicates++
      console.log(
        `\n[DUBEL] ${prefix} (${client}): raty na ${pair.R.number} (${pair.R.payments.length} szt., ${money(pair.R.payments.reduce((s, p) => s + p.plannedAmount, 0))}) ` +
          `i na ${pair.D.number} (${pair.D.payments.length} szt.) — ${same ? 'IDENTYCZNE kwoty' : 'RÓŻNE kwoty (zostawiam, do ręcznego przejrzenia)'}`,
      )
      if (same && apply && dedupe) {
        await prisma.$transaction(async (tx) => {
          await tx.contractPayment.deleteMany({ where: { contractId: pair.R.id } })
          const details = `Usunięto ${pair.R.payments.length} rat z ${pair.R.number} — dubel harmonogramu z ${pair.D.number} (skrypt fix-contract-pairs)`
          await tx.contractHistory.create({ data: { contractId: pair.R.id, event: 'KOREKTA', details } })
          await tx.contractHistory.create({ data: { contractId: pair.D.id, event: 'KOREKTA', details } })
        })
        console.log('   usunięto dubel z rekordu …/R.')
      } else if (same && apply) {
        console.log('   (bez --dedupe nie usuwam)')
      }
    }
  }

  console.log(`\nPar …/R + …/D: ${[...pairs.values()].filter((p) => p.R && p.D).length}; skrzyżowane typy: ${swapped}; zdublowane harmonogramy: ${duplicates}.`)
  if (!apply) console.log('DRY-RUN. Uruchom z --apply (i ewentualnie --dedupe), aby zapisać zmiany.')
}

main()
  .catch((e) => {
    console.error('BŁĄD:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
