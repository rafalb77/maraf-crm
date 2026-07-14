// =====================================================================
// Zapis (commit) zaimportowanego wyciągu ING do bazy + uruchomienie dopasowania.
// Idempotencja: fileHash (sha256 pliku) — ponowny import tego samego pliku zwraca
// istniejący wyciąg. W obrębie wyciągu deduplikacja po transactionDedupeKey.
// =====================================================================

import { createHash } from 'crypto'
import { prisma } from './prisma'
import type { Company } from './types'
import type { ParsedStatement } from './bank-import'
import { normalizeIban, transactionDedupeKey } from './bank-import'
import { reconcileStatement } from './bank-reconcile'

export function fileHashOf(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** Szuka rachunku powierniczego pasującego do IBAN z wyciągu (po znormalizowanym numerze). */
export async function findEscrowAccountForIban(
  iban: string | null,
  company: Company
): Promise<{ id: string; name: string } | null> {
  if (!iban) return null
  const norm = normalizeIban(iban)
  if (!norm) return null
  const accounts = await prisma.escrowAccount.findMany({
    where: { company },
    select: { id: true, name: true, accountNumber: true },
  })
  const hit = accounts.find((a) => a.accountNumber && normalizeIban(a.accountNumber) === norm)
  return hit ? { id: hit.id, name: hit.name } : null
}

export type CommitResult = {
  statementId: string
  alreadyImported: boolean
  txCreated: number
  txDuplicates: number
  reconcile: { matched: number; suggested: number; unmatched: number; credits: number }
  escrowAccountId: string | null
}

export async function commitStatement(
  parsed: ParsedStatement,
  meta: { fileName: string; fileHash: string; company: Company; importedById?: string | null }
): Promise<CommitResult> {
  // Idempotencja po hashu pliku.
  const existing = await prisma.bankStatement.findUnique({ where: { fileHash: meta.fileHash } })
  if (existing) {
    return {
      statementId: existing.id,
      alreadyImported: true,
      txCreated: 0,
      txDuplicates: 0,
      reconcile: { matched: 0, suggested: 0, unmatched: 0, credits: 0 },
      escrowAccountId: existing.escrowAccountId,
    }
  }

  const account = await findEscrowAccountForIban(parsed.accountNumber, meta.company)

  // Deduplikacja pozycji w obrębie wyciągu.
  const seen = new Set<string>()
  const rows = parsed.transactions
    .map((t) => ({ t, key: transactionDedupeKey(t) }))
    .filter(({ key }) => (seen.has(key) ? false : (seen.add(key), true)))

  const statement = await prisma.$transaction(async (db) => {
    const st = await db.bankStatement.create({
      data: {
        company: meta.company,
        escrowAccountId: account?.id ?? null,
        format: parsed.format,
        fileName: meta.fileName,
        fileHash: meta.fileHash,
        accountNumber: parsed.accountNumber,
        statementNumber: parsed.statementNumber,
        periodFrom: parsed.periodFrom,
        periodTo: parsed.periodTo,
        openingBalance: parsed.openingBalance,
        closingBalance: parsed.closingBalance,
        currency: parsed.currency,
        txCount: rows.length,
        importedById: meta.importedById ?? null,
      },
    })
    if (rows.length > 0) {
      await db.bankTransaction.createMany({
        data: rows.map(({ t, key }) => ({
          statementId: st.id,
          bookingDate: t.bookingDate,
          valueDate: t.valueDate,
          side: t.side,
          amount: t.amount,
          currency: t.currency,
          counterpartyName: t.counterpartyName,
          counterpartyIban: t.counterpartyIban,
          title: t.title,
          bankRef: t.bankRef,
          balanceAfter: t.balanceAfter,
          dedupeKey: key,
        })),
      })
    }
    return st
  })

  const reconcile = await reconcileStatement(statement.id)
  await prisma.bankStatement.update({
    where: { id: statement.id },
    data: { matchedCount: reconcile.matched },
  })

  return {
    statementId: statement.id,
    alreadyImported: false,
    txCreated: rows.length,
    txDuplicates: parsed.transactions.length - rows.length,
    reconcile,
    escrowAccountId: account?.id ?? null,
  }
}
