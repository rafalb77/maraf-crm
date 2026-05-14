/* eslint-disable */
/**
 * Import protokołów przerobowych z Excela.
 *
 * Każdy arkusz = jeden protokół. Skrypt:
 *  1. Ekstrahuje dane podwykonawcy + umowy z nagłówka pierwszego arkusza
 *  2. Buduje listę pozycji umownych (ContractWorkItem) jako UNIA pozycji ze WSZYSTKICH protokołów
 *     — bierze plannedQty/cenę z najnowszego protokołu, gdzie pozycja ma najpełniejsze dane
 *  3. Dla każdego arkusza tworzy Protocol + ProtocolItem (pozycje z qty > 0)
 *  4. Status protokołów = ZATWIERDZONY (jak prosił użytkownik)
 *
 * PEŁNY REIMPORT — przy istniejącej umowie kasuje stare protokoły + pozycje
 * umowy i wgrywa świeże z xlsx. Idempotentny (można odpalać wielokrotnie).
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/import-protokoly.js                                  # default /app/data/protokoly/...
 *   node scripts/import-protokoly.js /app/data/protokoly/plik.xlsx     # jawna ścieżka
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Default = ścieżka produkcyjna (plik commitowany do repo → w obrazie pod /app/data/).
// Lokalnie przekaż ścieżkę argumentem: node scripts/import-protokoly.js "C:/.../plik.xlsx"
const DEFAULT_FILE = '/app/data/protokoly/protokoly-staffa-fbr.xlsx'
const filePath = process.argv[2] || DEFAULT_FILE

// ---------- Pomocniki ----------

function excelDateToJs(serial) {
  if (typeof serial !== 'number') return null
  // Excel epoch: 1899-12-30 (uwzględnia bug 1900 leap year)
  const ms = (serial - 25569) * 86400 * 1000
  return new Date(ms)
}

function normalizeHeader(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i] || []
    if (typeof r[0] === 'string' && r[0].includes('Nr pozycji')) return i
  }
  return -1
}

/**
 * Mapuje nagłówki na indeksy kolumn — robust na 3 różne formaty Excela.
 * Zwraca: { name, unit, price, plannedQty, qtyThisPeriod, qtyPrevious, qtyTotal, valuePrev, valueThisPeriod }
 */
function buildColMap(headerRow) {
  const m = {}
  headerRow.forEach((h, idx) => {
    const n = normalizeHeader(h)
    if (n === 'rodzaj prac') m.name = idx
    else if (n === 'jednostka') m.unit = idx
    else if (n === 'cena jednostkowa') m.price = idx
    else if (n === 'ilość prac do wykonania') m.plannedQty = idx
    else if (n === 'obmiar prac w okresie rozliczeniowym') m.qtyThisPeriod = idx
    else if (n === 'obmiar') m.qtyOld = idx     // stary format (tylko Wrzesień)
    else if (n === 'wartość') m.valueOld = idx  // stary format
    else if (n === 'obmiar prac wg poprzednich protokołów') m.qtyPrevious = idx
    else if (n.startsWith('łączna ilość prac wykonana')) m.qtyTotal = idx
    else if (n === 'wartość robót wg poprzedniego protokołu') m.valuePrev = idx
    else if (n === 'wartość robót w okresie rozliczeniowym') m.valueThisPeriod = idx
    else if (n === 'wartośc robót od początku budowy') m.valueTotalAlt = idx
    else if (n === 'uwagi') m.notes = idx
  })
  return m
}

function isSectionRow(row, colMap) {
  // Wiersz sekcji = A jest stringiem (nazwą), reszta tekstowych pól pusta
  const a = row[0]
  const b = row[colMap.name]
  if (typeof a !== 'string') return false
  if (a.trim() === 'RAZEM') return false
  // a jest tekstem, b jest puste — to sekcja
  if (b == null || b === '') return true
  return false
}

function isItemRow(row, colMap) {
  const name = row[colMap.name]
  return typeof name === 'string' && name.trim().length > 0
}

function parseSheet(rows, headerIdx, colMap) {
  // periodFrom / periodTo
  // Wzór: row[i] gdzie cell = "Roboty wykonano w okresie od dnia :"
  let periodFrom = null
  let periodTo = null
  for (let i = 0; i < headerIdx; i++) {
    const r = rows[i] || []
    for (let j = 0; j < r.length; j++) {
      const v = r[j]
      if (typeof v === 'string' && v.includes('Roboty wykonano w okresie od dnia')) {
        // Skanuj resztę wiersza po liczby (Excel daty)
        const numbers = []
        for (let k = j + 1; k < r.length; k++) {
          if (typeof r[k] === 'number') numbers.push(r[k])
        }
        if (numbers.length >= 1) periodFrom = excelDateToJs(numbers[0])
        if (numbers.length >= 2) periodTo = excelDateToJs(numbers[1])
        // Możliwy format inline w stringu: "od dnia : 01.09.2025 do dnia 30.09.2025"
        if (!periodFrom) {
          const re = /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/g
          const matches = [...v.matchAll(re)]
          if (matches[0]) periodFrom = new Date(+matches[0][3], +matches[0][2] - 1, +matches[0][1])
          if (matches[1]) periodTo = new Date(+matches[1][3], +matches[1][2] - 1, +matches[1][1])
        }
        break
      }
    }
    if (periodFrom) break
  }

  // Numer protokołu — z nagłówka "Nr X z dnia ..."
  let protocolNumber = null
  let protocolDate = null
  for (let i = 0; i < headerIdx; i++) {
    const r = rows[i] || []
    for (let j = 0; j < r.length; j++) {
      const v = r[j]
      if (typeof v === 'string' && /^Nr/i.test(v.trim()) && v.trim().length < 8) {
        // Następna komórka liczbowa albo string z numerem
        const next = r[j + 1]
        if (typeof next === 'number' || typeof next === 'string') {
          protocolNumber = String(next).replace(/[^0-9]/g, '') || null
        }
      }
      if (typeof v === 'string' && /^Nr\.?\s*\d+/i.test(v.trim())) {
        protocolNumber = v.trim().replace(/[^0-9]/g, '')
      }
      if (typeof v === 'string' && v.trim() === 'z dnia' && typeof r[j + 1] === 'number') {
        protocolDate = excelDateToJs(r[j + 1])
      }
    }
  }

  const items = []
  let currentSection = null
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    if (typeof row[0] === 'string' && row[0].trim() === 'RAZEM') break
    if (row.every((c) => c == null || c === '')) continue

    if (isSectionRow(row, colMap)) {
      currentSection = String(row[0]).trim()
      continue
    }
    if (!isItemRow(row, colMap)) continue

    const name = String(row[colMap.name]).trim()
    const unit = colMap.unit != null ? row[colMap.unit] : null
    const price = colMap.price != null ? row[colMap.price] : null
    const plannedQty = colMap.plannedQty != null ? row[colMap.plannedQty] : null

    // qty w tym okresie — różne kolumny zależnie od formatu
    let qtyThisPeriod = null
    if (colMap.qtyThisPeriod != null) qtyThisPeriod = row[colMap.qtyThisPeriod]
    else if (colMap.qtyOld != null) qtyThisPeriod = row[colMap.qtyOld]

    // wartość w tym okresie
    let amountThisPeriod = null
    if (colMap.valueThisPeriod != null) amountThisPeriod = row[colMap.valueThisPeriod]
    else if (colMap.valueOld != null) amountThisPeriod = row[colMap.valueOld]

    items.push({
      section: currentSection,
      position: typeof row[0] === 'string' ? parseInt(row[0], 10) || 0 : Number(row[0]) || 0,
      name,
      unit: typeof unit === 'string' ? unit.trim() : 'szt',
      unitPrice: typeof price === 'number' ? price : 0,
      plannedQty: typeof plannedQty === 'number' ? plannedQty : null,
      qtyThisPeriod: typeof qtyThisPeriod === 'number' ? qtyThisPeriod : 0,
      amountThisPeriod: typeof amountThisPeriod === 'number' ? amountThisPeriod : 0,
      sourceRow: i + 1,
    })
  }

  return { periodFrom, periodTo, protocolNumber, protocolDate, items }
}

// ---------- Główny import ----------

async function main() {
  console.log(`📂 Czytanie pliku: ${filePath}`)
  const wb = XLSX.readFile(filePath)
  const sheetNames = wb.SheetNames

  // Parsuj wszystkie arkusze
  const protocols = []
  for (const name of sheetNames) {
    const ws = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
    const headerIdx = findHeaderRow(rows)
    if (headerIdx < 0) {
      console.warn(`  ⚠️  ${name}: brak nagłówka pozycji — pomijam`)
      continue
    }
    const colMap = buildColMap(rows[headerIdx])
    const parsed = parseSheet(rows, headerIdx, colMap)
    protocols.push({ sheetName: name, ...parsed })
    console.log(`  ✓ ${name}: ${parsed.items.length} pozycji, okres: ${parsed.periodFrom?.toISOString().slice(0,10) || '?'} → ${parsed.periodTo?.toISOString().slice(0,10) || '?'}`)
  }

  // Sortuj chronologicznie (od najstarszego)
  protocols.sort((a, b) => (a.periodTo?.getTime() || 0) - (b.periodTo?.getTime() || 0))

  // ---------- Podwykonawca ----------
  const subName = 'Rafał Banaszczyk - Firma Budowlano-Remontowa'
  let sub = await prisma.subcontractor.findFirst({ where: { name: subName } })
  if (!sub) {
    sub = await prisma.subcontractor.create({
      data: {
        name: subName,
        nip: '7711026032',
        address: 'Proszenie 55',
        city: 'Wolbórz',
        zipCode: '97-320',
        contactName: 'Rafał Banaszczyk',
      },
    })
    console.log(`➕ Utworzono podwykonawcę: ${sub.name}`)
  } else {
    console.log(`ℹ️  Używam istniejącego podwykonawcy: ${sub.name}`)
  }

  // ---------- Umowa ----------
  const contractTitle = 'Umowa z dnia 01 września 2025 — roboty konstrukcyjne'
  const signedAt = new Date(2025, 8, 1) // 1 września 2025
  let contract = await prisma.subContract.findFirst({
    where: { subcontractorId: sub.id, signedAt: signedAt },
  })
  if (!contract) {
    contract = await prisma.subContract.create({
      data: {
        subcontractorId: sub.id,
        title: contractTitle,
        scopeText: 'Roboty konstrukcyjne',
        signedAt,
        retentionPct: 0,
        status: 'AKTYWNA',
      },
    })
    console.log(`➕ Utworzono umowę`)
  } else {
    // PEŁNY REIMPORT — kasujemy w prawidłowej kolejności:
    //  1. Protocol (+ ProtocolItem przez onDelete: Cascade)
    //  2. ContractWorkItem — DOPIERO TERAZ, bo ProtocolItem.contractWorkItem ma
    //     onDelete: Restrict — próba skasowania CWI z żywymi ProtocolItem padłaby
    //     na foreign key constraint.
    const delProtocols = await prisma.protocol.deleteMany({ where: { contractId: contract.id } })
    await prisma.contractWorkItem.deleteMany({ where: { contractId: contract.id } })
    console.log(
      `ℹ️  Istniejąca umowa — pełny reimport: skasowano ${delProtocols.count} protokołów + pozycje umowy`,
    )
  }

  // ---------- Pozycje umowne (UNIA z wszystkich protokołów) ----------
  // Klucz: section + name (case-insensitive). Bierzemy pełniejsze dane (najnowsze plannedQty).
  const itemMap = new Map()
  let globalOrder = 0
  for (const proto of protocols) {
    for (const it of proto.items) {
      const key = `${(it.section || '').toLowerCase()}|${it.name.toLowerCase()}`
      const existing = itemMap.get(key)
      if (!existing) {
        itemMap.set(key, {
          section: it.section,
          position: it.position,
          name: it.name,
          unit: it.unit,
          unitPrice: it.unitPrice,
          plannedQty: it.plannedQty || 0,
          globalOrder: globalOrder++,
        })
      } else {
        // Aktualizuj jeśli nowsze ma więcej danych
        if (it.plannedQty && it.plannedQty > (existing.plannedQty || 0)) {
          existing.plannedQty = it.plannedQty
        }
        if (it.unitPrice && !existing.unitPrice) existing.unitPrice = it.unitPrice
      }
    }
  }

  // Wstaw do DB
  const contractItemsByKey = new Map()
  for (const [key, def] of itemMap.entries()) {
    const cwi = await prisma.contractWorkItem.create({
      data: {
        contractId: contract.id,
        section: def.section,
        position: def.position,
        globalOrder: def.globalOrder,
        name: def.name,
        unit: def.unit,
        unitPrice: def.unitPrice,
        plannedQty: def.plannedQty || 0,
      },
    })
    contractItemsByKey.set(key, cwi)
  }
  console.log(`✓ Utworzono ${itemMap.size} pozycji umowy`)

  // Suma zamówienia z pozycji
  const contractTotal = [...itemMap.values()].reduce((s, x) => s + (x.plannedQty || 0) * (x.unitPrice || 0), 0)
  await prisma.subContract.update({
    where: { id: contract.id },
    data: { valueNet: round(contractTotal, 2) },
  })

  // ---------- Protokoły ----------
  for (const proto of protocols) {
    if (!proto.periodFrom || !proto.periodTo) {
      console.warn(`  ⚠️  ${proto.sheetName}: brak dat okresu — pomijam`)
      continue
    }

    const periodYear = proto.periodTo.getUTCFullYear()
    const periodMonth = proto.periodTo.getUTCMonth() + 1

    // Pozycje z qty > 0
    const itemsToCreate = []
    let totalNet = 0
    for (const it of proto.items) {
      if (!it.qtyThisPeriod || it.qtyThisPeriod === 0) continue
      const key = `${(it.section || '').toLowerCase()}|${it.name.toLowerCase()}`
      const cwi = contractItemsByKey.get(key)
      if (!cwi) {
        console.warn(`  ⚠️  Brak pozycji umowy dla "${it.name}" w sekcji "${it.section}"`)
        continue
      }
      const amount = it.amountThisPeriod || it.qtyThisPeriod * it.unitPrice
      totalNet += amount
      itemsToCreate.push({
        contractWorkItemId: cwi.id,
        qty: round(it.qtyThisPeriod, 4),
        unit: it.unit,
        unitPrice: it.unitPrice,
        amountNet: round(amount, 2),
      })
    }

    const protocol = await prisma.protocol.create({
      data: {
        subcontractorId: sub.id,
        contractId: contract.id,
        number: proto.protocolNumber || null,
        periodFrom: proto.periodFrom,
        periodTo: proto.periodTo,
        periodYear,
        periodMonth,
        status: 'ZATWIERDZONY',
        approvedAt: proto.protocolDate || proto.periodTo,
        issuedAt: proto.protocolDate || proto.periodTo,
        totalNet: round(totalNet, 2),
        retentionAmount: 0,
        payableNet: round(totalNet, 2),
        items: { create: itemsToCreate },
      },
    })

    console.log(
      `  ✓ Protokół ${proto.protocolNumber ? `#${proto.protocolNumber}` : ''} ` +
        `${proto.periodFrom.toISOString().slice(0,10)} → ${proto.periodTo.toISOString().slice(0,10)}: ` +
        `${itemsToCreate.length} poz., ${totalNet.toFixed(2)} zł netto`,
    )
  }

  console.log('\n✅ Import zakończony')
}

function round(n, dp) {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
