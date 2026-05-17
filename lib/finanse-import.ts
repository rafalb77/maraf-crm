import * as XLSX from 'xlsx'
import { prisma } from './prisma'

// =====================================================================
// Importer pliku PŁATNOŚCI 20XX.xlsx → moduł Finanse.
// Zastępuje obecne prowadzenie płatności w Excelu (siostra Marta wpisuje,
// Bohdan akceptuje kolorem). Patrz docs/finanse-rozpoczecie.md.
//
// 9 zakładek = 9 kategorii (kontrahenci + grupy):
//   Layout A (FV w kol A, naglowek w R2):
//     PROMATBUD, BAUTER, SANTANDER, EFL
//   Layout B (subkontrahent w kol A, FV w kol B):
//     STAFFA, MURARZ, STAŁE, INNE
//   Pomijane:
//     PODATKI (inny uklad, per miesiac) — osobny pod-modul w Fazie 2
//
// Subwiersze "zaplacono X / pozostalo Y" pod faktura agregujemy w
// PurchaseInvoicePayment (1 faktura = N platnosci).
//
// Kolory wierszy (akceptacja Bohdana) NIE sa czytane — biblioteka 'xlsx'
// (sheetjs community) nie eksponuje styli komorek. Status ustalamy
// heurystycznie (patrz inferStatus). Wiekszosc starych rekordow i tak
// nie ma koloru, wiec strata informacji minimalna.
// =====================================================================

type LayoutType = 'A' | 'B'

type SheetConfig = {
  /** Nazwa zakladki w xlsx */
  sheetName: string
  /** Nazwa vendora w bazie (zwykle = sheetName, ale moze byc inny tytul) */
  vendorName: string
  /** Kategoria vendora */
  vendorCategory: 'DOSTAWCA' | 'BANK' | 'LEASING' | 'URZAD' | 'PODWYKONAWCA' | 'INNE'
  /** Layout xlsx (A = FV w kol 0, B = FV w kol 1 + subkontrahent w 0) */
  layout: LayoutType
  /** Numer wiersza naglowka (1-based — w Excel widoczne jako "wiersz 2") */
  headerRow: number
  /** Czy importowac (false = pomin, np. PODATKI) */
  enabled: boolean
}

// Konfiguracja per zakladka. Jesli plik bedzie mial inne zakladki w przyszlych
// latach (np. nowy podwykonawca) — dodajemy tu lub fallback do INNE.
const SHEET_CONFIGS: SheetConfig[] = [
  { sheetName: 'PROMATBUD', vendorName: 'PROMATBUD', vendorCategory: 'DOSTAWCA', layout: 'A', headerRow: 2, enabled: true },
  { sheetName: 'BAUTER', vendorName: 'BAUTER', vendorCategory: 'DOSTAWCA', layout: 'A', headerRow: 2, enabled: true },
  { sheetName: 'SANTANDER', vendorName: 'SANTANDER', vendorCategory: 'BANK', layout: 'A', headerRow: 2, enabled: true },
  { sheetName: 'EFL', vendorName: 'EFL', vendorCategory: 'LEASING', layout: 'A', headerRow: 2, enabled: true },
  { sheetName: 'STAFFA', vendorName: 'STAFFA', vendorCategory: 'DOSTAWCA', layout: 'B', headerRow: 2, enabled: true },
  { sheetName: 'MURARZ', vendorName: 'MURARZ', vendorCategory: 'PODWYKONAWCA', layout: 'B', headerRow: 4, enabled: true },
  { sheetName: 'STAŁE', vendorName: 'STAŁE', vendorCategory: 'INNE', layout: 'B', headerRow: 2, enabled: true },
  { sheetName: 'INNE', vendorName: 'INNE', vendorCategory: 'INNE', layout: 'B', headerRow: 2, enabled: true },
  // PODATKI — pomijane w MVP (inny uklad, osobny pod-modul w Fazie 2)
  { sheetName: 'PODATKI', vendorName: 'PODATKI', vendorCategory: 'URZAD', layout: 'A', headerRow: 2, enabled: false },
]

// Indeksy kolumn (0-based) per layout
const COLS = {
  A: {
    fv: 0,
    issueDate: 1,
    vatRate: 2,
    amountGross: 3,
    dueDate: 4,
    paidDate: 7,
    amountVat: 8,
    amountNet: 10,
    description: 12, // czasami pole z opisem (rzadko)
  },
  B: {
    subVendor: 0,
    fv: 1,
    issueDate: 2,
    vatRate: 3,
    amountGross: 4,
    dueDate: 5,
    paidDate: 8,
    amountVat: 9,
    amountNet: 11,
    description: 12, // np. "murowanie scian I pietro" w MURARZ
    // MURARZ-specific (puste dla innych — bezpieczne bo wartosci numeryczne, undefined OK):
    deposit: 13,         // N=kaucja
    wc: 14,              // O=wc (nie zachowujemy — niejasne pole)
    buildingCosts: 15,   // P=koszty budowy
    electricity: 16,     // Q=prad
  },
} as const

// =====================================================================
// Typy publiczne
// =====================================================================

export type ParsedInvoice = {
  sheetName: string
  rowIndex: number              // 1-based wiersz w Excel
  vendorName: string
  subVendor: string | null
  number: string                // numer faktury
  issueDate: Date
  dueDate: Date | null
  vatRate: number               // 0.23 / 0.08 / 0.05 / 0
  amountGross: number
  amountNet: number
  amountVat: number
  description: string | null
  deposit: number | null
  buildingCosts: number | null
  electricity: number | null
  status: string                // wyliczony heurystycznie
  payments: ParsedPayment[]
}

export type ParsedPayment = {
  amount: number
  paidAt: Date
  notes: string | null          // gdy z subwiersza, np. "zaplacono czesc"
}

export type ParsedSkip = {
  sheetName: string
  rowIndex: number
  raw: string                   // co bylo w wierszu (skrocone)
  reason: string
}

export type DiffResult = {
  newVendors: { name: string; category: string }[]
  existingVendors: string[]                 // ktore juz w bazie
  newInvoices: ParsedInvoice[]               // dotad nieobecne (po (vendor, number))
  duplicateInvoices: ParsedInvoice[]         // juz w bazie z tym (vendor, number) — pomijamy
  skipped: ParsedSkip[]
  totalRowsScanned: number
  perSheetCounts: Record<string, { invoices: number; payments: number; skipped: number }>
}

export type CommitResult = {
  vendorsCreated: number
  invoicesCreated: number
  paymentsCreated: number
  duplicatesSkipped: number
  warnings: string[]
}

// =====================================================================
// Helpers
// =====================================================================

/** xlsx date number / string / Date → Date | null */
function parseDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date) return raw
  if (typeof raw === 'number') {
    // Excel serial date (dni od 1900-01-01, z bugiem 1900 jako roku przestepnego)
    // xlsx zwykle juz konwertuje przy cellDates: true; tu na wszelki wypadek
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

/** "23%" / 0.23 / "0.23" → 0.23 (Decimal w przedziale [0,1]) */
function parseVatRate(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return raw > 1 ? raw / 100 : raw
  const s = String(raw).trim().replace('%', '').replace(',', '.')
  const n = parseFloat(s)
  if (!isFinite(n)) return 0
  return n > 1 ? n / 100 : n
}

/** "12 345,67 zł" / 12345.67 → 12345.67 */
function parseAmount(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return raw
  const s = String(raw)
    .replace(/\s/g, '')
    .replace(/zł|PLN|EUR|USD/gi, '')
    .replace(',', '.')
    .trim()
  const n = parseFloat(s)
  return isFinite(n) ? n : 0
}

function toCell(row: unknown[], idx: number): unknown {
  return row && idx < row.length ? row[idx] : undefined
}

/** Heurystyka statusu (bez kolorow z xlsx). Patrz komentarz na gorze pliku. */
function inferStatus(invoice: {
  amountGross: number
  payments: ParsedPayment[]
  dueDate: Date | null
}): string {
  const sumPaid = invoice.payments.reduce((s, p) => s + p.amount, 0)
  if (sumPaid >= invoice.amountGross - 0.01) return 'OPLACONA'
  if (sumPaid > 0.01) return 'CZESCIOWO_OPLACONA'
  // Brak platnosci — jesli ma termin, traktujemy jako zatwierdzona (bo skoro
  // jest w pliku Bohdana, to bylo "do zaplaty"). Jesli brak terminu i kwoty
  // platnosci — wprowadzona ale jeszcze nie przeszla przez akceptacje.
  if (invoice.dueDate) return 'ZATWIERDZONA'
  return 'WPROWADZONA'
}

// =====================================================================
// Parser xlsx
// =====================================================================

type RawRow = unknown[]

/** Parsuje pojedyncza zakladke do {invoices, skipped} */
function parseSheetByConfig(
  ws: XLSX.WorkSheet,
  cfg: SheetConfig,
): { invoices: ParsedInvoice[]; skipped: ParsedSkip[] } {
  const rows = XLSX.utils.sheet_to_json<RawRow>(ws, {
    header: 1,
    defval: '',
    raw: true,
    dateNF: 'yyyy-mm-dd',
  })

  const invoices: ParsedInvoice[] = []
  const skipped: ParsedSkip[] = []
  const cols = cfg.layout === 'A' ? COLS.A : COLS.B

  // Pomijamy wszystko do (i wlacznie) wiersza naglowka
  const startIdx = cfg.headerRow // 0-based offset = headerRow (bo headerRow=2 to indeks 1+1=2 wiersz danych = index 2 w array 0-based? cos nie tak)
  // Wyjasnienie: rows[] jest 0-based, sheet_to_json zwraca rzad 0 = wiersz Excel 1.
  // Wiec dane zaczynaja sie od rows[cfg.headerRow] (gdzie cfg.headerRow=2 oznacza wiersz Excel 3 = pierwszy wiersz danych).
  let currentInvoice: ParsedInvoice | null = null

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i]
    const rowIndex = i + 1 // Excel 1-based

    const fvRaw = toCell(r, cols.fv)
    const fv = String(fvRaw || '').trim()

    // Pusty wiersz lub naglowek powtorzony — sprawdz czy to subwiersz "zaplacono/pozostalo"
    if (!fv) {
      if (!currentInvoice) continue // nic do agregacji
      // Subwiersz pod aktualna faktura — szukamy "zaplacono X" lub "pozostalo Y"
      // Format: kolumna C/D zawiera tekst "zaplacono" lub "pozostalo", D/E zawiera kwote
      // Plus moze byc data w kolumnie H/I
      const subTextCell = toCell(r, cfg.layout === 'A' ? 2 : 3) // C lub D
      const subAmountCell = toCell(r, cfg.layout === 'A' ? 3 : 4) // D lub E
      const subPaidDateCell = toCell(r, cols.paidDate)
      const subText = String(subTextCell || '').trim().toLowerCase()

      if (subText.startsWith('zap')) {
        // "zapłacono" subwiersz
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
      // "pozostalo" — ignorujemy, to wartosc informacyjna w xlsx (nie tworzy entity)
      continue
    }

    // FV jest — nowy rekord faktury. "Zamykamy" poprzednia i zaczynamy nowa.
    const issueDate = parseDate(toCell(r, cols.issueDate))
    const amountGross = parseAmount(toCell(r, cols.amountGross))

    // Walidacja minimalna: data wystawienia + kwota brutto > 0
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

    // Zapisz poprzednia faktura
    if (currentInvoice) {
      invoices.push(finalizeInvoice(currentInvoice))
    }

    const vatRate = parseVatRate(toCell(r, cols.vatRate))
    const dueDate = parseDate(toCell(r, cols.dueDate))
    const amountVat = parseAmount(toCell(r, cols.amountVat))
    const amountNet = parseAmount(toCell(r, cols.amountNet)) || (amountGross - amountVat)
    const paidDateRaw = parseDate(toCell(r, cols.paidDate))
    const subVendor = cfg.layout === 'B'
      ? String(toCell(r, (cols as typeof COLS.B).subVendor) || '').trim() || null
      : null
    const description = String(toCell(r, cols.description) || '').trim() || null

    // Pola MURARZ (tylko jesli layout B i wartosci sa)
    let deposit: number | null = null
    let buildingCosts: number | null = null
    let electricity: number | null = null
    if (cfg.layout === 'B') {
      const colsB = cols as typeof COLS.B
      const d = parseAmount(toCell(r, colsB.deposit))
      const b = parseAmount(toCell(r, colsB.buildingCosts))
      const e = parseAmount(toCell(r, colsB.electricity))
      if (d > 0) deposit = d
      if (b > 0) buildingCosts = b
      if (e > 0) electricity = e
    }

    const payments: ParsedPayment[] = []
    // Jesli jest data zaplaty bezposrednio na fakturze (kolumna ZAPŁACONO)
    // to traktujemy jako pelna platnosc na ten dzien.
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
      status: 'WPROWADZONA',  // tymczasowo, finalize ustawi heurystycznie
      payments,
    }
  }

  // Zamknij ostatnia
  if (currentInvoice) {
    invoices.push(finalizeInvoice(currentInvoice))
  }

  return { invoices, skipped }
}

function finalizeInvoice(inv: ParsedInvoice): ParsedInvoice {
  // Jesli mamy subwiersze "zaplacono X" + pole ZAPŁACONO na poziomie faktury,
  // to pole ZAPŁACONO jest data ostatniej platnosci, a faktyczne kwoty sa w
  // subwierszach. Trzeba zdedupowac — heurystyka: jesli mamy >=2 platnosci
  // i pierwsza ma kwote = amountGross (z pola ZAPŁACONO), a reszta sumuje
  // sie do mniejszej kwoty — usuwamy te pierwsza jako duplikat.
  if (inv.payments.length >= 2) {
    const first = inv.payments[0]
    const restSum = inv.payments.slice(1).reduce((s, p) => s + p.amount, 0)
    if (Math.abs(first.amount - inv.amountGross) < 0.01 && restSum > 0 && restSum < inv.amountGross) {
      // Pierwszy to "fullpayment" z pola ZAPŁACONO ktore nie pasuje — odrzuc.
      // W zamian dodaj pelnopelne uzupelnienie do brutto z reszty (jesli pasuje).
      inv.payments = inv.payments.slice(1)
    }
  }

  inv.status = inferStatus(inv)
  return inv
}

// =====================================================================
// API publiczne (uzywane przez CLI i UI)
// =====================================================================

export type ParseResult = {
  invoices: ParsedInvoice[]
  skipped: ParsedSkip[]
  perSheetCounts: Record<string, { invoices: number; payments: number; skipped: number }>
}

export function parseFinanseXlsx(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  const invoices: ParsedInvoice[] = []
  const skipped: ParsedSkip[] = []
  const perSheetCounts: Record<string, { invoices: number; payments: number; skipped: number }> = {}

  for (const cfg of SHEET_CONFIGS) {
    if (!cfg.enabled) continue
    const ws = wb.Sheets[cfg.sheetName]
    if (!ws) {
      perSheetCounts[cfg.sheetName] = { invoices: 0, payments: 0, skipped: 0 }
      continue
    }
    const { invoices: invs, skipped: sks } = parseSheetByConfig(ws, cfg)
    invoices.push(...invs)
    skipped.push(...sks)
    perSheetCounts[cfg.sheetName] = {
      invoices: invs.length,
      payments: invs.reduce((s, i) => s + i.payments.length, 0),
      skipped: sks.length,
    }
  }

  return { invoices, skipped, perSheetCounts }
}

export async function buildDiff(buffer: Buffer): Promise<DiffResult> {
  const parse = parseFinanseXlsx(buffer)

  // Vendors istniejacy w bazie
  const wantedVendorNames = Array.from(new Set(parse.invoices.map((i) => i.vendorName)))
  const existingVendors = await prisma.vendor.findMany({
    where: { name: { in: wantedVendorNames } },
    select: { name: true },
  })
  const existingVendorNames = new Set(existingVendors.map((v) => v.name))

  const newVendors = SHEET_CONFIGS
    .filter((c) => c.enabled && wantedVendorNames.includes(c.vendorName) && !existingVendorNames.has(c.vendorName))
    .map((c) => ({ name: c.vendorName, category: c.vendorCategory }))

  // Faktury istniejace — sprawdz po (vendorName, number)
  // Najprosciej: pobierz wszystkie faktury z wantedVendorNames + ich numery
  const existingInvoices = await prisma.purchaseInvoice.findMany({
    where: { vendor: { name: { in: wantedVendorNames } } },
    select: { number: true, vendor: { select: { name: true } } },
  })
  const existingKeys = new Set(existingInvoices.map((i) => `${i.vendor.name}::${i.number}`))

  const newInvoices: ParsedInvoice[] = []
  const duplicateInvoices: ParsedInvoice[] = []
  for (const inv of parse.invoices) {
    const key = `${inv.vendorName}::${inv.number}`
    if (existingKeys.has(key)) duplicateInvoices.push(inv)
    else newInvoices.push(inv)
  }

  return {
    newVendors,
    existingVendors: existingVendors.map((v) => v.name),
    newInvoices,
    duplicateInvoices,
    skipped: parse.skipped,
    totalRowsScanned: parse.invoices.length + parse.skipped.length,
    perSheetCounts: parse.perSheetCounts,
  }
}

export async function commitImport(buffer: Buffer, createdById?: string): Promise<CommitResult> {
  const diff = await buildDiff(buffer)
  const warnings: string[] = []
  let vendorsCreated = 0
  let invoicesCreated = 0
  let paymentsCreated = 0

  await prisma.$transaction(async (tx) => {
    // 1. Vendory — utworz brakujace
    const vendorIdByName = new Map<string, string>()
    const existing = await tx.vendor.findMany({
      where: { name: { in: Array.from(new Set([...diff.existingVendors, ...diff.newVendors.map((v) => v.name)])) } },
      select: { id: true, name: true },
    })
    for (const v of existing) vendorIdByName.set(v.name, v.id)

    for (const v of diff.newVendors) {
      const created = await tx.vendor.create({
        data: { name: v.name, category: v.category, isActive: true },
        select: { id: true, name: true },
      })
      vendorIdByName.set(created.name, created.id)
      vendorsCreated++
    }

    // 2. Faktury + platnosci
    for (const inv of diff.newInvoices) {
      const vendorId = vendorIdByName.get(inv.vendorName)
      if (!vendorId) {
        warnings.push(`Brak vendora dla ${inv.vendorName} (FV ${inv.number}) — pomijam`)
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
          createdById: createdById || null,
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
            createdById: createdById || null,
          },
        })
        paymentsCreated++
      }
    }
  }, {
    // Duzy import → moze przekroczyc default 5s timeoutu na transakcji
    maxWait: 60_000,
    timeout: 120_000,
  })

  return {
    vendorsCreated,
    invoicesCreated,
    paymentsCreated,
    duplicatesSkipped: diff.duplicateInvoices.length,
    warnings,
  }
}
