// Import units from Excel: replaces all existing units with the spreadsheet content.
// Skips units that are referenced by ContractUnit / ClientUnit / ServiceRequest (warns).
const path = require('path')
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const TYPE_MAP = {
  'Lokal mieszkalny': 'MIESZKALNY',
  'Lokal usługowy': 'USLUGOWY',
  'Miejsce postojowe': 'PARKING',
  'Miejsce garażowe': 'GARAZ',
  'Komórka lokatorska': 'KOMORKA',
}

// Default VAT: 8% for everything per business rule
const VAT_FOR = () => 8

// Per-sqm pricing applies to MIESZKALNY/USLUGOWY/KOMORKA only.
const PER_SQM_TYPES = new Set(['MIESZKALNY', 'USLUGOWY', 'KOMORKA'])

function round2(n) {
  return Math.round(n * 100) / 100
}

async function main() {
  const file = process.argv[2] || 'C:/Users/Rafał/Downloads/lista lokali.xlsx'
  const wb = XLSX.readFile(file)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
  const dataRows = rows.slice(1).filter((r) => r[0])

  console.log(`Loaded ${dataRows.length} rows from ${file}`)

  // Wipe existing data that depends on units? We won't delete units that are referenced.
  // First, get IDs of units that we cannot delete safely.
  const unitsInUse = await prisma.unit.findMany({
    where: {
      OR: [
        { contractUnits: { some: {} } },
        { clientUnits: { some: {} } },
        { serviceRequests: { some: {} } },
      ],
    },
    select: { id: true, number: true },
  })
  const protectedNumbers = new Set(unitsInUse.map((u) => u.number))
  if (protectedNumbers.size > 0) {
    console.log(`Skipping delete for ${protectedNumbers.size} referenced units:`, [...protectedNumbers].join(', '))
  }

  // Delete all unprotected units.
  const delRes = await prisma.unit.deleteMany({
    where: { number: { notIn: [...protectedNumbers] } },
  })
  console.log(`Deleted ${delRes.count} existing units.`)

  let created = 0
  let updated = 0
  let skipped = 0
  for (const r of dataRows) {
    const [number, typeLabel, , , , , buildingNum, klatka, kondygnacja, , , areaRaw, priceGrossRaw] = r
    const type = TYPE_MAP[typeLabel]
    if (!type) {
      console.warn(`! Unknown type "${typeLabel}" for ${number}, skipping.`)
      skipped++
      continue
    }
    const area = parseFloat(areaRaw) || 0
    const priceGross = parseFloat(priceGrossRaw) || 0
    const vatRate = VAT_FOR(type)
    const priceNet = round2(priceGross / (1 + vatRate / 100))
    // Per-sqm pricing only for residential / commercial / storage
    const ppmGross = PER_SQM_TYPES.has(type) && area > 0 ? round2(priceGross / area) : 0
    const ppmNet = PER_SQM_TYPES.has(type) && area > 0 ? round2(priceNet / area) : 0
    // floor: kondygnacja is a number (1=parter? in PL real estate often: 1 = parter), but spreadsheet uses 1,2,3,4 for floors.
    // We'll store as-is (1 -> 1st floor). For garages/parkings kondygnacja is empty.
    const floor = typeof kondygnacja === 'number' ? kondygnacja : (kondygnacja ? parseInt(kondygnacja) : null)
    const buildingParts = []
    if (buildingNum) buildingParts.push(`B${buildingNum}`)
    if (klatka) buildingParts.push(`Klatka ${klatka}`)
    const building = buildingParts.length ? buildingParts.join(' / ') : null

    const data = {
      number,
      type,
      area,
      pricePerSqmNet: ppmNet,
      pricePerSqmGross: ppmGross,
      priceNet,
      priceGross,
      vatRate,
      floor: Number.isFinite(floor) ? floor : null,
      building,
      status: 'WOLNY',
    }

    if (protectedNumbers.has(number)) {
      await prisma.unit.update({ where: { number }, data })
      updated++
    } else {
      await prisma.unit.create({ data })
      created++
    }
  }
  console.log(`Done. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
