// Parser camt.053 (ISO 20022 XML) — eksport wyciągu z ING Business.
// Obsługuje camt.053.001.02 (wycofywany 11.2026) i .001.08 (rekomendowany) —
// nawigujemy po nazwach lokalnych elementów, więc wersja/namespace nie ma znaczenia.
//
// Ścieżki (zweryfikowane 2026-07-14 z dok. ING 1122382):
//   Document > BkToCstmrStmt > Stmt
//     Stmt/Acct/Id/IBAN, Stmt/Acct/Ccy, Stmt/ElctrncSeqNb, Stmt/FrToDt
//     Stmt/Bal (OPBD/CLBD) — saldo otwarcia/zamknięcia
//     Stmt/Ntry — pozycja: Amt(@Ccy), CdtDbtInd(CRDT/DBIT), BookgDt/ValDt, AcctSvcrRef
//       Ntry/NtryDtls/TxDtls (może być wiele — przelew zbiorczy):
//         Refs/EndToEndId, RmtInf/Ustrd (tytuł), RltdPties/Dbtr/Nm (płatnik dla CRDT),
//         RltdPties/DbtrAcct/Id/IBAN

import { XMLParser } from 'fast-xml-parser'
import type { ParsedStatement, ParsedTransaction } from './index'
import { normalizeIban } from './index'
import { parseAmountPl, parseFlexibleDate } from './util'

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

/** Wartość węzła, który może być tekstem lub obiektem { '#text', '@_...' }. */
function nodeText(v: any): string | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'object') {
    if ('#text' in v) return String(v['#text'])
    return null
  }
  return String(v)
}

function amountOf(node: any): { value: number | null; currency: string | null } {
  if (node === undefined || node === null) return { value: null, currency: null }
  if (typeof node === 'object') {
    return { value: parseAmountPl(nodeText(node)), currency: node['@_Ccy'] ? String(node['@_Ccy']) : null }
  }
  return { value: parseAmountPl(String(node)), currency: null }
}

function dateOf(node: any): Date | null {
  if (!node) return null
  // BookgDt/ValDt zawiera <Dt> lub <DtTm>
  const dt = node.Dt ?? node.DtTm ?? node
  return parseFlexibleDate(nodeText(dt) || (typeof dt === 'string' ? dt : null))
}

function ustrdTitle(rmtInf: any): string | null {
  if (!rmtInf) return null
  const parts = toArray(rmtInf.Ustrd).map(nodeText).filter(Boolean) as string[]
  if (parts.length) return parts.join(' ').replace(/\s+/g, ' ').trim()
  const strdRef = rmtInf.Strd?.CdtrRefInf?.Ref
  return nodeText(strdRef)
}

export function parseCamt053(text: string): ParsedStatement {
  const warnings: string[] = []
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true, // usuwa prefiksy namespace (obsługa v02/v08 i ewentualnych prefiksów)
    parseTagValue: false, // trzymamy tekst; kwoty parsujemy sami (przecinek/kropka)
    trimValues: true,
  })

  let doc: any
  try {
    doc = parser.parse(text)
  } catch (e: any) {
    return empty(['Nie udało się sparsować XML camt.053: ' + (e?.message || e)])
  }

  const root = doc?.Document?.BkToCstmrStmt
  if (!root) return empty(['Brak węzła Document/BkToCstmrStmt — to nie jest wyciąg camt.053.'])

  const stmts = toArray(root.Stmt)
  if (stmts.length === 0) return empty(['Brak węzłów Stmt w wyciągu camt.053.'])

  let accountNumber: string | null = null
  let statementNumber: string | null = null
  let openingBalance: number | null = null
  let closingBalance: number | null = null
  let currency = 'PLN'
  let periodFrom: Date | null = null
  let periodTo: Date | null = null
  const transactions: ParsedTransaction[] = []

  for (const stmt of stmts) {
    accountNumber = accountNumber || normalizeIban(nodeText(stmt.Acct?.Id?.IBAN) || nodeText(stmt.Acct?.Id?.Othr?.Id))
    currency = nodeText(stmt.Acct?.Ccy) || currency
    statementNumber = statementNumber || nodeText(stmt.ElctrncSeqNb) || nodeText(stmt.LglSeqNb) || nodeText(stmt.Id)
    const fr = dateOf(stmt.FrToDt?.FrDtTm ? { DtTm: stmt.FrToDt.FrDtTm } : stmt.FrToDt?.FrDt)
    const to = dateOf(stmt.FrToDt?.ToDtTm ? { DtTm: stmt.FrToDt.ToDtTm } : stmt.FrToDt?.ToDt)
    if (fr) periodFrom = fr
    if (to) periodTo = to

    // Salda
    for (const bal of toArray(stmt.Bal)) {
      const code = nodeText(bal.Tp?.CdOrPrtry?.Cd)
      const { value } = amountOf(bal.Amt)
      const sign = nodeText(bal.CdtDbtInd) === 'DBIT' ? -1 : 1
      const signed = value === null ? null : sign * Math.abs(value)
      if (code === 'OPBD' || code === 'PRCD') openingBalance = signed
      if (code === 'CLBD') closingBalance = signed
    }

    for (const ntry of toArray(stmt.Ntry)) {
      const entryAmt = amountOf(ntry.Amt)
      const entryCdtDbt = nodeText(ntry.CdtDbtInd)
      const bookingDate = dateOf(ntry.BookgDt) || dateOf(ntry.ValDt)
      const valueDate = dateOf(ntry.ValDt) || bookingDate
      const acctSvcrRef = nodeText(ntry.AcctSvcrRef)
      const status = nodeText(ntry.Sts) || nodeText(ntry.Sts?.Cd)
      if (status === 'PDNG') continue // pomijamy operacje oczekujące (jeszcze niezaksięgowane)

      const txDetails = toArray(ntry.NtryDtls?.TxDtls)

      const emit = (
        side: 'CREDIT' | 'DEBIT',
        amount: number,
        cur: string | null,
        tx: any | null
      ) => {
        const bd = bookingDate || valueDate || new Date()
        if (!periodFrom || bd < periodFrom) periodFrom = bd
        if (!periodTo || bd > periodTo) periodTo = bd
        // Dla wpływu (CRDT) płatnik = Dbtr; dla obciążenia (DBIT) odbiorca = Cdtr.
        const party = side === 'CREDIT' ? tx?.RltdPties?.Dbtr : tx?.RltdPties?.Cdtr
        const acct = side === 'CREDIT' ? tx?.RltdPties?.DbtrAcct : tx?.RltdPties?.CdtrAcct
        const name = nodeText(party?.Nm) || nodeText(party?.Pty?.Nm)
        const iban = normalizeIban(nodeText(acct?.Id?.IBAN) || nodeText(acct?.Id?.Othr?.Id))
        const title = ustrdTitle(tx?.RmtInf)
        const ref = nodeText(tx?.Refs?.EndToEndId) || nodeText(tx?.Refs?.TxId) || acctSvcrRef
        transactions.push({
          bookingDate: bd,
          valueDate,
          side,
          amount: Math.abs(amount),
          currency: cur || currency,
          counterpartyName: name,
          counterpartyIban: iban,
          title,
          bankRef: ref && ref !== 'NOTPROVIDED' ? ref : null,
          balanceAfter: null,
        })
      }

      if (txDetails.length <= 1) {
        const tx = txDetails[0] || null
        if (entryAmt.value === null || entryAmt.value === 0) continue
        const side: 'CREDIT' | 'DEBIT' = entryCdtDbt === 'DBIT' ? 'DEBIT' : 'CREDIT'
        emit(side, entryAmt.value, entryAmt.currency, tx)
      } else {
        // Przelew zbiorczy — jedna pozycja na TxDtls.
        for (const tx of txDetails) {
          const a = amountOf(tx.Amt)
          const side: 'CREDIT' | 'DEBIT' =
            (nodeText(tx.CdtDbtInd) || entryCdtDbt) === 'DBIT' ? 'DEBIT' : 'CREDIT'
          const val = a.value ?? entryAmt.value
          if (val === null || val === 0) continue
          emit(side, val, a.currency || entryAmt.currency, tx)
        }
      }
    }
  }

  if (transactions.length === 0) warnings.push('Nie znaleziono zaksięgowanych pozycji (Ntry) w wyciągu camt.053.')

  return {
    format: 'CAMT053',
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

function empty(warnings: string[]): ParsedStatement {
  return {
    format: 'CAMT053',
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
