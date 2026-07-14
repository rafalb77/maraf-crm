// Parser CSV historii rachunku ING Bank Śląski (Moje ING / ING Business).
//
// Charakterystyka eksportu ING:
//   - separator kolumn: średnik ';'
//   - separator dziesiętny: przecinek ','
//   - kodowanie: Windows-1250 (dekodowane do UTF-8 w API przed wejściem tu)
//   - preambuła: kilka linii z danymi rachunku PRZED wierszem nagłówka
//   - wiersz nagłówka zawiera m.in. „Data transakcji”, „Dane kontrahenta”,
//     „Tytuł”, „Kwota transakcji”, „Waluta”, „Saldo po transakcji”
//
// Mapowanie kolumn po NAZWACH nagłówków (nie po pozycji) — odporne na warianty
// eksportu i zmianę kolejności kolumn.

import type { ParsedStatement, ParsedTransaction } from './index'
import { normalizeIban } from './index'
import { parseAmountPl, parseFlexibleDate, extractIban } from './util'

/** Usuwa polskie znaki i normalizuje nagłówek do porównań. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, 'l') // ł NIE rozkłada się przez NFD — obsługa jawna
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[„”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Prosty parser wiersza CSV z obsługą cudzysłowów i separatora ';'. */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === sep) { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

function detectSeparator(lines: string[]): string {
  const sample = lines.slice(0, 30).join('\n')
  const semi = (sample.match(/;/g) || []).length
  const comma = (sample.match(/,/g) || []).length
  const tab = (sample.match(/\t/g) || []).length
  if (tab > semi && tab > comma) return '\t'
  // ING używa ';' — przecinki to separatory dziesiętne, więc ';' wygrywa nawet gdy comma>semi
  return semi > 0 ? ';' : ','
}

// Słowniki dopasowania nagłówków → pole logiczne.
const COL_MATCHERS: { key: string; any: string[] }[] = [
  { key: 'bookingDate', any: ['data transakcji', 'data operacji', 'data'] },
  { key: 'valueDate', any: ['data ksieg', 'data waluty'] },
  { key: 'counterparty', any: ['dane kontrahenta', 'kontrahent', 'nadawca/odbiorca', 'nazwa kontrahenta'] },
  { key: 'title', any: ['tytul', 'opis transakcji', 'opis operacji', 'szczegoly'] },
  { key: 'account', any: ['nr rachunku', 'rachunek kontrahenta', 'rachunek nadawcy', 'nr konta'] },
  { key: 'amount', any: ['kwota transakcji', 'kwota operacji', 'kwota', 'obciazenia/uznania'] },
  { key: 'currency', any: ['waluta'] },
  { key: 'balance', any: ['saldo po transakcji', 'saldo'] },
]

function findHeaderRow(lines: string[], sep: string): number {
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const cells = splitCsvLine(lines[i], sep).map(norm)
    const hasDate = cells.some((c) => c.includes('data'))
    const hasAmount = cells.some((c) => c.includes('kwota'))
    if (hasDate && hasAmount) return i
  }
  return -1
}

function mapColumns(header: string[]): Record<string, number> {
  const normed = header.map(norm)
  const map: Record<string, number> = {}
  for (const matcher of COL_MATCHERS) {
    if (map[matcher.key] !== undefined) continue
    for (const needle of matcher.any) {
      const idx = normed.findIndex((h) => h.includes(needle))
      if (idx >= 0) { map[matcher.key] = idx; break }
    }
  }
  return map
}

export function parseIngCsv(text: string): ParsedStatement {
  const warnings: string[] = []
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length > 0)
  if (rawLines.length === 0) {
    return emptyStatement(['Pusty plik CSV.'])
  }
  const sep = detectSeparator(rawLines)
  const headerIdx = findHeaderRow(rawLines, sep)
  if (headerIdx < 0) {
    return emptyStatement([
      'Nie znaleziono wiersza nagłówka (oczekiwano kolumn z „Data” i „Kwota”). Sprawdź czy to eksport historii ING.',
    ])
  }

  // Preambuła — spróbuj wyłuskać numer rachunku właściciela (IBAN) z linii przed nagłówkiem.
  let accountNumber: string | null = null
  for (let i = 0; i < headerIdx; i++) {
    const iban = extractIban(rawLines[i])
    if (iban) { accountNumber = normalizeIban(iban); break }
  }

  const header = splitCsvLine(rawLines[headerIdx], sep)
  const col = mapColumns(header)
  if (col.amount === undefined || col.bookingDate === undefined) {
    warnings.push('Nie rozpoznano kolumny kwoty lub daty — mapowanie może być niepełne.')
  }

  const transactions: ParsedTransaction[] = []
  let currency = 'PLN'
  let periodFrom: Date | null = null
  let periodTo: Date | null = null
  let lastBalance: number | null = null

  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const cells = splitCsvLine(rawLines[i], sep)
    if (cells.every((c) => c === '')) continue
    const get = (k: string) => (col[k] !== undefined ? (cells[col[k]] ?? '').trim() : '')

    const bookingDate = parseFlexibleDate(get('bookingDate'))
    if (!bookingDate) continue // wiersz stopki/sumaryczny
    const signedAmount = parseAmountPl(get('amount'))
    if (signedAmount === null || signedAmount === 0) {
      if (get('amount')) warnings.push(`Wiersz ${i + 1}: nie rozpoznano kwoty „${get('amount')}”.`)
      continue
    }
    const cur = get('currency')
    if (cur) currency = cur.toUpperCase()

    const balance = col.balance !== undefined ? parseAmountPl(get('balance')) : null
    if (balance !== null) lastBalance = balance

    const cp = get('counterparty')
    const acc = get('account')

    if (!periodFrom || bookingDate < periodFrom) periodFrom = bookingDate
    if (!periodTo || bookingDate > periodTo) periodTo = bookingDate

    transactions.push({
      bookingDate,
      valueDate: parseFlexibleDate(get('valueDate')) || bookingDate,
      side: signedAmount >= 0 ? 'CREDIT' : 'DEBIT',
      amount: Math.abs(signedAmount),
      currency: cur ? cur.toUpperCase() : currency,
      counterpartyName: cp || null,
      counterpartyIban: normalizeIban(extractIban(acc) || acc || null),
      title: get('title') || null,
      bankRef: null,
      balanceAfter: balance,
    })
  }

  if (transactions.length === 0) warnings.push('Nie znaleziono żadnych transakcji w pliku CSV.')

  return {
    format: 'CSV',
    accountNumber,
    statementNumber: null,
    periodFrom,
    periodTo,
    openingBalance: null,
    closingBalance: lastBalance,
    currency,
    transactions,
    warnings,
  }
}

function emptyStatement(warnings: string[]): ParsedStatement {
  return {
    format: 'CSV',
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
