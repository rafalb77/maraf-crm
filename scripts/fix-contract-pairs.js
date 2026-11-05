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
 *  3. RATY BEZ FLAGI ESCROW na umowie deweloperskiej: raty dodane, gdy rekord był
 *     jeszcze typu REZERWACYJNA (zamienione typy, deal awansowany później), mają
 *     toEscrow=false — odhaczenie nie tworzy wpłaty na rachunek powierniczy.
 *     Naprawa (tylko z --escrow): toEscrow=true dla rat umów DEWELOPERSKICH,
 *     w których ŻADNA rata nie ma flagi (częściowe przypadki tylko raportujemy —
 *     mogą być celowe).
 *
 *  4. ZBĘDNE ETAPY w parze: rekord …/R powinien mieć tylko etap REZERWACYJNA,
 *     rekord …/D — tylko DEWELOPERSKA/PRZENIESIENIA. Podpisanie rekordu w czasie,
 *     gdy miał zamieniony typ, dopisało mu etap drugiego rodzaju (Filipiak 6/R ma
 *     „DEWELOPERSKA: podpisana”), przez co eksport dla banku i karta klienta
 *     widzą dwie umowy deweloperskie. Naprawa (tylko z --stages): usunięcie
 *     etapów niezgodnych z rolą rekordu + wpis w historii.
 *
 *  5. REKORD …/R AWANSOWANY ETAPEM: rekord …/R ma type DEWELOPERSKA/PRZENIESIENIA,
 *     choć umowa deweloperska tej transakcji to rekord …/D (Filipiak 6/R, 11.2026:
 *     „Podpisz i przejdź" na rekordzie rezerwacyjnym). Klient wychodzi z dwiema
 *     umowami deweloperskimi (lista Sprzedaż, eksport dla banku). Naprawa (tylko
 *     z --revert-r): type=REZERWACYJNA, usunięcie etapów innych niż REZERWACYJNA,
 *     etap REZERWACYJNA ze statusem/datą rekordu + wpis w historii. Datę
 *     podpisania rekordu …/R sprawdź potem na jego karcie.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/fix-contract-pairs.js                    # dry-run (podgląd)
 *   node scripts/fix-contract-pairs.js --apply            # naprawa typów
 *   node scripts/fix-contract-pairs.js --apply --dedupe   # + usunięcie dubli rat z …/R
 *   node scripts/fix-contract-pairs.js --apply --escrow   # + toEscrow=true, gdy ŻADNA rata umowy nie ma flagi (krok 3)
 *   node scripts/fix-contract-pairs.js --apply --escrow-all # + toEscrow=true na WSZYSTKICH ratach umów deweloperskich
 *   node scripts/fix-contract-pairs.js --apply --stages   # + usunięcie zbędnych etapów (krok 4)
 *   node scripts/fix-contract-pairs.js --apply --revert-r # + cofnięcie awansowanego rekordu …/R do typu rezerwacyjna (krok 5)
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const apply = process.argv.includes('--apply')
const dedupe = process.argv.includes('--dedupe')
const escrowAll = process.argv.includes('--escrow-all')
const escrow = process.argv.includes('--escrow') || escrowAll
const stagesFix = process.argv.includes('--stages')
const revertR = process.argv.includes('--revert-r')
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
  let advancedR = 0
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

    // --- 5. rekord …/R awansowany etapem (typ ≠ REZERWACYJNA, a …/D jest deweloperski) ---
    if (pair.R.type !== 'REZERWACYJNA' && pair.D.type !== 'REZERWACYJNA') {
      advancedR++
      const wrongStages = pair.R.stages.filter((s) => s.stage !== 'REZERWACYJNA')
      const dateOf = (d) => (d ? d.toISOString().slice(0, 10) : null)
      console.log(
        `\n[AWANS-R] ${prefix} (${client}): ${pair.R.number} ma type=${pair.R.type} (${pair.R.status}${dateOf(pair.R.signedAt) ? ', podpisana ' + dateOf(pair.R.signedAt) : ''}), ` +
          `a umowa deweloperska tej transakcji to ${pair.D.number} → cofnięcie do REZERWACYJNA` +
          (wrongStages.length ? ` + usunięcie etapów: ${wrongStages.map((s) => s.stage).join(', ')}` : ''),
      )
      if (apply && revertR) {
        await prisma.$transaction(async (tx) => {
          await tx.contract.update({ where: { id: pair.R.id }, data: { type: 'REZERWACYJNA' } })
          for (const s of wrongStages) await tx.contractStage.delete({ where: { id: s.id } })
          // Etap REZERWACYJNA: istniejącej daty podpisania nie ruszamy (data na rekordzie
          // mogła zostać wpisana przy omyłkowym awansie — np. 10.10.2026 u Filipiaka).
          const resRow = pair.R.stages.find((s) => s.stage === 'REZERWACYJNA')
          if (resRow) {
            await tx.contractStage.update({
              where: { id: resRow.id },
              data: { status: pair.R.status, ...(resRow.signedAt ? {} : { signedAt: pair.R.signedAt ?? null }) },
            })
          } else {
            await tx.contractStage.create({
              data: { contractId: pair.R.id, stage: 'REZERWACYJNA', status: pair.R.status, signedAt: pair.R.signedAt ?? null },
            })
          }
          await tx.contractHistory.create({
            data: {
              contractId: pair.R.id,
              event: 'KOREKTA',
              details: `Typ umowy ${pair.R.type} → REZERWACYJNA (skrypt fix-contract-pairs: rekord …/R pary z importu został awansowany etapem; umowa deweloperska tej transakcji to ${pair.D.number})`,
            },
          })
        })
        // Stan w pamięci dla kroku 4 (etapy) w tym samym przebiegu.
        pair.R.type = 'REZERWACYJNA'
        pair.R.stages = pair.R.stages.filter((s) => s.stage === 'REZERWACYJNA')
        console.log(`   zapisano. Sprawdź datę podpisania rekordu ${pair.R.number} na jego karcie${dateOf(pair.R.signedAt) ? ` (teraz: ${dateOf(pair.R.signedAt)})` : ''}.`)
      } else if (apply) {
        console.log('   (bez --revert-r nie zmieniam)')
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

  // --- 3. raty bez flagi escrow na umowach deweloperskich (także deale po etapie
  //        deweloperskim, czyli PRZENIESIENIA) ---
  let escrowFixed = 0
  let escrowRatsTotal = 0
  const enableEscrow = async (c, off) => {
    await prisma.$transaction(async (tx) => {
      await tx.contractPayment.updateMany({ where: { contractId: c.id, toEscrow: false }, data: { toEscrow: true } })
      await tx.contractHistory.create({
        data: { contractId: c.id, event: 'KOREKTA', details: `${off.length} rat: włączono „wpłata na rachunek powierniczy" (skrypt fix-contract-pairs)` },
      })
    })
    console.log('   zapisano.')
  }
  for (const c of all) {
    if ((c.type !== 'DEWELOPERSKA' && c.type !== 'PRZENIESIENIA') || c.payments.length === 0) continue
    const off = c.payments.filter((p) => !p.toEscrow)
    if (off.length === 0) continue
    const client = c.client ? `${c.client.lastName} ${c.client.firstName}` : '—'
    if (off.length === c.payments.length) {
      escrowFixed++
      escrowRatsTotal += off.length
      console.log(`\n[ESCROW] ${c.number} (${client}): wszystkie ${off.length} rat bez flagi „na rachunek powierniczy" → toEscrow=true`)
      if (apply && escrow) await enableEscrow(c, off)
      else if (apply) console.log('   (bez --escrow / --escrow-all nie zmieniam)')
    } else {
      console.log(
        `\n[ESCROW?] ${c.number} (${client}): ${off.length} z ${c.payments.length} rat bez flagi escrow` +
          (escrowAll ? ' → toEscrow=true (--escrow-all)' : ' — do ręcznego sprawdzenia (może być celowe):'),
      )
      for (const p of off) {
        console.log(
          `     - ${(p.title || p.type).padEnd(20)} ${money(p.plannedAmount).padStart(16)}  termin ${p.plannedDate ? p.plannedDate.toISOString().slice(0, 10) : '—'}  ${p.status}  (dodano ${p.createdAt.toISOString().slice(0, 16).replace('T', ' ')})`,
        )
      }
      if (escrowAll) {
        escrowFixed++
        escrowRatsTotal += off.length
        if (apply) await enableEscrow(c, off)
      } else {
        console.log('     Włączysz flagę na karcie umowy (Edytuj przy racie) albo hurtem: --apply --escrow-all.')
      }
    }
  }

  // --- 4. zbędne etapy w parach (…/R tylko REZERWACYJNA, …/D bez REZERWACYJNA) ---
  let stagesFixed = 0
  for (const [prefix, pair] of pairs) {
    if (!pair.R || !pair.D) continue
    const client = pair.D.client ? `${pair.D.client.lastName} ${pair.D.client.firstName}` : '—'
    const wrong = [
      ...pair.R.stages.filter((s) => s.stage !== 'REZERWACYJNA').map((s) => ({ c: pair.R, s })),
      ...pair.D.stages.filter((s) => s.stage === 'REZERWACYJNA').map((s) => ({ c: pair.D, s })),
    ]
    if (wrong.length === 0) continue
    stagesFixed++
    console.log(
      `\n[ETAPY] ${prefix} (${client}): ` +
        wrong.map(({ c, s }) => `${c.number} ma zbędny etap ${s.stage} (${s.status}${s.signedAt ? ', podpisany ' + s.signedAt.toISOString().slice(0, 10) : ''})`).join('; ') +
        ' → do usunięcia',
    )
    if (apply && stagesFix) {
      await prisma.$transaction(async (tx) => {
        for (const { c, s } of wrong) {
          await tx.contractStage.delete({ where: { id: s.id } })
          await tx.contractHistory.create({
            data: {
              contractId: c.id,
              event: 'KOREKTA',
              details: `Usunięto zbędny etap ${s.stage} (${s.status}) — rekord ${c.number} to ${c.number.endsWith('/R') ? 'umowa rezerwacyjna' : 'umowa deweloperska'} pary (skrypt fix-contract-pairs)`,
            },
          })
        }
      })
      console.log('   usunięto.')
    } else if (apply) {
      console.log('   (bez --stages nie usuwam)')
    }
  }

  console.log(
    `\nPar …/R + …/D: ${[...pairs.values()].filter((p) => p.R && p.D).length}; skrzyżowane typy: ${swapped}; zdublowane harmonogramy: ${duplicates}; ` +
      `umowy deweloperskie z ratami bez escrow ${escrowAll ? '(wszystkie przypadki)' : '(tylko całe harmonogramy)'}: ${escrowFixed} (${escrowRatsTotal} rat); pary ze zbędnymi etapami: ${stagesFixed}; ` +
      `rekordy …/R awansowane etapem: ${advancedR}.`,
  )
  if (!apply) console.log('DRY-RUN. Uruchom z --apply (i ewentualnie --dedupe / --escrow / --escrow-all / --stages / --revert-r), aby zapisać zmiany.')
}

main()
  .catch((e) => {
    console.error('BŁĄD:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
