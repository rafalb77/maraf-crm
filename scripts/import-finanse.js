// Importer pliku PŁATNOŚCI 20XX.xlsx → moduł Finanse.
//
// Uzycie:
//   node scripts/import-finanse.js <plik.xlsx>               # dry-run (pokaze co by zaimportowal)
//   node scripts/import-finanse.js <plik.xlsx> --commit      # faktyczny zapis do DB
//
// Po deployu na Coolify, w Coolify Terminal:
//   1. scp xlsx na VPS → docker cp do kontenera (lub uploadem przez UI gdy gotowy)
//   2. node scripts/import-finanse.js /tmp/platnosci.xlsx               # zobacz wynik
//   3. node scripts/import-finanse.js /tmp/platnosci.xlsx --commit      # zapisz
//
// Layout: 8 zakladek importowanych (PROMATBUD, BAUTER, SANTANDER, EFL,
// STAFFA, MURARZ, STALE, INNE). PODATKI pomijane (inny uklad, Faza 2).
// Patrz docs/finanse-rozpoczecie.md i lib/finanse-import.ts.

const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const SHEET_CONFIGS = [
  { sheetName: 'PROMATBUD', vendorName: 'PROMATBUD', vendorCategory: 'DOSTAWCA', layout: 'A', headerRow: 2 },
  { sheetName: 'BAUTER', vendorName: 'BAUTER', vendorCategory: 'DOSTAWCA', layout: 'A', headerRow: 2 },
  { sheetName: 'SANTANDER', vendorName: 'SANTANDER', vendorCategory: 'BANK', layout: 'A', headerRow: 2 },
  { sheetName: 'EFL', vendorName: 'EFL', vendorCategory: 'LEASING', layout: 'A', headerRow: 2 },
  { sheetName: 'STAFFA', vendorName: 'STAFFA', vendorCategory: 'DOSTAWCA', layout: 'B', headerRow: 2 },
  { sheetName: 'MURARZ', vendorName: 'MURARZ', vendorCategory: 'PODWYKONAWCA', layout: 'B', headerRow: 4 },
  { sheetName: 'STAŁE', vendorName: 'STAŁE', vendorCategory: 'INNE', layout: 'B', headerRow: 2 },
  { sheetName: 'INNE', vendorName: 'INNE', vendorCategory: 'INNE', layout: 'B', headerRow: 2 },
]

const COLS = {
  A: { fv: 0, issueDate: 1, vatRate: 2, amountGross: 3, dueDate: 4, paidDate: 7, amountVat: 8, amountNet: 10, description: 12 },
  B: { subVendor: 0, fv: 1, issueDate: 2, vatRate: 3, amountGross: 4, dueDate: 5, paidDate: 8, amountVat: 9, amountNet: 11, description: 12, deposit: 13, buildingCosts: 15, electricity: 16 },
}

function toCell(row, idx) {
  return row && idx < row.length ? row[idx] : undefined
}

function parseDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date) return raw
  if (typeof raw === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    return new Date(epoch.getTime() + raw * 86400000)
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return null
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function parseVatRate(raw) {
  if (raw === null || raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return raw > 1 ? raw / 100 : raw
  const s = String(raw).trim().replace('%', '').replace(',', '.')
  const n = parseFloat(s)
  if (!isFinite(n)) return 0
  return n > 1 ? n / 100 : n
}

function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return raw
  const s = String(raw).replace(/\s/g, '').replace(/zł|PLN|EUR|USD/gi, '').replace(',', '.').trim()
  const n = parseFloat(s)
  return isFinite(n) ? n : 0
}

function inferStatus(invoice) {
  const sumPaid = invoice.payments.reduce((s, p) => s + p.amount, 0)
  if (sumPaid >= invoice.amountGross - 0.01) return 'OPLACONA'
  if (sumPaid > 0.01) return 'CZESCIOWO_OPLACONA'
  if (invoice.dueDate) return 'ZATWIERDZONA'
  return 'WPROWADZONA'
}

function finalizeInvoice(inv) {
  if (inv.payments.length >= 2) {
    const first = inv.payments[0]
    const restSum = inv.payments.slice(1).reduce((s, p) => s + p.amount, 0)
    if (Math.abs(first.amount - inv.amountGross) < 0.01 && restSum > 0 && restSum < inv.amountGross) {
      inv.payments = inv.payments.slice(1)
    }
  }
  inv.status = inferStatus(inv)
  return inv
}

function parseSheetByConfig(ws, cfg) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, dateNF: 'yyyy-mm-dd' })
  const invoices = []
  const skipped = []
  const cols = cfg.layout === 'A' ? COLS.A : COLS.B
  let currentInvoice = null

  for (let i = cfg.headerRow; i < rows.length; i++) {
    const r = rows[i]
    const rowIndex = i + 1
    const fv = String(toCell(r, cols.fv) || '').trim()

    if (!fv) {
      if (!currentInvoice) continue
      const subTextCell = toCell(r, cfg.layout === 'A' ? 2 : 3)
      const subAmountCell = toCell(r, cfg.layout === 'A' ? 3 : 4)
      const subPaidDateCell = toCell(r, cols.paidDate)
      const subText = String(subTextCell || '').trim().toLowerCase()
      if (subText.startsWith('zap')) {
        const amount = parseAmount(subAmountCell)
        const paidAt = parseDate(subPaidDateCell)
        if (amount > 0 && paidAt) {
          currentInvoice.payments.push({
            amount,
            paidAt,
            notes: `Czesciowa platnosc (z subwiersza Excela, wiersz ${rowIndex})`,
          })
        }
      }
      continue
    }

    const issueDate = parseDate(toCell(r, cols.issueDate))
    const amountGross = parseAmount(toCell(r, cols.amountGross))

    if (!issueDate || amountGross <= 0) {
      if (currentInvoice) {
        invoices.push(finalizeInvoice(currentInvoice))
        currentInvoice = null
      }
      skipped.push({
        sheetName: cfg.sheetName,
        rowIndex,
        raw: `FV=${fv} brutto=${amountGross} dataWyst=${issueDate}`,
        reason: !issueDate ? 'Brak/niepoprawna data wystawienia' : 'Brak/niepoprawna kwota brutto',
      })
      continue
    }

    if (currentInvoice) invoices.push(finalizeInvoice(currentInvoice))

    const vatRate = parseVatRate(toCell(r, cols.vatRate))
    const dueDate = parseDate(toCell(r, cols.dueDate))
    const amountVat = parseAmount(toCell(r, cols.amountVat))
    const amountNet = parseAmount(toCell(r, cols.amountNet)) || (amountGross - amountVat)
    const paidDateRaw = parseDate(toCell(r, cols.paidDate))
    const subVendor = cfg.layout === 'B'
      ? (String(toCell(r, cols.subVendor) || '').trim() || null)
      : null
    const description = String(toCell(r, cols.description) || '').trim() || null

    let deposit = null, buildingCosts = null, electricity = null
    if (cfg.layout === 'B') {
      const d = parseAmount(toCell(r, cols.deposit))
      const b = parseAmount(toCell(r, cols.buildingCosts))
      const e = parseAmount(toCell(r, cols.electricity))
      if (d > 0) deposit = d
      if (b > 0) buildingCosts = b
      if (e > 0) electricity = e
    }

    const payments = []
    if (paidDateRaw) {
      payments.push({
        amount: amountGross,
        paidAt: paidDateRaw,
        notes: 'Z pola ZAPLACONO w xlsx (pelna platnosc)',
      })
    }

    currentInvoice = {
      sheetName: cfg.sheetName,
      rowIndex,
      vendorName: cfg.vendorName,
      subVendor,
      number: fv,
      issueDate,
      dueDate,
      vatRate,
      amountGross,
      amountNet,
      amountVat,
      description,
      deposit,
      buildingCosts,
      electricity,
      status: 'WPROWADZONA',
      payments,
    }
  }

  if (currentInvoice) invoices.push(finalizeInvoice(currentInvoice))
  return { invoices, skipped }
}

function fmtMoney(n) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function main() {
  const args = process.argv.slice(2)
  const file = args[0]
  const commit = args.includes('--commit')

  if (!file) {
    console.error('Uzycie: node scripts/import-finanse.js <plik.xlsx> [--commit]')
    process.exit(1)
  }

  console.log(`\nWczytuje: ${file}`)
  console.log(`Tryb: ${commit ? 'COMMIT (zapis do DB)' : 'DRY-RUN (tylko podglad)'}\n`)

  const wb = XLSX.readFile(file, { cellDates: true })
  const allInvoices = []
  const allSkipped = []
  const perSheet = {}

  for (const cfg of SHEET_CONFIGS) {
    const ws = wb.Sheets[cfg.sheetName]
    if (!ws) {
      console.log(`  ${cfg.sheetName.padEnd(12)} brak zakladki — pomijam`)
      perSheet[cfg.sheetName] = { invoices: 0, payments: 0, skipped: 0 }
      continue
    }
    const { invoices, skipped } = parseSheetByConfig(ws, cfg)
    allInvoices.push(...invoices)
    allSkipped.push(...skipped)
    const paymentsCount = invoices.reduce((s, i) => s + i.payments.length, 0)
    perSheet[cfg.sheetName] = { invoices: invoices.length, payments: paymentsCount, skipped: skipped.length }
    const sumGross = invoices.reduce((s, i) => s + i.amountGross, 0)
    console.log(`  ${cfg.sheetName.padEnd(12)} ${String(invoices.length).padStart(4)} faktur, ${String(paymentsCount).padStart(4)} platnosci, ${String(skipped.length).padStart(3)} pominiete | brutto: ${fmtMoney(sumGross)} zl`)
  }

  console.log(`\nRAZEM: ${allInvoices.length} faktur, ${allInvoices.reduce((s, i) => s + i.payments.length, 0)} platnosci, ${allSkipped.length} pominiete`)

  // Status breakdown
  const statusCounts = {}
  for (const inv of allInvoices) {
    statusCounts[inv.status] = (statusCounts[inv.status] || 0) + 1
  }
  console.log('\nStatusy:')
  for (const [s, n] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(22)} ${n}`)
  }

  // Vendory + duplikaty — wymagaja DB. Soft-fail gdy DB niedostepne (lokalny dry-run).
  let existingVendorNames = new Set()
  let newVendors = SHEET_CONFIGS.map((c) => ({ name: c.vendorName, category: c.vendorCategory }))
  let existingKeys = new Set()
  let dbAvailable = true
  try {
    const existingVendors = await prisma.vendor.findMany({
      where: { name: { in: SHEET_CONFIGS.map((c) => c.vendorName) } },
      select: { name: true },
    })
    existingVendorNames = new Set(existingVendors.map((v) => v.name))
    newVendors = SHEET_CONFIGS
      .filter((c) => !existingVendorNames.has(c.vendorName))
      .map((c) => ({ name: c.vendorName, category: c.vendorCategory }))

    const existingInvoices = await prisma.purchaseInvoice.findMany({
      where: { vendor: { name: { in: SHEET_CONFIGS.map((c) => c.vendorName) } } },
      select: { number: true, vendor: { select: { name: true } } },
    })
    existingKeys = new Set(existingInvoices.map((i) => `${i.vendor.name}::${i.number}`))
  } catch (e) {
    dbAvailable = false
    console.log(`\n(DB niedostepna — pomijam check duplikatow/vendorow: ${e.message.split('\n')[0]})`)
  }

  console.log(`\nVendorzy: ${existingVendorNames.size} istniejacych, ${newVendors.length} do utworzenia`)
  if (newVendors.length) {
    for (const v of newVendors) console.log(`  + ${v.name} (${v.category})`)
  }

  const newInvoices = allInvoices.filter((i) => !existingKeys.has(`${i.vendorName}::${i.number}`))
  const duplicates = allInvoices.length - newInvoices.length
  console.log(`\nFaktury: ${newInvoices.length} nowych, ${duplicates} duplikatow${dbAvailable ? ' (juz w DB)' : ' (DB niedostepna)'}`)

  if (allSkipped.length > 0 && allSkipped.length <= 20) {
    console.log(`\nPominiete wiersze (${allSkipped.length}):`)
    for (const s of allSkipped) {
      console.log(`  ${s.sheetName} R${s.rowIndex}: ${s.reason} | ${s.raw}`)
    }
  } else if (allSkipped.length > 20) {
    console.log(`\nPominiete wiersze: ${allSkipped.length} (pierwsze 10):`)
    for (const s of allSkipped.slice(0, 10)) {
      console.log(`  ${s.sheetName} R${s.rowIndex}: ${s.reason} | ${s.raw}`)
    }
  }

  if (!commit) {
    console.log('\n=== DRY-RUN — nic nie zostalo zapisane. Dodaj --commit zeby zapisac. ===\n')
    return
  }

  if (!dbAvailable) {
    console.error('\nBLAD: --commit wymaga dostepu do DB, ale Prisma nie moze sie polaczyc.')
    process.exit(1)
  }

  console.log('\nZapisuje do DB...')
  let vendorsCreated = 0
  let invoicesCreated = 0
  let paymentsCreated = 0

  await prisma.$transaction(async (tx) => {
    const vendorIdByName = new Map()
    const allVendorRows = await tx.vendor.findMany({
      where: { name: { in: SHEET_CONFIGS.map((c) => c.vendorName) } },
      select: { id: true, name: true },
    })
    for (const v of allVendorRows) vendorIdByName.set(v.name, v.id)

    for (const v of newVendors) {
      const created = await tx.vendor.create({
        data: { name: v.name, category: v.category, isActive: true },
        select: { id: true, name: true },
      })
      vendorIdByName.set(created.name, created.id)
      vendorsCreated++
    }

    for (const inv of newInvoices) {
      const vendorId = vendorIdByName.get(inv.vendorName)
      if (!vendorId) {
        console.warn(`  ! Brak vendora dla ${inv.vendorName} (FV ${inv.number}) — pomijam`)
        continue
      }
      const created = await tx.purchaseInvoice.create({
        data: {
          vendorId,
          number: inv.number,
          subVendor: inv.subVendor,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          vatRate: inv.vatRate,
          amountGross: inv.amountGross,
          amountNet: inv.amountNet,
          amountVat: inv.amountVat,
          description: inv.description,
          deposit: inv.deposit,
          buildingCosts: inv.buildingCosts,
          electricity: inv.electricity,
          status: inv.status,
          importSheet: inv.sheetName,
          importRow: inv.rowIndex,
        },
        select: { id: true },
      })
      invoicesCreated++
      for (const p of inv.payments) {
        await tx.purchaseInvoicePayment.create({
          data: {
            invoiceId: created.id,
            amount: p.amount,
            paidAt: p.paidAt,
            notes: p.notes,
          },
        })
        paymentsCreated++
      }
    }
  }, { maxWait: 60_000, timeout: 120_000 })

  console.log(`\nGOTOWE.`)
  console.log(`  Vendorow utworzono: ${vendorsCreated}`)
  console.log(`  Faktur utworzono:   ${invoicesCreated}`)
  console.log(`  Platnosci utworzono: ${paymentsCreated}`)
  console.log(`  Duplikatow pominieto: ${duplicates}`)
}

main()
  .catch((e) => {
    console.error('\nBLAD:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
