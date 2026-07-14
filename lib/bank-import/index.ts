// =====================================================================
// Import wyciągów bankowych ING Bank Śląski — dyspozytor formatów.
//
// Wejście: surowy tekst pliku (już zdekodowany do UTF-8 w API) + nazwa pliku.
// Wyjście: znormalizowany ParsedStatement niezależny od formatu źródłowego.
//
// Obsługiwane formaty (auto-detekcja po treści):
//   - CAMT053  — ISO 20022 XML (ING Business: „Wyciąg camt.053")
//   - MT940    — SWIFT statement (ING Business: „Wyciąg MT940")
//   - CSV      — eksport historii (Moje ING / ING Business), separator ';', CP1250
//
// Parsery szczegółowe: ./mt940, ./csv, ./camt.
// =====================================================================

import { parseMt940 } from './mt940'
import { parseIngCsv } from './csv'
import { parseCamt053 } from './camt'

export type StatementFormat = 'MT940' | 'CSV' | 'CAMT053'

export type ParsedTransaction = {
  bookingDate: Date
  valueDate: Date | null
  side: 'CREDIT' | 'DEBIT'
  amount: number // zawsze dodatnia; kierunek w `side`
  currency: string
  counterpartyName: string | null
  counterpartyIban: string | null
  title: string | null
  bankRef: string | null
  balanceAfter: number | null
}

export type ParsedStatement = {
  format: StatementFormat
  accountNumber: string | null // IBAN znormalizowany (bez spacji, wielkie litery)
  statementNumber: string | null
  periodFrom: Date | null
  periodTo: Date | null
  openingBalance: number | null
  closingBalance: number | null
  currency: string
  transactions: ParsedTransaction[]
  warnings: string[]
}

/** Normalizuje numer rachunku/IBAN: usuwa spacje, wielkie litery. */
export function normalizeIban(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.replace(/[\s\-]/g, '').toUpperCase()
  return v.length >= 10 ? v : null
}

/** Wykrywa format pliku po treści. */
export function detectFormat(text: string, fileName?: string): StatementFormat {
  const head = text.slice(0, 4000)
  if (/<\?xml|<Document[\s>]|urn:iso:std:iso:20022|camt\.053/i.test(head)) return 'CAMT053'
  // MT940: obecność tagów pól SWIFT (:20:, :61:, :60F:)
  if (/(^|\n)\s*:(20|25|28C?|60[FM]|61|86|62[FM]):/.test(text)) return 'MT940'
  // Fallback po rozszerzeniu
  if (fileName) {
    const ext = fileName.toLowerCase().split('.').pop()
    if (ext === 'xml' || ext === 'camt') return 'CAMT053'
    if (ext === 'sta' || ext === 'mt940' || ext === 'txt') return 'MT940'
  }
  return 'CSV'
}

/** Główne wejście — parsuje tekst wyciągu w wykrytym (lub wymuszonym) formacie. */
export function parseStatement(text: string, fileName?: string, forceFormat?: StatementFormat): ParsedStatement {
  const format = forceFormat || detectFormat(text, fileName)
  switch (format) {
    case 'CAMT053':
      return parseCamt053(text)
    case 'MT940':
      return parseMt940(text)
    case 'CSV':
    default:
      return parseIngCsv(text)
  }
}

/**
 * Klucz deduplikacji pozycji w obrębie wyciągu — stabilny hash pól identyfikujących
 * transakcję. Pozwala re-importować ten sam okres bez duplikatów (np. wyciąg
 * dzienny nachodzący na miesięczny). Nie zależy od kolejności pozycji.
 */
export function transactionDedupeKey(t: ParsedTransaction): string {
  const parts = [
    t.bookingDate.toISOString().slice(0, 10),
    t.side,
    t.amount.toFixed(2),
    (t.counterpartyIban || '').replace(/\s/g, ''),
    (t.title || '').replace(/\s+/g, ' ').trim().slice(0, 80).toLowerCase(),
    (t.bankRef || '').trim(),
  ]
  return djb2(parts.join('|'))
}

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}
