// =====================================================================
// Parser PDF „Historia operacji” z ING Business (eksport historii do PDF).
//
// PDF nie ma warstwy danych — czytamy WARSTWĘ TEKSTOWĄ po współrzędnych
// (pdf-parse → pdf.js `getTextContent`, każdy napis ma pozycję x/y w punktach).
// Tabela ma stałe kolumny (A4 pionowo ≈ 595 pkt szerokości):
//   Data księgowania | Kontrahent (nazwa, adres, NRB kontrahenta w osobnej linii)
//   | Tytuł operacji + „Typ zlecenia” (uznanie / obciążenie)
//   | Kwota Waluta | Saldo po operacji + „Rachunek firmy” (zamaskowany).
// Wiersz transakcji zaczyna się datą DD-MM-YYYY w pierwszej kolumnie; wszystkie
// napisy poniżej (aż do następnej daty albo stopki strony) należą do niego.
// Nagłówek strony 1: numer rachunku, „zakres dat”, sumy kontrolne (obciążenia
// i uznania: suma + liczba) — parser porównuje z nimi swój wynik i ostrzega.
//
// OGRANICZENIE: PDF z rachunku technicznego SIMP nie zawiera numeru
// subrachunku wirtualnego nabywcy (kolumna „Rachunek firmy” jest zamaskowana
// „10 ... 91 9008 4617”), więc dopasowanie opiera się na nazwisku nabywcy,
// kwocie raty i numerze lokalu w tytule. Sygnał decydujący (subrachunek)
// daje tylko MT940 / camt.053 z ING Business.
// =====================================================================

import type { ParsedStatement, ParsedTransaction } from './index'
import { normalizeIban } from './index'
import { parseAmountPl, parseFlexibleDate } from './util'

type Item = { x: number; y: number; w: number; s: string }

const DATE_RE = /^\d{2}-\d{2}-\d{4}$/
const AMOUNT_RE = /^-?\d{1,3}(?: \d{3})*,\d{2}\s*[A-Z]{3}$/
const NRB_RE = /^\d{2}(?: \d{4}){6}$/ // „78 1140 2004 0000 3102 6872 9650”
const Y_TOL = 2.5

/** Czy bufor to PDF (sygnatura `%PDF-`). */
export function isPdfBuffer(buf: Buffer | Uint8Array): boolean {
  return buf.length > 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46
}

async function extractPages(buffer: Buffer): Promise<Item[][]> {
  // pdf-parse bez typów dla subpath — importujemy lib bezpośrednio (jak lib/ocr.ts).
  // @ts-ignore
  const mod: any = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = (mod.default || mod) as (b: Buffer, o: unknown) => Promise<{ numpages: number }>
  const pages: Item[][] = []
  await pdfParse(buffer, {
    // pdf-parse renderuje strony sekwencyjnie — kolejność push = kolejność stron.
    pagerender: async (pageData: any) => {
      const tc = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: true })
      const items: Item[] = []
      for (const it of tc.items as any[]) {
        const s = String(it.str ?? '')
        if (!s.trim()) continue
        items.push({ x: it.transform[4], y: it.transform[5], w: it.width || 0, s: s.trim() })
      }
      pages.push(items)
      return ''
    },
  })
  return pages
}

type Columns = {
  kontrahentX: number
  titleX: number
  amountX: number
  saldoX: number
  headerY: number
  /** Dolna linia dwuwierszowego nagłówka („księgowania / Typ zlecenia / Waluta / Rachunek firmy”). */
  subHeaderY: number
}

/** Nagłówek tabeli na stronie: pozycje kolumn (po nazwach) albo null, gdy strona bez tabeli. */
function findColumns(items: Item[]): Columns | null {
  const data = items.find((i) => i.s === 'Data')
  if (!data) return null
  const sameRow = (label: string) => items.find((i) => i.s === label && Math.abs(i.y - data.y) < Y_TOL)
  const kontrahent = sameRow('Kontrahent')
  const title = sameRow('Tytuł operacji')
  const amount = sameRow('Kwota')
  const saldo = sameRow('Saldo po operacji')
  if (!kontrahent || !title || !amount || !saldo) return null
  // Druga linia nagłówka leży tuż pod pierwszą; bez jej wykluczenia „księgowania”
  // (kolumna daty, nie-data) zamykałoby blok przeniesiony z poprzedniej strony.
  const sub = items.find((i) => Math.abs(i.x - data.x) < 5 && i.y < data.y - Y_TOL && i.y > data.y - 20)
  return {
    kontrahentX: kontrahent.x,
    titleX: title.x,
    amountX: amount.x,
    saldoX: saldo.x,
    headerY: data.y,
    subHeaderY: sub ? sub.y : data.y - 12,
  }
}

type HeaderInfo = {
  accountNumber: string | null
  periodFrom: Date | null
  periodTo: Date | null
  debitSum: number | null
  debitCount: number | null
  creditSum: number | null
  creditCount: number | null
}

/** Strona 1 nad tabelą: rachunek, zakres dat, sumy kontrolne obciążeń/uznań. */
function parseHeader(items: Item[], headerY: number): HeaderInfo {
  const head = items.filter((i) => i.y > headerY + Y_TOL)
  const info: HeaderInfo = {
    accountNumber: null,
    periodFrom: null,
    periodTo: null,
    debitSum: null,
    debitCount: null,
    creditSum: null,
    creditCount: null,
  }
  for (const it of head) {
    if (!info.accountNumber && NRB_RE.test(it.s)) info.accountNumber = normalizeIban('PL' + it.s.replace(/\s/g, ''))
    const range = it.s.match(/zakres dat:\s*(\d{2}-\d{2}-\d{4})\s*-\s*(\d{2}-\d{2}-\d{4})/)
    if (range) {
      info.periodFrom = parseFlexibleDate(range[1])
      info.periodTo = parseFlexibleDate(range[2])
    }
  }
  // Blok „Obciążenia” (lewy) i „Uznania” (prawy): etykieta „Suma”/„Liczba” + wartość w tej samej linii.
  const debitLabel = head.find((i) => i.s === 'Obciążenia')
  const creditLabel = head.find((i) => i.s === 'Uznania')
  const splitX = debitLabel && creditLabel ? (debitLabel.x + creditLabel.x) / 2 : 300
  for (const label of head.filter((i) => i.s === 'Suma' || i.s === 'Liczba')) {
    const value = head
      .filter((i) => i !== label && Math.abs(i.y - label.y) < Y_TOL && i.x > label.x && i.x < label.x + 220)
      .sort((a, b) => a.x - b.x)
      .find((i) => /\d/.test(i.s))
    if (!value) continue
    const isCredit = label.x >= splitX
    if (label.s === 'Suma') {
      const n = parseAmountPl(value.s)
      if (n !== null) isCredit ? (info.creditSum = Math.abs(n)) : (info.debitSum = Math.abs(n))
    } else {
      const n = parseInt(value.s.replace(/\D/g, ''), 10)
      if (Number.isFinite(n)) isCredit ? (info.creditCount = n) : (info.debitCount = n)
    }
  }
  return info
}

type Block = { date: Date; items: Item[] }

/** Dzieli napisy strony (pod nagłówkiem, bez stopki) na bloki transakcji wg dat w 1. kolumnie. */
function splitBlocks(items: Item[], cols: Columns, carry: Block | null, warnings: string[]): { blocks: Block[]; carry: Block | null } {
  const dateMaxX = cols.kontrahentX - 5
  const footerY = Math.max(
    ...items.filter((i) => /^Wygenerowano/.test(i.s) || /^Strona \d+ z \d+$/.test(i.s)).map((i) => i.y),
    -Infinity,
  )
  // Linia paginacji „1 | 196 z 196” (licznik + zakres) — usuwamy CAŁĄ linię,
  // inaczej licznik „1” dokleiłby się do tytułu ostatniej transakcji strony.
  const paginationYs = items.filter((i) => /^\d+ z \d+$/.test(i.s)).map((i) => i.y)
  // Sortowanie po y zaokrąglonym: napisy z jednej linii mogą różnić się o ułamek
  // punktu, a napis „odrobinę wyżej” niż data trafiłby do poprzedniej transakcji.
  const body = items
    .filter((i) => i.y < cols.subHeaderY - Y_TOL && i.y > footerY + Y_TOL)
    .filter((i) => !paginationYs.some((py) => Math.abs(i.y - py) < Y_TOL))
    .sort((a, b) => Math.round(b.y) - Math.round(a.y) || a.x - b.x)

  const blocks: Block[] = []
  let current: Block | null = carry
  for (const it of body) {
    if (it.x < dateMaxX) {
      if (DATE_RE.test(it.s)) {
        const date = parseFlexibleDate(it.s)
        if (!date) {
          warnings.push(`Nierozpoznana data „${it.s}”.`)
          continue
        }
        if (current) blocks.push(current)
        current = { date, items: [] }
        continue
      }
      // Inny napis w kolumnie daty (np. licznik paginacji „1”) — kończy bieżący blok.
      if (current) blocks.push(current)
      current = null
      continue
    }
    if (current) current.items.push(it)
  }
  // Ostatni blok strony może mieć ciąg dalszy na następnej stronie — przenosimy.
  return { blocks, carry: current }
}

function blockToTransaction(b: Block, cols: Columns, warnings: string[]): ParsedTransaction | null {
  const titleMinX = cols.titleX - 5
  const amountMinX = cols.amountX - 80
  const saldoMinX = cols.saldoX - 25

  const kontrahent: string[] = []
  let counterpartyIban: string | null = null
  const titleParts: string[] = []
  let typeWord: 'uznanie' | 'obciążenie' | null = null
  let amountRaw: string | null = null
  let balanceRaw: string | null = null

  for (const it of b.items) {
    if (it.x >= saldoMinX) {
      if (AMOUNT_RE.test(it.s) && balanceRaw === null) balanceRaw = it.s
      continue // „Rachunek firmy” (zamaskowany) — pomijamy
    }
    if (it.x >= amountMinX && AMOUNT_RE.test(it.s)) {
      if (amountRaw === null) amountRaw = it.s
      else warnings.push(`${fmtDate(b.date)}: dwie kwoty w jednym wierszu („${amountRaw}”, „${it.s}”).`)
      continue
    }
    if (it.x >= titleMinX) {
      const low = it.s.toLowerCase()
      if (low === 'uznanie' || low === 'obciążenie') typeWord = low as 'uznanie' | 'obciążenie'
      else titleParts.push(it.s)
      continue
    }
    // Kolumna kontrahenta: NRB w osobnej linii, reszta = nazwa + adres.
    if (NRB_RE.test(it.s) && !counterpartyIban) counterpartyIban = normalizeIban('PL' + it.s.replace(/\s/g, ''))
    else kontrahent.push(it.s)
  }

  if (amountRaw === null) {
    warnings.push(`${fmtDate(b.date)}: brak kwoty — wiersz pominięty (${kontrahent.join(' ') || titleParts.join(' ') || '?'}).`)
    return null
  }
  const signed = parseAmountPl(amountRaw)
  if (signed === null || signed === 0) {
    warnings.push(`${fmtDate(b.date)}: nie rozpoznano kwoty „${amountRaw}”.`)
    return null
  }
  const side: 'CREDIT' | 'DEBIT' = signed < 0 ? 'DEBIT' : 'CREDIT'
  if (typeWord && (typeWord === 'uznanie') !== (side === 'CREDIT')) {
    warnings.push(`${fmtDate(b.date)}: znak kwoty „${amountRaw}” nie zgadza się z typem „${typeWord}” — przyjęto znak kwoty.`)
  }
  const currency = (amountRaw.match(/[A-Z]{3}$/) || ['PLN'])[0]

  return {
    bookingDate: b.date,
    valueDate: b.date,
    side,
    amount: Math.abs(signed),
    currency,
    counterpartyName: kontrahent.join(' ').replace(/\s+/g, ' ').trim() || null,
    counterpartyIban,
    title: titleParts.join(' ').replace(/\s+/g, ' ').trim() || null,
    bankRef: null,
    balanceAfter: balanceRaw !== null ? parseAmountPl(balanceRaw) : null,
  }
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function empty(warnings: string[]): ParsedStatement {
  return {
    format: 'PDF',
    accountNumber: null,
    statementNumber: null,
    periodFrom: null,
    periodTo: null,
    openingBalance: null,
    closingBalance: null,
    currency: 'PLN',
    transactions: [],
    warnings,
  }
}

/** Główne wejście: PDF „Historia” z ING Business → ParsedStatement. */
export async function parseIngHistoryPdf(buffer: Buffer): Promise<ParsedStatement> {
  const warnings: string[] = []
  let pages: Item[][]
  try {
    pages = await extractPages(buffer)
  } catch (e: any) {
    return empty([`Nie udało się odczytać PDF: ${e?.message || e}`])
  }
  if (pages.length === 0 || pages.every((p) => p.length === 0)) {
    return empty(['PDF nie ma warstwy tekstowej (skan?) — wyeksportuj historię z ING Business ponownie jako PDF, MT940 lub CSV.'])
  }

  let header: HeaderInfo | null = null
  const transactions: ParsedTransaction[] = []
  let carry: Block | null = null
  let cols: Columns | null = null
  for (let p = 0; p < pages.length; p++) {
    const pageCols = findColumns(pages[p])
    if (!pageCols) {
      if (p === 0) return empty(['Nie znaleziono tabeli historii operacji (kolumny „Data / Kontrahent / Tytuł operacji / Kwota”). To nie jest eksport historii z ING Business?'])
      continue
    }
    cols = pageCols
    if (!header) header = parseHeader(pages[p], pageCols.headerY)
    const res = splitBlocks(pages[p], pageCols, carry, warnings)
    for (const b of res.blocks) {
      const tx = blockToTransaction(b, pageCols, warnings)
      if (tx) transactions.push(tx)
    }
    carry = res.carry
  }
  if (carry && cols) {
    const tx = blockToTransaction(carry, cols, warnings)
    if (tx) transactions.push(tx)
  }

  // Samo-walidacja wobec sum kontrolnych z nagłówka wyciągu.
  const credits = transactions.filter((t) => t.side === 'CREDIT')
  const debits = transactions.filter((t) => t.side === 'DEBIT')
  const sum = (xs: ParsedTransaction[]) => Math.round(xs.reduce((s, t) => s + t.amount, 0) * 100) / 100
  if (header) {
    if (header.creditCount !== null && header.creditCount !== credits.length) {
      warnings.push(`Liczba uznań: nagłówek wyciągu ${header.creditCount}, odczytano ${credits.length} — sprawdź pozycje.`)
    }
    if (header.creditSum !== null && Math.abs(header.creditSum - sum(credits)) > 0.005) {
      warnings.push(`Suma uznań: nagłówek wyciągu ${header.creditSum.toFixed(2)}, odczytano ${sum(credits).toFixed(2)}.`)
    }
    if (header.debitCount !== null && header.debitCount !== debits.length) {
      warnings.push(`Liczba obciążeń: nagłówek wyciągu ${header.debitCount}, odczytano ${debits.length}.`)
    }
    if (header.debitSum !== null && Math.abs(header.debitSum - sum(debits)) > 0.005) {
      warnings.push(`Suma obciążeń: nagłówek wyciągu ${header.debitSum.toFixed(2)}, odczytano ${sum(debits).toFixed(2)}.`)
    }
  }
  if (transactions.length === 0) warnings.push('Nie znaleziono żadnych transakcji w PDF.')

  // PDF nie ma referencji bankowej, a klucz deduplikacji (data|strona|kwota|IBAN|tytuł)
  // zlałby dwa identyczne przelewy z jednego dnia w jeden. Referencja pozycyjna:
  // numer pozycji w obrębie dnia w kolejności z PDF (stała przy ponownym eksporcie
  // tego samego rachunku, bo bank listuje operacje w tej samej kolejności).
  const perDay = new Map<string, number>()
  for (const t of transactions) {
    const day = fmtDate(t.bookingDate)
    const n = (perDay.get(day) ?? 0) + 1
    perDay.set(day, n)
    t.bankRef = `PDF:${day}/${n}`
  }

  // PDF listuje od najnowszej — oddajemy chronologicznie; saldo zamknięcia = po najnowszej.
  const newestFirst = transactions[0]
  transactions.sort((a, b) => a.bookingDate.getTime() - b.bookingDate.getTime())
  const dates = transactions.map((t) => t.bookingDate.getTime())

  return {
    format: 'PDF',
    accountNumber: header?.accountNumber ?? null,
    statementNumber: null,
    periodFrom: header?.periodFrom ?? (dates.length ? new Date(Math.min(...dates)) : null),
    periodTo: header?.periodTo ?? (dates.length ? new Date(Math.max(...dates)) : null),
    openingBalance: null,
    closingBalance: newestFirst?.balanceAfter ?? null,
    currency: transactions[0]?.currency ?? 'PLN',
    transactions,
    warnings,
  }
}
