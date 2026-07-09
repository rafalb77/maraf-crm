/**
 * Kamienie milowe z prospektu informacyjnego (Nova Staffa / Zgierz Staffa) + etapy-szkielety
 * dla prac bez szczegółowego harmonogramu. Moduł Budowa, Etap 2.
 *
 * Źródło: harmonogram przedsięwzięcia deweloperskiego z prospektu (ING Bank Śląski,
 * rachunek powierniczy) — 7 etapów z terminami i % transz. Te terminy są UMOWNE:
 * od ich dotrzymania zależą wypłaty transz eskrow. W systemie = kamienie milowe
 * (isMilestone, numeracja P.1–P.7 — poza WBS z Excela, więc reimport harmonogramu
 * Konrada ich nie dotyka).
 *
 * Etapy 4–7 prospektu nie mają jeszcze szczegółowego harmonogramu — tworzymy
 * etapy-szkielety z zakresem prospektu w notatkach; szczegółowe zadania rozpisze
 * kierownik budowy w UI (/budowa/harmonogram).
 *
 * Idempotentny (upsert po numerze kamienia / nazwie etapu). Uruchomienie:
 *  - lokalnie:  node scripts/seed-prospekt-milestones.js
 *  - produkcja: node scripts/seed-prospekt-milestones.js  (Coolify Terminal)
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// data "yyyy-mm-dd" → południe UTC (stabilny dzień kalendarzowy, jak importer)
function d(iso) {
  const [y, m, dd] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd, 12, 0, 0))
}

// Etapy-szkielety dla prac bez szczegółowego harmonogramu (prospekt etap 4-7).
// order: 3.. (Stan zero=1, Konstrukcja=2 z importu Excela)
const NEW_STAGES = [
  {
    key: 'E4',
    name: 'Kl. A — okna, ścianki, instalacje, tynki, dach',
    order: 3,
    plannedEnd: d('2026-10-11'),
    notes:
      'Zakres z prospektu (etap 4, transza 15%, termin 11.10.2026):\n' +
      '1. Dostawa i montaż okien w lokalach kl. A\n' +
      '2. Ścianki działowe + kominy kl. A, B, C\n' +
      '3. Piony instalacji wewnętrznych kl. A, B, C\n' +
      '4. Instalacje elektryczne w lok. kl. A\n' +
      '5. Tynki wewnętrzne kl. A\n' +
      '6. Izolacja dachu\n' +
      '7. Attyka i kominy\n' +
      'Szczegółowe zadania rozpisze kierownik budowy.',
  },
  {
    key: 'E5',
    name: 'Kl. B i C — okna, instalacje, tynki',
    order: 4,
    plannedEnd: d('2027-02-18'),
    notes:
      'Zakres z prospektu (etap 5, transza 15%, termin 18.02.2027):\n' +
      '1. Dostawa i montaż okien w lokalach kl. B, C\n' +
      '2. Instalacja CWU + ogrzewanie podłogowe kl. A, B, C\n' +
      '3. Podkłady pod posadzki kl. A, B, C\n' +
      '4. Instalacje elektryczne w lok. kl. B, C\n' +
      '5. Tynki wewnętrzne kl. B, C\n' +
      'Szczegółowe zadania rozpisze kierownik budowy.',
  },
  {
    key: 'E6',
    name: 'Wykończenie części wspólnych + elewacja',
    order: 5,
    plannedEnd: d('2027-05-30'),
    notes:
      'Zakres z prospektu (etap 6, transza 10%, termin 30.05.2027):\n' +
      '1. Posadzki w garażu\n' +
      '2. Prace wykończeniowe w garażu\n' +
      '3. Tynki zewnętrzne + obróbki blacharskie\n' +
      '4. Montaż wind\n' +
      '5. Stolarka drzwiowa + okna na kl. schodowych\n' +
      '6. Wykończenie korytarzy + kl. schodowych\n' +
      'Szczegółowe zadania rozpisze kierownik budowy.',
  },
  {
    key: 'E7',
    name: 'Prace zewnętrzne i odbiory',
    order: 6,
    plannedEnd: d('2027-09-30'),
    notes:
      'Zakres z prospektu (etap 7, transza 10%, termin 30.09.2027):\n' +
      '1. Ogrodzenia i balustrady\n' +
      '2. Przyłącza wod-kan, węzeł cieplny, woda, prąd\n' +
      '3. Zagospodarowanie terenu, utwardzenia, humusowanie\n' +
      '4. Montaż osprzętu instalacyjnego\n' +
      '5. Odbiory: pomiary geodezyjne, ppoż, PINB, samodzielność lokali\n' +
      'Szczegółowe zadania rozpisze kierownik budowy.',
  },
]

// Kamienie: [numer, nazwa, data, przypięcie: 'stan-zero' | 'konstrukcja' | klucz nowego etapu]
const MILESTONES = [
  ['P.1', 'Prospekt etap 1: stan zero + pozwolenie na budowę (transza 20%)', '2025-10-20', 'stan-zero'],
  ['P.2', 'Prospekt etap 2: ściany parteru i I piętra + stropy (transza 15%)', '2026-02-20', 'konstrukcja'],
  ['P.3', 'Prospekt etap 3: ściany i stropy II–IV piętra (transza 15%)', '2026-06-10', 'konstrukcja'],
  ['P.4', 'Prospekt etap 4: kl. A — okna, instalacje, tynki, dach (transza 15%)', '2026-10-11', 'E4'],
  ['P.5', 'Prospekt etap 5: kl. B i C — okna, instalacje, tynki (transza 15%)', '2027-02-18', 'E5'],
  ['P.6', 'Prospekt etap 6: części wspólne + elewacja (transza 10%)', '2027-05-30', 'E6'],
  ['P.7', 'Prospekt etap 7: prace zewnętrzne + odbiory PINB (transza 10%)', '2027-09-30', 'E7'],
]

const MILESTONE_DESC =
  'Termin umowny z prospektu informacyjnego (harmonogram przedsięwzięcia deweloperskiego, ' +
  'rachunek powierniczy ING). Po zakończeniu etapu — wypłata transzy eskrow.'

async function main() {
  const inv = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!inv) throw new Error('Brak aktywnej inwestycji — najpierw seed inwestycji.')
  console.log('Inwestycja:', inv.name)

  // Termin końcowy inwestycji = ostatni kamień prospektu (jeśli nie ustawiony ręcznie)
  if (!inv.plannedEndDate) {
    await prisma.investment.update({
      where: { id: inv.id },
      data: { plannedEndDate: d('2027-09-30') },
    })
    console.log('Ustawiono plannedEndDate inwestycji: 30.09.2027 (prospekt etap 7)')
  }

  // Istniejące etapy z importu Excela (dopasowanie fuzzy po nazwie)
  const stages = await prisma.constructionStage.findMany({ where: { investmentId: inv.id } })
  const byKey = {}
  const stanZero = stages.find((s) => /stan\s*zero/i.test(s.name))
  const konstrukcja = stages.find((s) => /konstrukcja/i.test(s.name))
  if (stanZero) byKey['stan-zero'] = stanZero.id
  if (konstrukcja) byKey['konstrukcja'] = konstrukcja.id

  // Etapy-szkielety (upsert po unikalnej parze investmentId+name)
  for (const s of NEW_STAGES) {
    const existing = stages.find((x) => x.name === s.name)
    if (existing) {
      byKey[s.key] = existing.id
      console.log('Etap istnieje:', s.name)
    } else {
      const created = await prisma.constructionStage.create({
        data: {
          investmentId: inv.id,
          name: s.name,
          order: s.order,
          plannedEnd: s.plannedEnd,
          notes: s.notes,
        },
      })
      byKey[s.key] = created.id
      console.log('Utworzono etap:', s.name)
    }
  }

  // Kamienie (idempotentnie po number)
  let created = 0
  let skipped = 0
  for (const [number, name, dateISO, stageKey] of MILESTONES) {
    const exists = await prisma.constructionTask.findFirst({
      where: { investmentId: inv.id, number },
      select: { id: true },
    })
    if (exists) {
      skipped++
      continue
    }
    const when = d(dateISO)
    await prisma.constructionTask.create({
      data: {
        investmentId: inv.id,
        stageId: byKey[stageKey] || null,
        number,
        name,
        description: MILESTONE_DESC,
        isMilestone: true,
        plannedStart: when,
        plannedEnd: when,
        orderIndex: 900 + created, // na końcu grupy etapu, po zadaniach z Excela
      },
    })
    created++
    console.log(`Kamień ${number}: ${dateISO} — ${name}`)
  }

  console.log(`\nGotowe. Kamienie: ${created} nowych, ${skipped} istniało. Etapy-szkielety: ${NEW_STAGES.length}.`)
}

main()
  .catch((e) => {
    console.error('BŁĄD:', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
