// Hurtowe przypisanie rachunkow wirtualnych ING (OMRP) do LOKALI, wg listy
// "Poprawne Rachunki Wirtualne" (ING, przedsiewziecie Zgierz dz. 43/1 i 44/6,
// id 0001, MRP 65 1050 1461 1000 0090 8578 0303).
//
// ING nadaje rachunek wirtualny per LOKAL — zapisujemy go w
// Unit.escrowSubaccount (widoczny na karcie lokalu). Umowa lokalu DZIEDZICZY
// numer automatycznie przy dopasowaniu wplat (lib/bank-reconcile.ts);
// Contract.escrowSubaccount pozostaje recznym nadpisaniem.
//
// Dopasowanie numeru lokalu: koncowa liczba w Unit.number ("12", "M12",
// "A0.001" -> 1). Idempotentny; dry-run pokazuje KAZDE dopasowanie.
//
// Uzycie (Coolify Terminal / lokalnie):
//   node scripts/set-escrow-subaccounts.js               # dry-run (bez zapisu)
//   node scripts/set-escrow-subaccounts.js --commit      # zapis
//   node scripts/set-escrow-subaccounts.js --commit --overwrite  # nadpisz rozne istniejace
//   node scripts/set-escrow-subaccounts.js --prefix=Z.   # tylko lokale o numerze zaczynajacym sie od "Z."
//     (uzyj gdy CRM ma lokale wielu inwestycji z powtarzajacymi sie koncowkami numerow)

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const COMMIT = process.argv.includes('--commit')
const OVERWRITE = process.argv.includes('--overwrite')
const PREFIX = (process.argv.find((a) => a.startsWith('--prefix=')) || '').split('=')[1] || null

// lokal -> NRB (26 cyfr) — zrodlo prawdy: lib/data/ing-subaccounts-zgierz.json
// (wspolne ze zbiorczym przyciskiem w zakladce Subrachunki).
const SUBACCOUNTS = require('../lib/data/ing-subaccounts-zgierz.json')

// Walidacja IBAN (PL + NRB, mod-97) — zabezpieczenie przed literowka w liscie.
function validNrb(nrb) {
  if (!/^\d{26}$/.test(nrb)) return false
  // IBAN: przenies "PL" + suma kontrolna na koniec: <BBAN>"PL"<cc> -> cyfry, mod 97 == 1
  const rearranged = nrb.slice(2) + '2521' + nrb.slice(0, 2) // P=25, L=21
  let rem = 0
  for (const ch of rearranged) rem = (rem * 10 + (ch.charCodeAt(0) - 48)) % 97
  return rem === 1
}

const fmtNrb = (nrb) => `${nrb.slice(0, 2)} ${nrb.slice(2, 6)} ${nrb.slice(6, 10)} ${nrb.slice(10, 14)} ${nrb.slice(14, 18)} ${nrb.slice(18, 22)} ${nrb.slice(22, 26)}`

// Koncowa liczba w numerze lokalu: "12"->12, "M12"->12, "M 12"->12. null gdy brak.
function unitNo(number) {
  const m = String(number || '').match(/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : null
}

async function main() {
  console.log(COMMIT ? `== TRYB ZAPISU (--commit${OVERWRITE ? ' --overwrite' : ''}) ==` : '== DRY-RUN (bez zmian; --commit zapisuje) ==')

  const badNrb = Object.entries(SUBACCOUNTS).filter(([, nrb]) => !validNrb(nrb))
  if (badNrb.length) {
    console.error('BLAD: niepoprawne NRB (suma kontrolna):', badNrb.map(([k]) => `lokal ${k}`).join(', '))
    process.exit(1)
  }
  console.log(`Lista ING: ${Object.keys(SUBACCOUNTS).length} lokali, wszystkie NRB poprawne (mod-97).`)

  const units = await prisma.unit.findMany({
    where: PREFIX ? { number: { startsWith: PREFIX, mode: 'insensitive' } } : undefined,
    select: {
      id: true, number: true, escrowSubaccount: true, building: true,
      contractUnits: {
        select: { contract: { select: { number: true, client: { select: { firstName: true, lastName: true } } } } },
      },
    },
    orderBy: { number: 'asc' },
  })
  if (PREFIX) console.log(`Filtr numeru lokalu: "${PREFIX}*" -> ${units.length} lokali.`)

  // Guard: ta sama koncowka numeru w WIELU lokalach (np. A0.001 i B0.001) —
  // niejednoznaczne, pomijamy (przypisz recznie na kartach lokali).
  const claims = new Map()
  for (const u of units) {
    const n = unitNo(u.number)
    if (n == null || !SUBACCOUNTS[n]) continue
    if (!claims.has(n)) claims.set(n, [])
    claims.get(n).push(u)
  }
  const dupes = [...claims.entries()].filter(([, us]) => us.length > 1)
  if (dupes.length) {
    console.log('\n⚠ Koncowka numeru wystepuje w WIELU lokalach (pomijam — przypisz recznie na karcie lokalu):')
    for (const [n, us] of dupes) console.log(`  lokal ${n}: ${us.map((u) => u.number).join(', ')}`)
  }

  let toSet = 0, same = 0, conflict = 0
  const assigned = new Set()

  console.log('\n--- Lokale ---')
  for (const [n, us] of [...claims.entries()].sort((a, b) => a[0] - b[0])) {
    if (us.length > 1) continue
    const u = us[0]
    const nrb = fmtNrb(SUBACCOUNTS[n])
    assigned.add(n)
    // Info o umowie/nabywcy lokalu (dziedziczenie) — pomocne w przegladzie.
    const contracts = u.contractUnits.map((cu) => cu.contract).filter(Boolean)
    const who = contracts.length
      ? contracts.map((c) => `${c.number}${c.client ? ` / ${c.client.firstName} ${c.client.lastName}` : ''}`).join('; ')
      : 'bez umowy'
    const existingNorm = (u.escrowSubaccount || '').replace(/[^0-9A-Za-z]/g, '')
    if (existingNorm === SUBACCOUNTS[n]) {
      same++
      console.log(`  = lokal ${u.number} (${who}): juz ustawiony`)
      continue
    }
    if (existingNorm && !OVERWRITE) {
      conflict++
      console.log(`  ⚠ lokal ${u.number} (${who}): ma JUZ INNY numer (${u.escrowSubaccount}) — pomijam (uzyj --overwrite)`)
      continue
    }
    toSet++
    console.log(`  + lokal ${u.number} (${who}): ${nrb}${existingNorm ? '  [NADPISZE]' : ''}`)
    if (COMMIT) {
      await prisma.unit.update({ where: { id: u.id }, data: { escrowSubaccount: nrb } })
    }
  }

  const notFound = Object.keys(SUBACCOUNTS).map(Number).filter((n) => !assigned.has(n))
  console.log(`\n--- Pozycje z listy ING bez lokalu w CRM (${notFound.length}) ---`)
  console.log('  ' + (notFound.join(', ') || 'brak'))
  if (notFound.length) console.log('  (dodaj lokale w CRM i uruchom skrypt ponownie — dopisze numery)')

  console.log(`\n${COMMIT ? 'Zapisano' : 'Do zapisania'}: ${toSet} • juz ustawione: ${same} • konflikty: ${conflict} • niejednoznaczne: ${dupes.length}`)
  if (!COMMIT) console.log('Uruchom z --commit aby zapisac.')
  console.log('Umowy dziedzicza numery z lokali automatycznie (dopasowanie wplat) — nic wiecej nie trzeba robic.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
