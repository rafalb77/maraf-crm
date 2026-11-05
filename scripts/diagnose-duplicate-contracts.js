/* eslint-disable */
/**
 * Diagnostyka ZDUBLOWANYCH umów — TYLKO ODCZYT.
 *
 * Szuka lokali, które są składnikiem więcej niż jednej AKTYWNEJ umowy
 * (status inny niż ROZWIAZANA/ANULOWANA), i pokazuje te umowy obok siebie:
 * numer, typ, status, data podpisania, klient, składniki, kiedy utworzona
 * (import z Excela 21.05.2026 = rekordy MD/UF/…). Osobno wypisuje umowy, które
 * mają datę podpisania, ale status inny niż PODPISANA (ślad importu — karta
 * pokazuje przy etapie „Data … · niepodpisana").
 *
 * Co z duplikatem: na karcie zbędnej umowy „Anuluj" (status Anulowana).
 * Od 05.11.2026 anulowanie / usunięcie umowy NIE zwalnia lokalu, który jest
 * też na innej aktywnej umowie — lokal dostaje stan wg tamtej umowy.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/diagnose-duplicate-contracts.js
 *   node scripts/diagnose-duplicate-contracts.js --client=Boruch
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const clientArg = process.argv.find((a) => a.startsWith('--client='))
const clientFilter = clientArg ? clientArg.split('=')[1].toLowerCase() : null
const fmtD = (d) => (d ? new Date(d).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) : '—')
const fmtDT = (d) => (d ? new Date(d).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', hour12: false }) : '—')

async function main() {
  const contracts = await prisma.contract.findMany({
    where: { status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] } },
    include: {
      client: { select: { firstName: true, lastName: true } },
      contractUnits: { include: { unit: { select: { id: true, number: true, type: true, status: true, reservationType: true } } } },
      stages: { select: { stage: true, status: true, signedAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const name = (c) => (c.client ? `${c.client.lastName} ${c.client.firstName}` : '—')
  const describe = (c) =>
    `${c.number.padEnd(16)} [${c.type}/${c.status}${c.signedAt ? ', podpisana ' + fmtD(c.signedAt) : ''}] ${name(c)} — ` +
    `składniki: ${c.contractUnits.map((cu) => `${cu.unit.number}(${cu.unit.status}/${cu.unit.reservationType || '—'})`).join(', ')}; ` +
    `utworzona ${fmtDT(c.createdAt)}${c.number.startsWith('MD/UF/') ? ' (import z Excela)' : ''}`

  // --- 1. lokal na kilku aktywnych umowach ---
  const byUnit = new Map()
  for (const c of contracts) {
    if (clientFilter && !name(c).toLowerCase().includes(clientFilter)) continue
    for (const cu of c.contractUnits) {
      if (!byUnit.has(cu.unit.number)) byUnit.set(cu.unit.number, [])
      byUnit.get(cu.unit.number).push(c)
    }
  }
  let dupUnits = 0
  console.log('=== Lokale na więcej niż jednej aktywnej umowie ===')
  for (const [unitNumber, cs] of byUnit) {
    if (cs.length < 2) continue
    dupUnits++
    const sameClient = new Set(cs.map(name)).size === 1
    const pair = cs.length === 2 && cs.every((c) => /\/(R|D)$/.test(c.number)) && cs[0].number.replace(/\/(R|D)$/, '') === cs[1].number.replace(/\/(R|D)$/, '')
    console.log(`\n${unitNumber}: ${cs.length} umowy${sameClient ? ' (ten sam klient)' : ' (RÓŻNI klienci!)'}${pair ? ' — para …/R + …/D z importu (rezerwacyjna + deweloperska tego samego numeru: to NIE duplikat)' : ''}`)
    for (const c of cs) console.log('   ' + describe(c))
    if (!pair && sameClient) {
      const imported = cs.filter((c) => c.number.startsWith('MD/UF/'))
      const prep = cs.filter((c) => c.status === 'W_PRZYGOTOWANIU')
      const hint = imported.length === 1 ? imported[0] : prep.length === 1 ? prep[0] : null
      console.log(
        hint
          ? `   → prawdopodobny duplikat: ${hint.number} (${hint.number.startsWith('MD/UF/') ? 'rekord z importu' : 'w przygotowaniu'}). Na jego karcie: status „Anulowana" — lokal ${unitNumber} zostanie pod drugą umową.`
          : '   → oceń ręcznie, która umowa jest właściwa; zbędną anuluj na jej karcie.',
      )
    }
  }
  if (dupUnits === 0) console.log('(brak)')

  // --- 2. data podpisania bez statusu PODPISANA ---
  console.log('\n=== Umowy z datą podpisania, ale statusem innym niż PODPISANA ===')
  let n = 0
  for (const c of contracts) {
    if (clientFilter && !name(c).toLowerCase().includes(clientFilter)) continue
    const stageDated = c.stages.find((s) => s.stage === c.type && s.signedAt && s.status !== 'PODPISANA')
    if (c.status !== 'PODPISANA' && (c.signedAt || stageDated)) {
      n++
      console.log(`   ${describe(c)}${stageDated ? ` — etap ${stageDated.stage} ma datę ${fmtD(stageDated.signedAt)} przy statusie ${stageDated.status}` : ''}`)
    }
  }
  if (n === 0) console.log('(brak)')
  console.log(`\nAktywnych umów: ${contracts.length}; lokali na kilku umowach: ${dupUnits}; umów z datą bez statusu podpisana: ${n}.`)
}

main()
  .catch((e) => {
    console.error('BŁĄD:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
