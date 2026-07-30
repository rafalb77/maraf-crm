// Hurtowe przypisanie subrachunkow wirtualnych ING (OMRP) do umow, wg listy
// "Poprawne Rachunki Wirtualne" (ING, przedsiewziecie Zgierz dz. 43/1 i 44/6,
// id 0001, MRP 65 1050 1461 1000 0090 8578 0303).
//
// Rachunek wirtualny jest przypisany do LOKALU. W CRM subrachunek trzymamy na
// UMOWIE (Contract.escrowSubaccount — czyta go silnik dopasowania wplat), wiec
// skrypt idzie po sciezce: lokal z listy -> ContractUnit -> umowa -> zapis.
// Lokal bez umowy = na razie pomijany; PO UTWORZENIU umowy wystarczy
// uruchomic skrypt ponownie (idempotentny).
//
// Dopasowanie numeru lokalu: koncowa liczba w Unit.number ("12", "M12",
// "M 12" -> 12). Dry-run pokazuje KAZDE dopasowanie do przegladu.
//
// Uzycie (Coolify Terminal / lokalnie):
//   node scripts/set-escrow-subaccounts.js               # dry-run (bez zapisu)
//   node scripts/set-escrow-subaccounts.js --commit      # zapis
//   node scripts/set-escrow-subaccounts.js --commit --overwrite  # nadpisz rozne istniejace
//   node scripts/set-escrow-subaccounts.js --investment=Zgierz   # tylko umowy tej inwestycji

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const COMMIT = process.argv.includes('--commit')
const OVERWRITE = process.argv.includes('--overwrite')
const INVESTMENT = (process.argv.find((a) => a.startsWith('--investment=')) || '').split('=')[1] || null

// lokal -> NRB (26 cyfr) — 1:1 z PDF ING.
const SUBACCOUNTS = {
  1: '51105004646215000190000000',
  2: '24105004646215000190000001',
  3: '94105004646215000190000002',
  4: '67105004646215000190000003',
  5: '40105004646215000190000004',
  6: '13105004646215000190000005',
  7: '83105004646215000190000006',
  8: '56105004646215000190000007',
  9: '29105004646215000190000008',
  10: '02105004646215000190000009',
  11: '72105004646215000190000010',
  12: '45105004646215000190000011',
  13: '18105004646215000190000012',
  14: '88105004646215000190000013',
  15: '61105004646215000190000014',
  16: '34105004646215000190000015',
  17: '07105004646215000190000016',
  18: '77105004646215000190000017',
  19: '50105004646215000190000018',
  20: '23105004646215000190000019',
  21: '93105004646215000190000020',
  22: '66105004646215000190000021',
  23: '39105004646215000190000022',
  24: '12105004646215000190000023',
  25: '82105004646215000190000024',
  26: '55105004646215000190000025',
  27: '28105004646215000190000026',
  28: '98105004646215000190000027',
  29: '71105004646215000190000028',
  30: '44105004646215000190000029',
  31: '17105004646215000190000030',
  32: '87105004646215000190000031',
  33: '60105004646215000190000032',
  34: '33105004646215000190000033',
  35: '06105004646215000190000034',
  36: '76105004646215000190000035',
  37: '49105004646215000190000036',
  38: '22105004646215000190000037',
  39: '92105004646215000190000038',
  40: '65105004646215000190000039',
  41: '38105004646215000190000040',
  42: '11105004646215000190000041',
  43: '81105004646215000190000042',
  44: '54105004646215000190000043',
  45: '27105004646215000190000044',
  46: '97105004646215000190000045',
  47: '70105004646215000190000046',
  48: '43105004646215000190000047',
  49: '16105004646215000190000048',
  50: '86105004646215000190000049',
  51: '59105004646215000190000050',
  52: '32105004646215000190000051',
  53: '05105004646215000190000052',
  54: '75105004646215000190000053',
  55: '48105004646215000190000054',
  56: '21105004646215000190000055',
  57: '91105004646215000190000056',
  58: '64105004646215000190000057',
  59: '37105004646215000190000058',
}

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

  const contracts = await prisma.contract.findMany({
    where: {
      contractUnits: { some: {} },
      ...(INVESTMENT ? { investmentName: { contains: INVESTMENT, mode: 'insensitive' } } : {}),
    },
    select: {
      id: true, number: true, escrowSubaccount: true, investmentName: true,
      client: { select: { firstName: true, lastName: true } },
      contractUnits: { select: { unit: { select: { number: true } } } },
    },
    orderBy: { number: 'asc' },
  })
  if (INVESTMENT) console.log(`Filtr inwestycji: "${INVESTMENT}" -> ${contracts.length} umow.`)

  // Guard: ten sam lokal (koncowka numeru) w WIELU umowach — np. rozne budynki
  // maja lokale .001. Takich nie przypisujemy automatycznie (zawezic przez
  // --investment= albo wpisac recznie w zakladce Subrachunki).
  const lokalClaims = new Map()
  for (const c of contracts) {
    for (const n of new Set(c.contractUnits.map((cu) => unitNo(cu.unit?.number)).filter((n) => n != null && SUBACCOUNTS[n]))) {
      if (!lokalClaims.has(n)) lokalClaims.set(n, [])
      lokalClaims.get(n).push(c.number)
    }
  }
  const dupes = [...lokalClaims.entries()].filter(([, cs]) => cs.length > 1)
  if (dupes.length) {
    console.log('\n⚠ Lokale wystepujace w WIELU umowach (pomijam — zawezic --investment= lub przypisac recznie):')
    for (const [n, cs] of dupes) console.log(`  lokal ${n}: umowy ${cs.join(', ')}`)
  }
  const dupeSet = new Set(dupes.map(([n]) => n))

  const assignedLokale = new Set()
  let toSet = 0, same = 0, conflict = 0, multi = 0

  console.log('\n--- Umowy z lokalami ---')
  for (const c of contracts) {
    const buyer = c.client ? `${c.client.firstName} ${c.client.lastName}` : '—'
    const lokale = c.contractUnits.map((cu) => unitNo(cu.unit?.number)).filter((n) => n != null && SUBACCOUNTS[n] && !dupeSet.has(n))
    const uniqLokale = [...new Set(lokale)]
    if (uniqLokale.length === 0) continue
    if (uniqLokale.length > 1) {
      multi++
      console.log(`  ⚠ ${c.number} (${buyer}): ${uniqLokale.length} lokale z listy (${uniqLokale.join(', ')}) — POMIJAM, przypisz recznie w zakladce Subrachunki`)
      continue
    }
    const lokal = uniqLokale[0]
    const nrb = fmtNrb(SUBACCOUNTS[lokal])
    assignedLokale.add(lokal)
    const existingNorm = (c.escrowSubaccount || '').replace(/[^0-9A-Za-z]/g, '')
    if (existingNorm === SUBACCOUNTS[lokal]) {
      same++
      console.log(`  = lokal ${lokal} -> ${c.number} (${buyer}): juz ustawiony`)
      continue
    }
    if (existingNorm && !OVERWRITE) {
      conflict++
      console.log(`  ⚠ lokal ${lokal} -> ${c.number} (${buyer}): ma JUZ INNY numer (${c.escrowSubaccount}) — pomijam (uzyj --overwrite aby nadpisac)`)
      continue
    }
    toSet++
    console.log(`  + lokal ${lokal} -> ${c.number} (${buyer}): ${nrb}${existingNorm ? '  [NADPISZE]' : ''}`)
    if (COMMIT) {
      await prisma.contract.update({ where: { id: c.id }, data: { escrowSubaccount: nrb } })
    }
  }

  const withoutContract = Object.keys(SUBACCOUNTS).map(Number).filter((n) => !assignedLokale.has(n))
  console.log(`\n--- Lokale z listy ING bez umowy w CRM (${withoutContract.length}) ---`)
  console.log('  ' + (withoutContract.join(', ') || 'brak'))
  console.log('  (po utworzeniu umowy dla lokalu uruchom skrypt ponownie — dopisze mu numer)')

  console.log(`\n${COMMIT ? 'Zapisano' : 'Do zapisania'}: ${toSet} • juz ustawione: ${same} • konflikty: ${conflict} • wielolokalowe: ${multi}`)
  if (!COMMIT) console.log('Uruchom z --commit aby zapisac.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
