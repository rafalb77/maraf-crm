// =====================================================================
// Alerty modułu Rozliczenia powiernicze. Agreguje sygnały wymagające uwagi:
//   🔴 zaległe raty (po terminie, narastają odsetki)
//   🟠 niedopasowane wpływy z wyciągu (pieniądze na koncie o nieznanym źródle)
//   🟠 niedopłaty na dopasowanych ratach
//   🟡 sugestie dopasowań do przeglądu
//   🟡 raty wymagalne w najbliższych dniach
//   🔵 rozjazd salda wyciągu vs. suma zaksięgowanych wpłat
// =====================================================================

import { prisma } from './prisma'
import { computeDelayInterest, ratePeriodsForContract } from './interest'

export type EscrowAlert = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  kind: 'OVERDUE' | 'UNMATCHED' | 'UNDERPAY' | 'SUGGESTED' | 'UPCOMING' | 'BALANCE'
  title: string
  detail: string
  amount?: number
  contractId?: string
  contractNumber?: string
  href?: string
}

export type EscrowAlertsResult = {
  alerts: EscrowAlert[]
  counts: { critical: number; warning: number; info: number }
  summary: {
    overdueCount: number
    overdueAmount: number
    accruedInterest: number
    unmatchedCount: number
    unmatchedAmount: number
    suggestedCount: number
    upcomingCount: number
  }
}

const UPCOMING_DAYS = 7

export async function getEscrowAlerts(opts: { upcomingDays?: number } = {}): Promise<EscrowAlertsResult> {
  const upcomingDays = opts.upcomingDays ?? UPCOMING_DAYS
  const today = startOfToday()
  const horizon = new Date(today.getTime() + upcomingDays * 86400000)

  const [openPayments, unmatchedTx, suggestedCount] = await Promise.all([
    prisma.contractPayment.findMany({
      where: { status: 'PLANOWANA', plannedDate: { not: null } },
      include: {
        contract: {
          select: { id: true, number: true, interestType: true, interestCustomRate: true },
        },
      },
      orderBy: { plannedDate: 'asc' },
    }),
    prisma.bankTransaction.findMany({
      where: { side: 'CREDIT', matchStatus: 'UNMATCHED' },
      orderBy: { bookingDate: 'desc' },
      take: 100,
    }),
    prisma.bankTransaction.count({ where: { side: 'CREDIT', matchStatus: 'SUGGESTED' } }),
  ])

  const alerts: EscrowAlert[] = []
  let overdueCount = 0
  let overdueAmount = 0
  let accruedInterest = 0

  for (const p of openPayments) {
    if (!p.plannedDate) continue
    if (p.plannedDate < today) {
      overdueCount++
      overdueAmount += p.plannedAmount
      const periods = ratePeriodsForContract(p.contract.interestType, p.contract.interestCustomRate)
      const int = computeDelayInterest(p.plannedAmount, p.plannedDate, today, periods)
      accruedInterest += int.amount
      alerts.push({
        id: `overdue-${p.id}`,
        severity: int.daysLate > 30 ? 'critical' : 'warning',
        kind: 'OVERDUE',
        title: `Zaległa rata — umowa ${p.contract.number}`,
        detail:
          `${p.title || 'Rata'}: ${money(p.plannedAmount)} zł, termin ${fmtDate(p.plannedDate)} ` +
          `(${int.daysLate} dni po terminie). Narosłe odsetki: ~${money(int.amount)} zł.`,
        amount: p.plannedAmount,
        contractId: p.contract.id,
        contractNumber: p.contract.number,
        href: `/sales/${p.contract.id}`,
      })
    } else if (p.plannedDate <= horizon) {
      alerts.push({
        id: `upcoming-${p.id}`,
        severity: 'info',
        kind: 'UPCOMING',
        title: `Rata wymagalna wkrótce — umowa ${p.contract.number}`,
        detail: `${p.title || 'Rata'}: ${money(p.plannedAmount)} zł, termin ${fmtDate(p.plannedDate)}.`,
        amount: p.plannedAmount,
        contractId: p.contract.id,
        contractNumber: p.contract.number,
        href: `/sales/${p.contract.id}`,
      })
    }
  }

  let unmatchedAmount = 0
  for (const tx of unmatchedTx) {
    unmatchedAmount += tx.amount
    alerts.push({
      id: `unmatched-${tx.id}`,
      severity: 'warning',
      kind: 'UNMATCHED',
      title: `Niedopasowany wpływ ${money(tx.amount)} zł`,
      detail:
        `${fmtDate(tx.bookingDate)} od „${tx.counterpartyName || '—'}”` +
        `${tx.title ? ` — „${tx.title.slice(0, 60)}”` : ''}. Brak pasującej raty w harmonogramie.`,
      amount: tx.amount,
      href: `/finanse/powiernicze?tab=dopasowanie`,
    })
  }

  // Niedopłaty na dopasowanych ratach (rata OPLACONA, ale paidAmount < plannedAmount).
  const underpaid = await prisma.contractPayment.findMany({
    where: { status: 'OPLACONA' },
    include: { contract: { select: { id: true, number: true } } },
  })
  for (const p of underpaid) {
    if (p.paidAmount !== null && p.paidAmount < p.plannedAmount - 0.01) {
      const diff = p.plannedAmount - p.paidAmount
      alerts.push({
        id: `underpay-${p.id}`,
        severity: 'warning',
        kind: 'UNDERPAY',
        title: `Niedopłata ${money(diff)} zł — umowa ${p.contract.number}`,
        detail: `${p.title || 'Rata'}: zapłacono ${money(p.paidAmount)} z ${money(p.plannedAmount)} zł.`,
        amount: diff,
        contractId: p.contract.id,
        contractNumber: p.contract.number,
        href: `/sales/${p.contract.id}`,
      })
    }
  }

  if (suggestedCount > 0) {
    alerts.push({
      id: 'suggested-all',
      severity: 'info',
      kind: 'SUGGESTED',
      title: `${suggestedCount} sugerowanych dopasowań do przeglądu`,
      detail: 'Wpłaty wstępnie dopasowane, wymagają potwierdzenia przed zaksięgowaniem.',
      href: `/finanse/powiernicze?tab=dopasowanie`,
    })
  }

  // Sortowanie: critical → warning → info, potem po kwocie malejąco.
  const rank = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.amount || 0) - (a.amount || 0))

  const counts = {
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    info: alerts.filter((a) => a.severity === 'info').length,
  }

  return {
    alerts,
    counts,
    summary: {
      overdueCount,
      overdueAmount: round2(overdueAmount),
      accruedInterest: round2(accruedInterest),
      unmatchedCount: unmatchedTx.length,
      unmatchedAmount: round2(unmatchedAmount),
      suggestedCount,
      upcomingCount: alerts.filter((a) => a.kind === 'UPCOMING').length,
    },
  }
}

function startOfToday(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))
}
function money(n: number): string {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
