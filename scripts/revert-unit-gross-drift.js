/* eslint-disable */
/**
 * Cofnięcie skutków PIERWSZEJ wersji scripts/fix-unit-gross-prices.js
 * (commit bc39596), która przeliczała brutto = round2(netto × VAT) także dla
 * lokali z okrągłą ceną brutto z cennika (np. 45 000,00 → 45 000,01 zł),
 * gdzie netto = round2(brutto ÷ VAT) było jedynie pochodną.
 *
 * Skrypt nie zapisywał PriceHistory, więc ostatni wpis historii = cena SPRZED
 * skryptu. Przywracamy brutto z historii TYLKO gdy:
 *   - bieżące brutto == round2(netto × VAT)          (ślad skryptu),
 *   - historyczne brutto != bieżące,
 *   - netto == round2(historyczne brutto ÷ VAT)      (brutto było źródłem).
 * Prawdziwe naprawy (stary wzór powierzchnia × stawka, np. M16) nie spełniają
 * ostatniego warunku i ZOSTAJĄ.
 *
 * Lokale bez historii: wypisujemy kandydatów (wartości brutto co grosz wokół
 * bieżącej, dla których netto = round2(G ÷ VAT)); `--apply-round` przywraca
 * te z JEDNYM kandydatem w pełnych złotych (typowa cena cennikowa).
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/revert-unit-gross-drift.js                 # dry-run
 *   node scripts/revert-unit-gross-drift.js --apply         # cofnij wg historii
 *   node scripts/revert-unit-gross-drift.js --apply --apply-round  # + jednoznaczne pełne zł
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const apply = process.argv.includes('--apply')
const applyRound = process.argv.includes('--apply-round')
const round2 = (n) => Math.round(n * 100) / 100
const eq = (a, b) => Math.abs(a - b) < 0.005

async function main() {
  const units = await prisma.unit.findMany({
    where: { pricePerSqmNet: { gt: 0 }, area: { gt: 0 } },
    select: {
      id: true, number: true, vatRate: true, priceNet: true, priceGross: true,
      priceHistory: { orderBy: { changedAt: 'desc' }, take: 1, select: { priceGross: true, changedAt: true } },
    },
    orderBy: { number: 'asc' },
  })

  const byHistory = [] // pewne cofnięcia
  const manual = []    // bez historii — kandydaci
  let untouched = 0

  for (const u of units) {
    const vat = 1 + (u.vatRate ?? 8) / 100
    if (!eq(round2(u.priceNet * vat), u.priceGross)) { untouched++; continue } // brak śladu skryptu

    const hist = u.priceHistory[0]
    if (hist) {
      if (!eq(hist.priceGross, u.priceGross) && eq(round2(hist.priceGross / vat), u.priceNet)) {
        byHistory.push({ id: u.id, number: u.number, from: u.priceGross, to: hist.priceGross, at: hist.changedAt })
      } else {
        untouched++ // historia zgodna z bieżącym albo prawdziwa naprawa (M16)
      }
      continue
    }

    // Bez historii. Bieżące brutto w pełnych złotych i spójne z netto w obie
    // strony = nienaruszona cena cennikowa (stary skrypt psuł WŁAŚNIE okrągłe
    // ceny na nieokrągłe, nigdy odwrotnie) — pomijamy, żeby nie kusić do
    // ręcznej "poprawki" prawidłowej ceny.
    if (eq(u.priceGross, Math.round(u.priceGross)) && eq(round2(u.priceGross / vat), u.priceNet)) {
      untouched++
      continue
    }
    // Kandydaci G (co grosz, ±3 gr) z netto == round2(G / VAT), G != bieżące.
    const cands = []
    for (let k = -3; k <= 3; k++) {
      const g = round2(u.priceGross + k / 100)
      if (k !== 0 && eq(round2(g / vat), u.priceNet)) cands.push(g)
    }
    if (cands.length > 0) {
      const wholeZl = cands.filter((g) => eq(g, Math.round(g)))
      manual.push({ id: u.id, number: u.number, cur: u.priceGross, cands, unique: wholeZl.length === 1 ? wholeZl[0] : null })
    } else {
      untouched++
    }
  }

  console.log(`Lokali za m²: ${units.length} | bez zmian: ${untouched} | cofnięcia wg historii: ${byHistory.length} | bez historii do decyzji: ${manual.length}`)
  if (byHistory.length) {
    console.log('\nCOFNIĘCIA WG HISTORII CEN (pewne):')
    for (const f of byHistory) {
      console.log(`  - ${f.number}: ${f.from.toFixed(2)} -> ${f.to.toFixed(2)}  (historia z ${f.at.toISOString().slice(0, 10)})`)
    }
  }
  if (manual.length) {
    console.log('\nBEZ HISTORII — kandydaci (--apply-round przywraca jednoznaczne pełne złote):')
    for (const m of manual) {
      const tag = m.unique != null ? `=> ${m.unique.toFixed(2)} (pełne zł)` : 'NIEJEDNOZNACZNE — zdecyduj ręcznie'
      console.log(`  - ${m.number}: teraz ${m.cur.toFixed(2)}, kandydaci: ${m.cands.map((c) => c.toFixed(2)).join(' / ')}  ${tag}`)
    }
  }

  if (!apply) {
    console.log('\nDRY-RUN. Uruchom z --apply (i opcjonalnie --apply-round), aby zapisać.')
    return
  }

  let n = 0
  for (const f of byHistory) {
    await prisma.unit.update({ where: { id: f.id }, data: { priceGross: f.to } })
    n++
  }
  if (applyRound) {
    for (const m of manual) {
      if (m.unique == null) continue
      await prisma.unit.update({ where: { id: m.id }, data: { priceGross: m.unique } })
      n++
    }
  }
  console.log(`\nPrzywrócono brutto w ${n} lokalach.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
