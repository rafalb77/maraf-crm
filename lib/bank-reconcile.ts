// =====================================================================
// Silnik dopasowania (rekoncyliacji) wpłat z wyciągu ING do harmonogramu.
//
// Dla każdej pozycji CREDIT (wpływ) szukamy raty (ContractPayment PLANOWANA),
// której dotyczy wpłata. Sygnały (malejąco po sile):
//   1. subrachunek OMRP nabywcy (Contract.escrowSubaccount) w IBAN/ref/tytule — decydujący
//   2. numer umowy (Contract.number) w tytule przelewu — bardzo silny
//   3. nazwisko/nazwa nabywcy w danych kontrahenta lub tytule
//   4. kwota == plannedAmount (dokładnie / w tolerancji)
//   5. numer lokalu w tytule
//
// Wynik: MATCHED (pewne, do zaksięgowania), SUGGESTED (do przeglądu), UNMATCHED.
// Zaksięgowanie (applyMatch) oznacza ratę OPLACONA, tworzy EscrowDeposit (source=BANK)
// i — gdy wpłata po terminie — nalicza odsetki (PaymentInterest). Człowiek zatwierdza.
// =====================================================================

import { prisma } from './prisma'
import { computeDelayInterest, ratePeriodsForContract } from './interest'

export type OpenPayment = {
  id: string
  plannedAmount: number
  plannedDate: Date | null
  title: string | null
  type: string
  contractId: string
  contractNumber: string
  // Subrachunki OMRP: reczny numer z umowy (nadpisanie) + numery z LOKALI
  // umowy (rachunki wirtualne ING sa per lokal). Kazdy pasuje jako decydujacy.
  escrowSubaccounts: string[]
  interestType: string
  interestCustomRate: number | null
  buyerNames: string[]
  surnames: string[]
  unitNumbers: string[]
}

export type TxLite = {
  id?: string
  side: 'CREDIT' | 'DEBIT'
  amount: number
  counterpartyName: string | null
  counterpartyIban: string | null
  title: string | null
  bankRef: string | null
  bookingDate: Date
}

export type Candidate = {
  paymentId: string
  contractId: string
  contractNumber: string
  score: number
  reasons: string[]
  amountDelta: number // tx.amount - plannedAmount (dodatnia = nadpłata)
}

export type MatchOutcome = {
  status: 'MATCHED' | 'SUGGESTED' | 'UNMATCHED'
  best: Candidate | null
  alternatives: Candidate[]
  reason: string
}

const DEFAULT_TOLERANCE_PCT = 0.5 // ±0,5%
const MIN_ABS_TOLERANCE = 1.0 // min. 1 zł (zaokrąglenia)

function normRef(s: string | null | undefined): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}
function normText(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .replace(/ł/g, 'l') // ł NIE rozkłada się przez NFD
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Nazwisko/nazwa jako CAŁE słowo (granice = nie-litera), nie podciąg: dane
 * kontrahenta z wyciągu zawierają adres, a „Maj” ⊂ „ul. 1 Maja” dawało
 * fałszywe trafienie nabywcy.
 */
function hasWord(hay: string, needle: string): boolean {
  const n = needle.trim()
  if (!n) return false
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(hay)
}

/** Ładuje otwarte raty (PLANOWANA) z kontekstem do dopasowania. */
export async function loadOpenPayments(): Promise<OpenPayment[]> {
  const rows = await prisma.contractPayment.findMany({
    where: { status: 'PLANOWANA' },
    include: {
      contract: {
        include: {
          client: { select: { firstName: true, lastName: true } },
          contractClients: { include: { client: { select: { firstName: true, lastName: true } } } },
          contractUnits: { include: { unit: { select: { number: true, escrowSubaccount: true } } } },
        },
      },
    },
  })
  return rows.map((p) => {
    const c = p.contract
    const clients = [c.client, ...c.contractClients.map((cc) => cc.client)].filter(Boolean) as {
      firstName: string
      lastName: string
    }[]
    const buyerNames = uniq(clients.map((cl) => `${cl.firstName} ${cl.lastName}`.trim()))
    const surnames = uniq(clients.map((cl) => cl.lastName).filter((s) => s && s.length >= 3))
    const unitNumbers = uniq(c.contractUnits.map((u) => u.unit?.number).filter(Boolean) as string[])
    // Numer z umowy (reczne nadpisanie) + rachunki wirtualne lokali umowy.
    const escrowSubaccounts = uniq([
      c.escrowSubaccount,
      ...c.contractUnits.map((u) => u.unit?.escrowSubaccount),
    ].filter(Boolean) as string[])
    return {
      id: p.id,
      plannedAmount: p.plannedAmount,
      plannedDate: p.plannedDate,
      title: p.title,
      type: p.type,
      contractId: c.id,
      contractNumber: c.number,
      escrowSubaccounts,
      interestType: c.interestType,
      interestCustomRate: c.interestCustomRate,
      buyerNames,
      surnames,
      unitNumbers,
    }
  })
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)))
}

/** Ocena pojedynczej pary (transakcja, rata). */
export function scoreCandidate(tx: TxLite, p: OpenPayment, tolerancePct = DEFAULT_TOLERANCE_PCT): Candidate {
  const reasons: string[] = []
  let score = 0

  const hayRef = normRef(`${tx.title} ${tx.bankRef} ${tx.counterpartyIban}`)
  const hayText = normText(`${tx.title} ${tx.counterpartyName}`)

  // 1. Subrachunek OMRP nabywcy (z umowy lub z lokali umowy)
  for (const sa of p.escrowSubaccounts) {
    const sub = normRef(sa)
    if (sub.length >= 6 && hayRef.includes(sub)) {
      score += 100
      reasons.push('subrachunek powierniczy nabywcy')
      break
    }
  }

  // 2. Numer umowy w tytule / referencji
  const cn = normRef(p.contractNumber)
  if (cn.length >= 4 && hayRef.includes(cn)) {
    score += 55
    reasons.push(`nr umowy ${p.contractNumber}`)
  }

  // 3. Nazwisko / nazwa nabywcy
  let nameHit = false
  for (const full of p.buyerNames) {
    if (full.length >= 5 && hasWord(hayText, normText(full))) {
      score += 40
      reasons.push(`nabywca „${full}”`)
      nameHit = true
      break
    }
  }
  if (!nameHit) {
    for (const sur of p.surnames) {
      if (hasWord(hayText, normText(sur))) {
        score += 25
        reasons.push(`nazwisko „${sur}”`)
        break
      }
    }
  }

  // 4. Kwota
  const delta = round2(tx.amount - p.plannedAmount)
  const tol = Math.max(MIN_ABS_TOLERANCE, (p.plannedAmount * tolerancePct) / 100)
  if (Math.abs(delta) <= 0.01) {
    score += 30
    reasons.push('kwota dokładna')
  } else if (Math.abs(delta) <= tol) {
    score += 22
    reasons.push('kwota w tolerancji')
  } else if (delta < 0) {
    reasons.push(`niedopłata ${fmt(delta)} zł`)
  } else {
    reasons.push(`nadpłata +${fmt(delta)} zł`)
  }

  // 5. Numer lokalu
  for (const num of p.unitNumbers) {
    if (num.length >= 2 && hayRef.includes(normRef(num))) {
      score += 12
      reasons.push(`lokal ${num}`)
      break
    }
  }

  return { paymentId: p.id, contractId: p.contractId, contractNumber: p.contractNumber, score, reasons, amountDelta: delta }
}

/** Dopasowuje transakcję do najlepszej raty spośród kandydatów. */
export function matchTransaction(tx: TxLite, openPayments: OpenPayment[], tolerancePct = DEFAULT_TOLERANCE_PCT): MatchOutcome {
  if (tx.side !== 'CREDIT') {
    return { status: 'UNMATCHED', best: null, alternatives: [], reason: 'obciążenie (nie wpłata nabywcy)' }
  }
  const scored = openPayments
    .map((p) => scoreCandidate(tx, p, tolerancePct))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    return { status: 'UNMATCHED', best: null, alternatives: [], reason: 'brak pasującej raty' }
  }

  const best = scored[0]
  const second = scored[1]
  const amountOk = Math.abs(best.amountDelta) <= Math.max(MIN_ABS_TOLERANCE, 0.01)
  const decisive = best.reasons.some((r) => r.startsWith('subrachunek') || r.startsWith('nr umowy'))
  const ambiguous = second && best.score - second.score < 20 && second.score >= 40

  let status: MatchOutcome['status']
  if (decisive && amountOk && !ambiguous) status = 'MATCHED'
  else if (best.score >= 55 && amountOk && !ambiguous) status = 'MATCHED'
  else if (best.score >= 40) status = 'SUGGESTED'
  else status = 'UNMATCHED'

  const reason = `${best.reasons.join(', ')}${ambiguous ? ' • niejednoznaczne (kilku kandydatów)' : ''}`
  return { status, best, alternatives: scored.slice(1, 4), reason }
}

/**
 * Uruchamia dopasowanie dla całego wyciągu — aktualizuje pola matchStatus/matchScore/
 * matchReason/contractPaymentId/contractId na pozycjach. NIE księguje (to applyMatch).
 * Pomija pozycje już zaksięgowane (MATCHED z depositem) i oznaczone IGNORED.
 */
export async function reconcileStatement(
  statementId: string,
  opts: { tolerancePct?: number } = {}
): Promise<{ matched: number; suggested: number; unmatched: number; credits: number }> {
  const [txs, openPayments] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { statementId, matchStatus: { notIn: ['IGNORED'] }, escrowDeposit: null },
    }),
    loadOpenPayments(),
  ])

  let matched = 0
  let suggested = 0
  let unmatched = 0
  let credits = 0

  const outcomes: { txId: string; outcome: MatchOutcome }[] = []
  for (const tx of txs) {
    if (tx.side !== 'CREDIT') continue
    credits++
    outcomes.push({
      txId: tx.id,
      outcome: matchTransaction(
        {
          id: tx.id,
          side: 'CREDIT',
          amount: tx.amount,
          counterpartyName: tx.counterpartyName,
          counterpartyIban: tx.counterpartyIban,
          title: tx.title,
          bankRef: tx.bankRef,
          bookingDate: tx.bookingDate,
        },
        openPayments,
        opts.tolerancePct
      ),
    })
  }

  // Jedna rata = jedna wpłata. Dwie wpłaty MATCHED na tę samą ratę (np. ta sama
  // kwota od tego samego nabywcy dwa razy) → obie do przeglądu; inaczej zbiorcze
  // księgowanie próbowałoby zaksięgować drugą na ratę już opłaconą.
  const matchedPerPayment = new Map<string, number>()
  for (const { outcome } of outcomes) {
    if (outcome.status === 'MATCHED' && outcome.best) {
      matchedPerPayment.set(outcome.best.paymentId, (matchedPerPayment.get(outcome.best.paymentId) ?? 0) + 1)
    }
  }
  for (const { outcome } of outcomes) {
    if (outcome.status === 'MATCHED' && outcome.best && (matchedPerPayment.get(outcome.best.paymentId) ?? 0) > 1) {
      outcome.status = 'SUGGESTED'
      outcome.reason = `${outcome.reason} • kilka wpłat pasuje do tej samej raty`
    }
  }

  for (const { txId, outcome } of outcomes) {
    if (outcome.status === 'MATCHED') matched++
    else if (outcome.status === 'SUGGESTED') suggested++
    else unmatched++

    await prisma.bankTransaction.update({
      where: { id: txId },
      data: {
        matchStatus: outcome.status,
        matchScore: outcome.best?.score ?? null,
        matchReason: outcome.reason || null,
        contractPaymentId: outcome.best?.paymentId ?? null,
        contractId: outcome.best?.contractId ?? null,
      },
    })
  }

  return { matched, suggested, unmatched, credits }
}

/**
 * Księguje dopasowanie: rata → OPLACONA, tworzy EscrowDeposit (source=BANK) i odsetki.
 * Idempotentne: jeśli deposit już istnieje dla transakcji — nic nie robi.
 */
export async function applyMatch(
  transactionId: string,
  paymentId: string,
  opts: { escrowAccountId?: string | null } = {}
): Promise<{ ok: true; interest: number } | { ok: false; error: string }> {
  const tx = await prisma.bankTransaction.findUnique({
    where: { id: transactionId },
    include: { escrowDeposit: true, statement: { select: { escrowAccountId: true } } },
  })
  if (!tx) return { ok: false, error: 'Nie znaleziono transakcji' }
  if (tx.side !== 'CREDIT') return { ok: false, error: 'Można księgować tylko wpłaty (CREDIT)' }
  if (tx.escrowDeposit) return { ok: true, interest: 0 } // już zaksięgowane

  const payment = await prisma.contractPayment.findUnique({
    where: { id: paymentId },
    include: {
      contract: {
        select: {
          id: true,
          number: true,
          interestType: true,
          interestCustomRate: true,
          client: { select: { firstName: true, lastName: true } },
          contractUnits: { select: { unitId: true } },
        },
      },
    },
  })
  if (!payment) return { ok: false, error: 'Nie znaleziono raty' }
  // Rata przyjmuje JEDNĄ wpłatę (EscrowDeposit.contractPaymentId jest unikalny).
  // Druga wpłata na tę samą ratę (wpłata częściowa, duplikat) = czytelna odmowa
  // zamiast błędu unikalności z bazy.
  if (payment.status !== 'PLANOWANA') {
    return { ok: false, error: `Rata „${payment.title || payment.type}” nie jest planowana (status ${payment.status}) — nie można zaksięgować drugiej wpłaty.` }
  }
  const existingDeposit = await prisma.escrowDeposit.findUnique({ where: { contractPaymentId: paymentId }, select: { id: true } })
  if (existingDeposit) {
    return { ok: false, error: `Rata „${payment.title || payment.type}” ma już zaksięgowaną wpłatę. Wpłaty częściowe / dopłaty zaksięguj ręcznie w rejestrze wpłat.` }
  }

  const accountId = opts.escrowAccountId || tx.statement.escrowAccountId
  if (!accountId) {
    return { ok: false, error: 'Brak przypisanego rachunku powierniczego dla wyciągu — przypisz konto do wyciągu.' }
  }

  const c = payment.contract
  const buyerName = c.client ? `${c.client.firstName} ${c.client.lastName}`.trim() : null
  const unitId = c.contractUnits.length === 1 ? c.contractUnits[0].unitId : null

  // Odsetki za opóźnienie (jeśli wpłata po terminie).
  let interestData: {
    amount: number
    daysLate: number
    breakdown: unknown
    ratePct: number | null
    dueDate: Date
  } | null = null
  if (payment.plannedDate && tx.bookingDate > payment.plannedDate) {
    const periods = ratePeriodsForContract(c.interestType, c.interestCustomRate)
    const res = computeDelayInterest(payment.plannedAmount, payment.plannedDate, tx.bookingDate, periods)
    if (res.amount > 0 && res.daysLate > 0) {
      interestData = {
        amount: res.amount,
        daysLate: res.daysLate,
        breakdown: res.slices,
        ratePct: res.dominantRatePct,
        dueDate: payment.plannedDate,
      }
    }
  }

  try {
  await prisma.$transaction(async (db) => {
    await db.contractPayment.update({
      where: { id: paymentId },
      data: { status: 'OPLACONA', paidDate: tx.bookingDate, paidAmount: tx.amount },
    })
    await db.escrowDeposit.create({
      data: {
        accountId,
        date: tx.bookingDate,
        amount: tx.amount,
        buyerName,
        contractNumber: c.number,
        unitId,
        contractPaymentId: paymentId,
        bankTransactionId: tx.id,
        source: 'BANK',
        note: payment.title ? `Wyciąg ING: ${payment.title}` : 'Wpłata z wyciągu ING',
      },
    })
    await db.bankTransaction.update({
      where: { id: tx.id },
      data: { matchStatus: 'MATCHED', contractPaymentId: paymentId, contractId: c.id },
    })
    if (interestData) {
      await db.paymentInterest.upsert({
        where: { contractPaymentId: paymentId },
        create: {
          contractPaymentId: paymentId,
          contractId: c.id,
          principal: payment.plannedAmount,
          dueDate: interestData.dueDate,
          paidDate: tx.bookingDate,
          daysLate: interestData.daysLate,
          type: c.interestType === 'UMOWNE' ? 'UMOWNE' : 'USTAWOWE_ZA_OPOZNIENIE',
          ratePctSnapshot: interestData.ratePct,
          amount: interestData.amount,
          breakdown: interestData.breakdown as any,
          status: 'NALICZONE',
        },
        update: {
          principal: payment.plannedAmount,
          dueDate: interestData.dueDate,
          paidDate: tx.bookingDate,
          daysLate: interestData.daysLate,
          ratePctSnapshot: interestData.ratePct,
          amount: interestData.amount,
          breakdown: interestData.breakdown as any,
        },
      })
    }
  })
  } catch (e: any) {
    // Wyścig (ktoś zaksięgował równolegle) → naruszenie unikalności zamiast 500.
    if (e?.code === 'P2002') return { ok: false, error: 'Rata lub transakcja została w międzyczasie zaksięgowana.' }
    throw e
  }

  return { ok: true, interest: interestData?.amount ?? 0 }
}

/** Cofa zaksięgowanie: kasuje deposit + odsetki, rata → PLANOWANA. */
export async function unapplyMatch(transactionId: string): Promise<{ ok: boolean; error?: string }> {
  const tx = await prisma.bankTransaction.findUnique({
    where: { id: transactionId },
    include: { escrowDeposit: true },
  })
  if (!tx) return { ok: false, error: 'Nie znaleziono transakcji' }
  const paymentId = tx.contractPaymentId

  await prisma.$transaction(async (db) => {
    if (tx.escrowDeposit) await db.escrowDeposit.delete({ where: { id: tx.escrowDeposit.id } })
    if (paymentId) {
      await db.paymentInterest.deleteMany({ where: { contractPaymentId: paymentId } })
      await db.contractPayment.update({
        where: { id: paymentId },
        data: { status: 'PLANOWANA', paidDate: null, paidAmount: null },
      })
    }
    await db.bankTransaction.update({
      where: { id: tx.id },
      data: { matchStatus: 'SUGGESTED' },
    })
  })
  return { ok: true }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
function fmt(n: number): string {
  return Math.abs(n).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
