// Parser MT940 (SWIFT statement) — eksport wyciągu z ING Bank Śląski
// (ING BusinessOnLine oraz plik wyjściowy SIMP/MARS). Zweryfikowane 2026-07-14
// z oficjalnymi specyfikacjami ING (dok. 1002602 sekcja 7 oraz SIMP/MARS MT940).
//
// Specyfika ING (pułapki generycznych parserów MT940):
//   1. Kod transakcji w :61: = 'S' + 3 cyfry (S076, S034, S940) — NIE SWIFT N/F/S.
//   2. Na jedną transakcję przypadają DWIE linie :86: (":86:076" + ":86:076~00...").
//   3. :86: strukturyzowane podpolami z separatorem TYLDY '~':
//        ~20..~28 tytuł | ~29 NRB | ~30 nr rozl./BIC | ~31 nr rach. |
//        ~32/~33 nazwa kontrahenta | ~38 pełny IBAN | ~60 opłata | ~61 kurs | ~62/~63 adres.
//   4. Pierwsza pozycja dnia bywa techniczna: :61:...C0,00S940NONREF — pomijamy (kwota 0).
//   5. Po '//' w :61: bywa identyfikator SIMP/MARS (rachunek wirtualny nabywcy) → bankRef.
//   6. Kodowanie pliku: CP852/CP1250 (dekodowane w API); struktura tagów jest ASCII.
//
// :61: układ: YYMMDD [MMDD] (R?[CD]) [fundsCode] kwota(NN,NN) S\d{3} [id//MARS]

import type { ParsedStatement, ParsedTransaction } from './index'
import { normalizeIban } from './index'
import { parseAmountPl, dateFromYYMMDD, dateFromMMDD, extractIban } from './util'

type Field = { tag: string; value: string }

/** Rozbija tekst MT940 na pola :NN: (wartość wielolinijkowa do następnego tagu). */
function tokenizeFields(text: string): Field[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const fields: Field[] = []
  let cur: Field | null = null
  for (const line of lines) {
    const m = line.match(/^:(\d{2,3}[A-Z]?):(.*)$/)
    if (m) {
      if (cur) fields.push(cur)
      cur = { tag: m[1], value: m[2] }
    } else if (cur) {
      if (line === '-') continue // znacznik końca wyciągu
      cur.value += '\n' + line
    }
  }
  if (cur) fields.push(cur)
  return fields
}

function parseBalance(value: string): { amount: number | null; currency: string | null } {
  const m = value.match(/^([CD])(\d{6})([A-Z]{3})([\d.,]+)/)
  if (!m) return { amount: null, currency: null }
  const sign = m[1] === 'D' ? -1 : 1
  const amt = parseAmountPl(m[4])
  return { amount: amt === null ? null : sign * Math.abs(amt), currency: m[3] }
}

// YYMMDD + opcjonalne MMDD + znak + [funds] + kwota + kod S\d{3}/N... + reszta
const RE_61 = /^(\d{6})(\d{4})?(R?[CD])([A-Z])?(\d+,\d{0,2})([A-Z]\d{3}|[A-Z]{4})?(.*)$/

type Line61 = {
  valueDate: Date | null
  bookingDate: Date | null
  side: 'CREDIT' | 'DEBIT'
  amount: number
  code: string | null
  bankRef: string | null
}

function parseLine61(value: string): Line61 | null {
  const firstLine = value.split('\n')[0]
  const m = firstLine.match(RE_61)
  if (!m) return null
  const valueDate = dateFromYYMMDD(m[1])
  const refYear = valueDate ? valueDate.getUTCFullYear() : new Date().getUTCFullYear()
  const refMonth = valueDate ? valueDate.getUTCMonth() + 1 : 1
  const bookingDate = m[2] ? dateFromMMDD(m[2], refYear, refMonth) : valueDate
  const mark = m[3]
  const side: 'CREDIT' | 'DEBIT' = mark === 'C' || mark === 'RD' ? 'CREDIT' : 'DEBIT'
  const amount = Math.abs(parseAmountPl(m[5]) || 0)
  const code = m[6] || null
  const rest = (m[7] || '').trim()
  let bankRef: string | null = null
  const slash = rest.indexOf('//')
  if (slash >= 0) bankRef = rest.slice(slash + 2).split('\n')[0].trim() || null
  else if (rest) bankRef = rest.split('\n')[0].trim() || null
  return { valueDate, bookingDate: bookingDate || valueDate, side, amount, code, bankRef }
}

// Parsuje SKLEJONE linie :86: (może być kilka na transakcję) → podpola tyldowe.
function parse86(values: string[]): { name: string | null; iban: string | null; title: string | null } {
  const joined = values.join('\n')
  const flat = joined.replace(/\n/g, ' ')

  const sub: Record<string, string> = {}
  const re = /~(\d{2})([^~]*)/g
  let mm: RegExpExecArray | null
  while ((mm = re.exec(joined)) !== null) {
    const key = mm[1]
    const val = mm[2].replace(/\n/g, ' ').trim()
    sub[key] = sub[key] ? `${sub[key]} ${val}` : val
  }
  const hasSub = Object.keys(sub).length > 0

  if (hasSub) {
    const name = clean(joinSub(sub, ['32', '33']))
    const titleSub = joinSub(sub, ['20', '21', '22', '23', '24', '25', '26', '27', '28'])
    const iban =
      normalizeIban(sub['38']) ||
      (sub['29'] ? normalizeIban('PL' + sub['29'].replace(/\D/g, '')) : null) ||
      extractIban(flat)
    return { name, iban, title: clean(titleSub) || clean(flat) }
  }

  return { name: null, iban: extractIban(flat), title: clean(flat) }
}

function joinSub(sub: Record<string, string>, keys: string[]): string | null {
  const parts = keys.map((k) => sub[k]).filter((v) => v && v.trim())
  return parts.length ? parts.join(' ').trim() : null
}

function clean(s: string | null): string | null {
  if (!s) return null
  const t = s.replace(/\s+/g, ' ').trim()
  return t || null
}

export function parseMt940(text: string): ParsedStatement {
  const warnings: string[] = []
  const fields = tokenizeFields(text)

  let accountNumber: string | null = null
  let statementNumber: string | null = null
  let openingBalance: number | null = null
  let closingBalance: number | null = null
  let currency = 'PLN'
  let periodFrom: Date | null = null
  let periodTo: Date | null = null

  const transactions: ParsedTransaction[] = []
  let pending: Line61 | null = null
  let pending86: string[] = []

  const flush = () => {
    if (!pending) return
    // Pomijamy pozycje techniczne o kwocie 0 (np. S940 NONREF — saldo dnia).
    if (pending.amount === 0) { pending = null; pending86 = []; return }
    const d86 = parse86(pending86)
    const bd = pending.bookingDate || pending.valueDate
    if (bd) {
      if (!periodFrom || bd < periodFrom) periodFrom = bd
      if (!periodTo || bd > periodTo) periodTo = bd
    }
    transactions.push({
      bookingDate: bd || new Date(),
      valueDate: pending.valueDate,
      side: pending.side,
      amount: pending.amount,
      currency,
      counterpartyName: d86.name,
      counterpartyIban: normalizeIban(d86.iban),
      title: d86.title,
      bankRef: pending.bankRef,
      balanceAfter: null,
    })
    pending = null
    pending86 = []
  }

  for (const f of fields) {
    switch (f.tag) {
      case '25':
        accountNumber = normalizeIban(f.value.replace(/^\//, ''))
        break
      case '28C':
      case '28':
        statementNumber = f.value.trim() || null
        break
      case '60F':
      case '60M': {
        const b = parseBalance(f.value)
        if (openingBalance === null) openingBalance = b.amount
        if (b.currency) currency = b.currency
        break
      }
      case '62F':
      case '62M': {
        const b = parseBalance(f.value)
        closingBalance = b.amount
        if (b.currency) currency = b.currency
        break
      }
      case '61':
        flush() // domknij poprzednią transakcję
        pending = parseLine61(f.value)
        pending86 = []
        if (!pending) warnings.push(`Nie rozpoznano linii :61: „${f.value.slice(0, 40)}…”`)
        break
      case '86':
        if (pending) pending86.push(f.value)
        // końcowy :86: (NAME ACCOUNT OWNER) bez pending — ignorujemy
        break
      default:
        break
    }
  }
  flush()

  if (transactions.length === 0) warnings.push('Nie znaleziono pozycji transakcyjnych (:61:) w pliku MT940.')

  return {
    format: 'MT940',
    accountNumber,
    statementNumber,
    periodFrom,
    periodTo,
    openingBalance,
    closingBalance,
    currency,
    transactions,
    warnings,
  }
}
