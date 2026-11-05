/* eslint-disable */
/**
 * Diagnostyka ZDUBLOWANYCH umów — TYLKO ODCZYT.
 *
 * 1. Lokale na więcej niż jednej AKTYWNEJ umowie (status inny niż ROZWIAZANA/
 *    ANULOWANA). Pary z importu …/R + …/D tego samego numeru (rezerwacyjna +
 *    deweloperska jednej transakcji) to NIE duplikaty — domyślnie tylko je
 *    zliczamy (--pairs wypisuje). Dla prawdziwych konfliktów: obie umowy obok
 *    siebie, stan lokalu, kto ma go w portfelu i historia obu umów (kiedy lokal
 *    wszedł, kiedy podpisano / awansowano etap).
 * 2. Umowy z datą podpisania, ale statusem innym niż PODPISANA (ślad importu —
 *    karta pokazuje przy etapie „Data … · niepodpisana").
 * 3. Rekordy …/R z pary o typie innym niż REZERWACYJNA (rekord rezerwacyjny
 *    awansowany etapem — Filipiak, 11.2026): klient wychodzi z dwiema umowami
 *    deweloperskimi (lista Sprzedaż, eksport dla banku).
 *    Naprawa: node scripts/fix-contract-pairs.js --apply --revert-r
 *
 * Co z duplikatem tego samego klienta: na karcie zbędnej umowy „Anuluj" (status
 * Anulowana) — od 05.11.2026 anulowanie / usunięcie umowy NIE zwalnia lokalu,
 * który jest też na innej aktywnej umowie. Lokal na umowach DWÓCH klientów:
 * ustal z dokumentów (akt / umowa), czyj jest; z drugiej umowy zdejmij go przez
 * „Edytuj składniki" (umowę podpisaną najpierw cofnij do „w przygotowaniu", po
 * edycji podpisz ponownie z tą samą datą). Od 05.11.2026 system nie pozwala
 * dołożyć ani podpisać lokalu, który jest na aktywnej umowie innego klienta.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/diagnose-duplicate-contracts.js
 *   node scripts/diagnose-duplicate-contracts.js --pairs           # pokaż też pary …/R + …/D
 *   node scripts/diagnose-duplicate-contracts.js --client=Boruch
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const clientArg = process.argv.find((a) => a.startsWith('--client='))
const clientFilter = clientArg ? clientArg.split('=')[1].toLowerCase() : null
const showPairs = process.argv.includes('--pairs')
const fmtD = (d) => (d ? new Date(d).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) : '—')
const fmtDT = (d) => (d ? new Date(d).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', hour12: false }) : '—')
const isPairNumber = (n) => /\/(R|D)$/.test(n)
const basePair = (n) => n.replace(/\/(R|D)$/, '')
const personName = (c) => (c ? `${c.lastName} ${c.firstName}` : '—')

async function main() {
  const contracts = await prisma.contract.findMany({
    where: { status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] } },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      contractUnits: {
        include: { unit: { select: { id: true, number: true, type: true, status: true, reservationType: true, reservedById: true } } },
      },
      stages: { select: { stage: true, status: true, signedAt: true } },
      history: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const name = (c) => personName(c.client)
  const matchesFilter = (c) => !clientFilter || name(c).toLowerCase().includes(clientFilter)
  const describe = (c) =>
    `${c.number.padEnd(16)} [${c.type}/${c.status}${c.signedAt ? ', podpisana ' + fmtD(c.signedAt) : ''}] ${name(c)} — ` +
    `składniki: ${c.contractUnits.map((cu) => `${cu.unit.number}(${cu.unit.status}/${cu.unit.reservationType || '—'})`).join(', ')}; ` +
    `utworzona ${fmtDT(c.createdAt)}${c.number.startsWith('MD/UF/') ? ' (import z Excela)' : ''}`
  const printHistory = (c, indent) => {
    if (!c.history.length) return console.log(`${indent}(brak wpisów w historii)`)
    for (const h of c.history) console.log(`${indent}${fmtDT(h.createdAt)}  ${h.event}${h.details ? ' — ' + h.details : ''}`)
  }

  // --- 1. lokal na kilku aktywnych umowach ---
  const byUnit = new Map()
  for (const c of contracts) {
    if (!matchesFilter(c)) continue
    for (const cu of c.contractUnits) {
      if (!byUnit.has(cu.unit.number)) byUnit.set(cu.unit.number, [])
      byUnit.get(cu.unit.number).push(c)
    }
  }
  let pairUnits = 0
  let conflicts = 0
  console.log('=== Lokale na więcej niż jednej aktywnej umowie ===')
  for (const [unitNumber, cs] of byUnit) {
    if (cs.length < 2) continue
    const sameClient = new Set(cs.map(name)).size === 1
    const pair = cs.length === 2 && cs.every((c) => isPairNumber(c.number)) && basePair(cs[0].number) === basePair(cs[1].number)
    if (pair) {
      pairUnits++
      if (!showPairs) continue
    } else {
      conflicts++
    }
    console.log(
      `\n${unitNumber}: ${cs.length} umowy${sameClient ? ' (ten sam klient)' : ' (RÓŻNI klienci!)'}` +
        (pair ? ' — para …/R + …/D z importu (rezerwacyjna + deweloperska tej samej transakcji: to NIE duplikat)' : ''),
    )
    for (const c of cs) console.log('   ' + describe(c))
    if (pair) continue

    // Szczegóły konfliktu: stan lokalu, portfel, historia obu umów.
    const unit = cs[0].contractUnits.find((cu) => cu.unit.number === unitNumber).unit
    const holder = unit.reservedById
      ? await prisma.client.findUnique({ where: { id: unit.reservedById }, select: { firstName: true, lastName: true } })
      : null
    console.log(`   stan lokalu: ${unit.status}/${unit.reservationType || '—'}${holder ? `, rezerwacja na: ${personName(holder)}` : ''}`)
    const portfolio = await prisma.clientUnit.findMany({
      where: { unitId: unit.id },
      include: { client: { select: { firstName: true, lastName: true } } },
      orderBy: { assignedAt: 'asc' },
    })
    console.log(
      `   w portfelu klientów: ${portfolio.length ? portfolio.map((p) => `${personName(p.client)} (od ${fmtDT(p.assignedAt)})`).join(', ') : '— nikogo'}`,
    )
    for (const c of cs) {
      console.log(`   historia ${c.number}:`)
      printHistory(c, '      ')
    }
    if (sameClient) {
      const imported = cs.filter((c) => c.number.startsWith('MD/UF/'))
      const prep = cs.filter((c) => c.status === 'W_PRZYGOTOWANIU')
      const hint = imported.length === 1 ? imported[0] : prep.length === 1 ? prep[0] : null
      console.log(
        hint
          ? `   → prawdopodobny duplikat: ${hint.number} (${hint.number.startsWith('MD/UF/') ? 'rekord z importu' : 'w przygotowaniu'}). Na jego karcie: status „Anulowana" — lokal ${unitNumber} zostanie pod drugą umową.`
          : '   → oceń ręcznie, która umowa jest właściwa; zbędną anuluj na jej karcie.',
      )
    } else {
      console.log(
        `   → RÓŻNI klienci na jednym lokalu: ustal z dokumentów (akt / umowa), czyj jest ${unitNumber}; z drugiej umowy zdejmij go przez „Edytuj składniki" ` +
          '(umowę podpisaną najpierw cofnij do „w przygotowaniu", po edycji podpisz ponownie z tą samą datą). Lokal zostanie w stanie wg umowy, na której został.',
      )
    }
  }
  if (conflicts === 0 && !(showPairs && pairUnits)) console.log('(brak)')
  if (!showPairs && pairUnits) console.log(`\n(pominięto ${pairUnits} lokali z par …/R + …/D z importu — to nie duplikaty; --pairs je wypisze)`)

  // --- 2. data podpisania bez statusu PODPISANA ---
  console.log('\n=== Umowy z datą podpisania, ale statusem innym niż PODPISANA ===')
  let n = 0
  for (const c of contracts) {
    if (!matchesFilter(c)) continue
    const stageDated = c.stages.find((s) => s.stage === c.type && s.signedAt && s.status !== 'PODPISANA')
    if (c.status !== 'PODPISANA' && (c.signedAt || stageDated)) {
      n++
      console.log(`   ${describe(c)}${stageDated ? ` — etap ${stageDated.stage} ma datę ${fmtD(stageDated.signedAt)} przy statusie ${stageDated.status}` : ''}`)
    }
  }
  if (n === 0) console.log('(brak)')

  // --- 3. rekord …/R z pary o typie innym niż REZERWACYJNA ---
  console.log('\n=== Rekordy …/R z pary awansowane etapem (typ inny niż rezerwacyjna) ===')
  const byBase = new Map()
  for (const c of contracts) {
    const m = c.number.match(/^(.*)\/(R|D)$/)
    if (!m) continue
    if (!byBase.has(m[1])) byBase.set(m[1], {})
    byBase.get(m[1])[m[2]] = c
  }
  let advanced = 0
  for (const pair of byBase.values()) {
    if (!pair.R || !pair.D || pair.R.type === 'REZERWACYJNA' || !matchesFilter(pair.R)) continue
    advanced++
    console.log(`\n   ${describe(pair.R)}`)
    console.log(`   umowa deweloperska tej transakcji: ${pair.D.number} [${pair.D.type}/${pair.D.status}${pair.D.signedAt ? ', podpisana ' + fmtD(pair.D.signedAt) : ''}]`)
    console.log(`   historia ${pair.R.number}:`)
    printHistory(pair.R, '      ')
    console.log('   → skutek: klient ma dwie umowy deweloperskie (lista Sprzedaż, eksport dla banku). Naprawa: node scripts/fix-contract-pairs.js --apply --revert-r')
  }
  if (advanced === 0) console.log('(brak)')

  console.log(
    `\nAktywnych umów: ${contracts.length}; lokali na umowach kilku klientów / zdublowanych (konflikty): ${conflicts}; ` +
      `lokali w parach …/R + …/D: ${pairUnits}; umów z datą bez statusu podpisana: ${n}; rekordów …/R awansowanych etapem: ${advanced}.`,
  )
}

main()
  .catch((e) => {
    console.error('BŁĄD:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
