/**
 * Seed DEV — generuje zróżnicowane lokale do testów widoku /units i filtrów.
 * NIE używać na produkcji (czyści tabele Unit i ClientUnit).
 * Uruchomienie: node scripts/seed-dev-units.js
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const r2 = (n) => Math.round(n * 100) / 100

async function main() {
  await prisma.clientUnit.deleteMany({})
  await prisma.unit.deleteMany({})

  const clientData = [
    ['Damian', 'Duniak'], ['Anna', 'Nowak'], ['Jan', 'Kowalski'], ['Piotr', 'Wiśniewski'],
    ['Maria', 'Wójcik'], ['Tomasz', 'Kamiński'], ['Katarzyna', 'Lewandowska'], ['Marek', 'Zieliński'],
  ]
  const clients = []
  for (const [firstName, lastName] of clientData) {
    clients.push(await prisma.client.create({ data: { firstName, lastName, status: 'KLIENT' } }))
  }

  const buildings = ['A', 'B', 'C']
  const units = []

  // Mieszkania (120) — piętra 0..5, pokoje 1..5
  for (let k = 0; k < 120; k++) {
    const b = buildings[k % 3]
    const floor = k % 6
    const rooms = 1 + (k % 5)
    const area = r2(28 + rooms * 12 + (k % 7))
    const ppsqm = 10500 + (k % 6) * 350
    const priceGross = r2(area * ppsqm)
    units.push({
      number: `${b}${floor}.${String(k + 1).padStart(3, '0')}`,
      type: 'MIESZKALNY', floor, rooms, area,
      pricePerSqmGross: ppsqm, pricePerSqmNet: r2(ppsqm / 1.08),
      priceNet: r2(priceGross / 1.08), priceGross, vatRate: 8,
    })
  }

  // Komórki lokatorskie (18) — bez pokoi
  for (let k = 0; k < 18; k++) {
    const b = buildings[k % 3]
    const floor = k % 3
    const area = r2(2.5 + (k % 4) * 0.8)
    const ppsqm = 6000
    const priceGross = r2(area * ppsqm)
    units.push({
      number: `${b}.K${String(k + 1).padStart(2, '0')}`,
      type: 'KOMORKA', floor, rooms: null, area,
      pricePerSqmGross: ppsqm, pricePerSqmNet: r2(ppsqm / 1.08),
      priceNet: r2(priceGross / 1.08), priceGross, vatRate: 8,
    })
  }

  // Parking / garaże (14) — podziemie (-1)
  for (let k = 0; k < 14; k++) {
    const b = buildings[k % 3]
    const isG = k % 2 === 0
    const area = isG ? r2(15 + (k % 3)) : 12.5
    const price = isG ? 65000 : 45000
    units.push({
      number: `${b}.${isG ? 'G' : 'P'}${String(k + 1).padStart(2, '0')}`,
      type: isG ? 'GARAZ' : 'PARKING', floor: -1, rooms: null, area,
      pricePerSqmGross: r2(price / area), pricePerSqmNet: r2(price / area / 1.23),
      priceNet: r2(price / 1.23), priceGross: price, vatRate: 23,
    })
  }

  // Lokale usługowe (6) — parter
  for (let k = 0; k < 6; k++) {
    const b = buildings[k % 3]
    const area = r2(60 + k * 12)
    const ppsqm = 9000
    const priceGross = r2(area * ppsqm)
    units.push({
      number: `${b}.U${String(k + 1).padStart(2, '0')}`,
      type: 'USLUGOWY', floor: 0, rooms: null, area,
      pricePerSqmGross: ppsqm, pricePerSqmNet: r2(ppsqm / 1.23),
      priceNet: r2(priceGross / 1.23), priceGross, vatRate: 23,
    })
  }

  // Statusy: 92 / 10 / 48 / 8 = 158, rozsiane permutacją (i*67 mod 158)
  const pool = [
    ...Array(92).fill('WOLNY'),
    ...Array(10).fill('ZAREZERWOWANY'),
    ...Array(48).fill('SPRZEDANY'),
    ...Array(8).fill('NIEDOSTEPNY'),
  ]
  const N = pool.length
  const statusAt = (i) => pool[(i * 67) % N]

  let idx = 0
  for (const u of units) {
    const status = statusAt(idx)
    const created = await prisma.unit.create({ data: { ...u, status } })
    if (status === 'SPRZEDANY' || status === 'ZAREZERWOWANY') {
      const c = clients[idx % clients.length]
      await prisma.clientUnit.create({ data: { clientId: c.id, unitId: created.id } })
    }
    idx++
  }

  console.log(`✅ Utworzono ${units.length} lokali, ${clients.length} klientów`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
