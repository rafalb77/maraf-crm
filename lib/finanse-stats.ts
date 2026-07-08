// Agregacje dla strony /finanse/statystyki. Wszystko per active company.

import { prisma } from './prisma'
import type { Company } from './types'

const dayMs = 86400000

// =========================================================================
// 1. PULSE KPI — przychod/koszt MTD + delta % vs poprzedni mc + sparkline 30d
// =========================================================================

export type SparkPoint = { d: string; v: number } // d = 'YYYY-MM-DD'

export type PulseMetric = {
  current: number  // MTD
  previous: number  // analogiczny okres poprzedniego mc (1..dzis)
  deltaPct: number | null  // % zmiana vs previous (null gdy poprzedni=0)
  sparkline: SparkPoint[]  // 30 dni wstecz, suma per dzien
}

export type PulseData = {
  revenue: PulseMetric        // przychod (SalesInvoicePayment)
  costs: PulseMetric          // koszty (PurchaseInvoicePayment)
  cashflow: PulseMetric       // revenue - costs (net per day)
  liquidity: { ratio: number; label: string; color: 'green' | 'amber' | 'red' }  // saldo proste
}

export async function getPulseData(company: Company): Promise<PulseData> {
  const now = new Date()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const dayOfMonth = today.getDate()
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const prevMonthSameDay = new Date(today.getFullYear(), today.getMonth() - 1, dayOfMonth)
  const sparkStart = new Date(today.getTime() - 30 * dayMs)

  const [salesMTD, salesPrev, costsMTD, costsPrev, salesSpark, costsSpark, openReceivables, openPayables] = await Promise.all([
    prisma.salesInvoicePayment.aggregate({
      where: { paidAt: { gte: monthStart, lte: now }, invoice: { company } },
      _sum: { amount: true },
    }),
    prisma.salesInvoicePayment.aggregate({
      where: { paidAt: { gte: prevMonthStart, lte: prevMonthSameDay }, invoice: { company } },
      _sum: { amount: true },
    }),
    prisma.purchaseInvoicePayment.aggregate({
      where: { paidAt: { gte: monthStart, lte: now }, invoice: { company } },
      _sum: { amount: true },
    }),
    prisma.purchaseInvoicePayment.aggregate({
      where: { paidAt: { gte: prevMonthStart, lte: prevMonthSameDay }, invoice: { company } },
      _sum: { amount: true },
    }),
    prisma.salesInvoicePayment.findMany({
      where: { paidAt: { gte: sparkStart }, invoice: { company } },
      select: { paidAt: true, amount: true },
    }),
    prisma.purchaseInvoicePayment.findMany({
      where: { paidAt: { gte: sparkStart }, invoice: { company } },
      select: { paidAt: true, amount: true },
    }),
    prisma.salesInvoice.aggregate({
      where: { company, status: { notIn: ['OPLACONA', 'ANULOWANA'] } },
      _sum: { amountGross: true },
    }),
    prisma.purchaseInvoice.aggregate({
      where: { company, status: { in: ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA', 'WPROWADZONA'] } },
      _sum: { amountGross: true },
    }),
  ])

  const revenueCurrent = salesMTD._sum.amount || 0
  const revenuePrev = salesPrev._sum.amount || 0
  const costsCurrent = costsMTD._sum.amount || 0
  const costsPrev_ = costsPrev._sum.amount || 0

  // Sparkline 30 dni — agreguj per dzien
  const sparkRevenue = aggregatePerDay(salesSpark.map((p) => ({ date: p.paidAt, value: p.amount })), sparkStart, today)
  const sparkCosts = aggregatePerDay(costsSpark.map((p) => ({ date: p.paidAt, value: p.amount })), sparkStart, today)
  const sparkCashflow: SparkPoint[] = sparkRevenue.map((r, i) => ({
    d: r.d,
    v: r.v - (sparkCosts[i]?.v || 0),
  }))

  // Plynnosc: stosunek niezaplaconych naleznosci do zobowiazan
  const receivables = openReceivables._sum.amountGross || 0
  const payables = openPayables._sum.amountGross || 0
  const ratio = payables > 0 ? receivables / payables : (receivables > 0 ? 999 : 1)
  let liquidityColor: 'green' | 'amber' | 'red' = 'green'
  let liquidityLabel = 'bezpieczne'
  if (ratio < 0.8) { liquidityColor = 'red'; liquidityLabel = 'napięte' }
  else if (ratio < 1.2) { liquidityColor = 'amber'; liquidityLabel = 'umiarkowane' }

  return {
    revenue: {
      current: revenueCurrent,
      previous: revenuePrev,
      deltaPct: pctDelta(revenueCurrent, revenuePrev),
      sparkline: sparkRevenue,
    },
    costs: {
      current: costsCurrent,
      previous: costsPrev_,
      deltaPct: pctDelta(costsCurrent, costsPrev_),
      sparkline: sparkCosts,
    },
    cashflow: {
      current: revenueCurrent - costsCurrent,
      previous: revenuePrev - costsPrev_,
      deltaPct: pctDelta(revenueCurrent - costsCurrent, revenuePrev - costsPrev_),
      sparkline: sparkCashflow,
    },
    liquidity: { ratio, label: liquidityLabel, color: liquidityColor },
  }
}

function pctDelta(curr: number, prev: number): number | null {
  if (Math.abs(prev) < 0.01) return null
  return Math.round(((curr - prev) / Math.abs(prev)) * 100)
}

function aggregatePerDay(rows: { date: Date; value: number }[], from: Date, to: Date): SparkPoint[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const d = r.date.toISOString().slice(0, 10)
    map.set(d, (map.get(d) || 0) + r.value)
  }
  const out: SparkPoint[] = []
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  while (cur <= end) {
    const k = cur.toISOString().slice(0, 10)
    out.push({ d: k, v: map.get(k) || 0 })
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

// =========================================================================
// 2. CASHFLOW 12 MIESIECY — przychody/koszty per miesiac + zysk netto
// =========================================================================

export type MonthRow = { m: string; revenue: number; costs: number; net: number }

export async function getCashflow12m(company: Company): Promise<MonthRow[]> {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth() - 11, 1)

  const [sales, purchases] = await Promise.all([
    prisma.salesInvoicePayment.findMany({
      where: { paidAt: { gte: start }, invoice: { company } },
      select: { paidAt: true, amount: true },
    }),
    prisma.purchaseInvoicePayment.findMany({
      where: { paidAt: { gte: start }, invoice: { company } },
      select: { paidAt: true, amount: true },
    }),
  ])

  const map = new Map<string, { revenue: number; costs: number }>()
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    map.set(k, { revenue: 0, costs: 0 })
  }
  for (const p of sales) {
    const k = `${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, '0')}`
    const cur = map.get(k); if (cur) cur.revenue += p.amount
  }
  for (const p of purchases) {
    const k = `${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, '0')}`
    const cur = map.get(k); if (cur) cur.costs += p.amount
  }
  return Array.from(map.entries()).map(([m, v]) => ({ m, revenue: v.revenue, costs: v.costs, net: v.revenue - v.costs }))
}

// =========================================================================
// 3. AGING BUCKETS — naleznosci i zobowiazania wg wieku po terminie
// =========================================================================

export type AgingBuckets = {
  receivables: { b0_30: number; b31_60: number; b61_90: number; b90plus: number; current: number; total: number }
  payables: { b0_30: number; b31_60: number; b61_90: number; b90plus: number; current: number; total: number }
}

export async function getAgingBuckets(company: Company): Promise<AgingBuckets> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [salesOpen, purchasesOpen] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { company, status: { notIn: ['OPLACONA', 'ANULOWANA'] } },
      select: { amountGross: true, deposit: true, buildingCosts: true, dueDate: true, payments: { select: { amount: true } } },
    }),
    prisma.purchaseInvoice.findMany({
      where: { company, status: { in: ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA', 'WPROWADZONA'] } },
      select: { amountGross: true, deposit: true, buildingCosts: true, electricity: true, dueDate: true, payments: { select: { amount: true } } },
    }),
  ])

  const bucketize = (invs: any[], deductions: (i: any) => number) => {
    const out = { b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0, current: 0, total: 0 }
    for (const i of invs) {
      const paid = i.payments.reduce((s: number, p: any) => s + p.amount, 0)
      const remaining = Math.max(0, i.amountGross - deductions(i) - paid)
      if (remaining < 0.01) continue
      out.total += remaining
      const due = i.dueDate ? new Date(i.dueDate) : null
      if (!due || due >= today) { out.current += remaining; continue }
      const daysOverdue = Math.floor((today.getTime() - due.getTime()) / dayMs)
      if (daysOverdue <= 30) out.b0_30 += remaining
      else if (daysOverdue <= 60) out.b31_60 += remaining
      else if (daysOverdue <= 90) out.b61_90 += remaining
      else out.b90plus += remaining
    }
    return out
  }

  return {
    receivables: bucketize(salesOpen, (i) => (i.deposit || 0) + (i.buildingCosts || 0)),
    payables: bucketize(purchasesOpen, (i) => (i.deposit || 0) + (i.buildingCosts || 0) + (i.electricity || 0)),
  }
}

// =========================================================================
// 4. TOP 10 KONTRAHENTOW (po niezaplaconych zobowiazaniach kosztowych)
// =========================================================================

export type TopVendorRow = { id: string; name: string; total: number; unpaid: number; count: number }

const UNPAID_STATUSES = new Set(['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA', 'WPROWADZONA', 'DO_ZATWIERDZENIA'])

// Grupowanie po FAKTYCZNYM wykonawcy: subVendor || vendor.name.
// Import z Excela trzymal parasole (STAFFA) jako vendora, a wykonawce
// w subVendor — parasol to grupa kosztowa, nie kontrahent.
export async function getTopVendors(company: Company, limit = 10): Promise<TopVendorRow[]> {
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { company, status: { not: 'ANULOWANA' } },
    select: {
      amountGross: true, deposit: true, buildingCosts: true, electricity: true,
      subVendor: true, status: true,
      vendor: { select: { id: true, name: true } },
      payments: { select: { amount: true } },
    },
  })
  const groups = new Map<string, TopVendorRow>()
  for (const inv of invoices) {
    const name = inv.subVendor?.trim() || inv.vendor.name
    const g = groups.get(name) || { id: name, name, total: 0, unpaid: 0, count: 0 }
    g.total += inv.amountGross
    g.count += 1
    if (UNPAID_STATUSES.has(inv.status)) {
      g.unpaid += Math.max(0, inv.amountGross - (inv.deposit || 0) - (inv.buildingCosts || 0) - (inv.electricity || 0) - inv.payments.reduce((s, p) => s + p.amount, 0))
    }
    groups.set(name, g)
  }
  return [...groups.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}

// =========================================================================
// 4b. TERMINOWOSC PLATNOSCI — kto placony przed terminem, kto po (i ile)
// =========================================================================

export type PunctualityRow = {
  name: string        // faktyczny wykonawca (subVendor || vendor.name)
  paidTotal: number   // suma wplat (tylko FV z terminem platnosci)
  earlyAmount: number // zaplacone w terminie lub przed (paidAt <= dueDate)
  lateAmount: number  // zaplacone po terminie
  avgDays: number     // srednia wazona kwota: dodatnia = dni PO terminie, ujemna = przed
  maxLateDays: number // najwieksze opoznienie pojedynczej wplaty (dni)
}

export type PunctualityData = {
  rows: PunctualityRow[]
  totalEarly: number  // globalnie: kwoty zaplacone w terminie/przed (okno 12 mc)
  totalLate: number   // globalnie: kwoty zaplacone po terminie
}

// Okno: wplaty z ostatnich 12 miesiecy (swiezy obraz dyscypliny platniczej).
export async function getPaymentPunctuality(company: Company, limit = 10): Promise<PunctualityData> {
  const since = new Date(); since.setMonth(since.getMonth() - 12); since.setHours(0, 0, 0, 0)
  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      company,
      status: { not: 'ANULOWANA' },
      dueDate: { not: null },
      payments: { some: { paidAt: { gte: since } } },
    },
    select: {
      dueDate: true, subVendor: true,
      vendor: { select: { name: true } },
      payments: { select: { amount: true, paidAt: true } },
    },
  })
  const groups = new Map<string, PunctualityRow & { weightedDays: number }>()
  let totalEarly = 0
  let totalLate = 0
  for (const inv of invoices) {
    const due = new Date(inv.dueDate!); due.setHours(0, 0, 0, 0)
    const name = inv.subVendor?.trim() || inv.vendor.name
    const g = groups.get(name) || { name, paidTotal: 0, earlyAmount: 0, lateAmount: 0, avgDays: 0, maxLateDays: 0, weightedDays: 0 }
    for (const p of inv.payments) {
      const paid = new Date(p.paidAt); paid.setHours(0, 0, 0, 0)
      if (paid < since) continue
      const days = Math.round((paid.getTime() - due.getTime()) / dayMs)
      g.paidTotal += p.amount
      if (days <= 0) { g.earlyAmount += p.amount; totalEarly += p.amount }
      else { g.lateAmount += p.amount; totalLate += p.amount; g.maxLateDays = Math.max(g.maxLateDays, days) }
      g.weightedDays += days * p.amount
    }
    if (g.paidTotal > 0) groups.set(name, g)
  }
  const rows = [...groups.values()]
    .map(({ weightedDays, ...g }) => ({ ...g, avgDays: Math.round((weightedDays / g.paidTotal) * 10) / 10 }))
    .sort((a, b) => b.paidTotal - a.paidTotal)
    .slice(0, limit)
  return { rows, totalEarly, totalLate }
}

// =========================================================================
// 4c. NAJWIEKSZE WYDATKI WG WYKONAWCY — TOP 10, okresy YTD / 12mc / calosc
// =========================================================================

export type TopSpendRow = {
  name: string
  total: number     // suma brutto FV w okresie
  paid: number      // suma wplat do tych FV
  remaining: number // pozostalo (naleznosc po potraceniach - wplaty, statusy niezaplacone)
  count: number
  pct: number       // udzial w wydatkach okresu (0-100)
}
export type TopSpendData = { ytd: TopSpendRow[]; m12: TopSpendRow[]; all: TopSpendRow[] }

export async function getTopSpendByContractor(company: Company, limit = 10): Promise<TopSpendData> {
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { company, status: { notIn: ['ANULOWANA', 'ODRZUCONA'] } },
    select: {
      issueDate: true, amountGross: true, deposit: true, buildingCosts: true, electricity: true,
      status: true, subVendor: true,
      vendor: { select: { name: true } },
      payments: { select: { amount: true } },
    },
  })
  const now = new Date()
  const ytdStart = new Date(now.getFullYear(), 0, 1)
  const m12Start = new Date(now); m12Start.setMonth(m12Start.getMonth() - 12)

  function build(from: Date | null): TopSpendRow[] {
    const groups = new Map<string, TopSpendRow>()
    let periodTotal = 0
    for (const inv of invoices) {
      if (from && inv.issueDate < from) continue
      const name = inv.subVendor?.trim() || inv.vendor.name
      const g = groups.get(name) || { name, total: 0, paid: 0, remaining: 0, count: 0, pct: 0 }
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
      g.total += inv.amountGross
      g.paid += paid
      g.count += 1
      periodTotal += inv.amountGross
      if (UNPAID_STATUSES.has(inv.status)) {
        g.remaining += Math.max(0, inv.amountGross - (inv.deposit || 0) - (inv.buildingCosts || 0) - (inv.electricity || 0) - paid)
      }
      groups.set(name, g)
    }
    return [...groups.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, limit)
      .map((g) => ({ ...g, pct: periodTotal > 0 ? Math.round((g.total / periodTotal) * 1000) / 10 : 0 }))
  }

  return { ytd: build(ytdStart), m12: build(m12Start), all: build(null) }
}

// =========================================================================
// 4d. OS NADCHODZACYCH PLATNOSCI — zalegle + 6 tygodni + pozniej
// =========================================================================

export type TimelineBucket = {
  key: string          // 'overdue' | 'w0'..'w5' | 'later'
  label: string        // np. '8–14.07'
  sum: number
  count: number
}

export async function getUpcomingPayments(company: Company): Promise<TimelineBucket[]> {
  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      company,
      status: { in: [...UNPAID_STATUSES] },
      dueDate: { not: null },
    },
    select: {
      dueDate: true, amountGross: true, deposit: true, buildingCosts: true, electricity: true,
      payments: { select: { amount: true } },
    },
  })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const fmtD = (d: Date) => `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
  const buckets: TimelineBucket[] = [{ key: 'overdue', label: 'Zaległe', sum: 0, count: 0 }]
  for (let k = 0; k < 6; k++) {
    const from = new Date(today.getTime() + k * 7 * dayMs)
    const to = new Date(today.getTime() + ((k + 1) * 7 - 1) * dayMs)
    buckets.push({ key: `w${k}`, label: `${fmtD(from)}–${fmtD(to)}`, sum: 0, count: 0 })
  }
  buckets.push({ key: 'later', label: 'Później', sum: 0, count: 0 })

  for (const inv of invoices) {
    const remaining = Math.max(0, inv.amountGross - (inv.deposit || 0) - (inv.buildingCosts || 0) - (inv.electricity || 0) - inv.payments.reduce((s, p) => s + p.amount, 0))
    if (remaining < 0.01) continue
    const due = new Date(inv.dueDate!); due.setHours(0, 0, 0, 0)
    const diffDays = Math.floor((due.getTime() - today.getTime()) / dayMs)
    const bucket = diffDays < 0 ? buckets[0] : diffDays < 42 ? buckets[1 + Math.floor(diffDays / 7)] : buckets[buckets.length - 1]
    bucket.sum += remaining
    bucket.count += 1
  }
  return buckets
}

// =========================================================================
// 5. KONCENTRACJA RYZYKA — top 3 vs cala suma
// =========================================================================

export type RiskData = {
  top3Pct: number
  top3Names: string[]
  warningLevel: 'safe' | 'moderate' | 'high'
  segments: { name: string; value: number }[] // do donut chart
}

export async function getRiskConcentration(company: Company): Promise<RiskData> {
  const top = await getTopVendors(company, 100) // bierzemy wszystkie zeby policzyc procenty
  const total = top.reduce((s, t) => s + t.total, 0)
  if (total === 0) {
    return { top3Pct: 0, top3Names: [], warningLevel: 'safe', segments: [] }
  }
  const top3 = top.slice(0, 3)
  const top3Sum = top3.reduce((s, t) => s + t.total, 0)
  const pct = Math.round((top3Sum / total) * 100)
  const warningLevel: 'safe' | 'moderate' | 'high' = pct > 70 ? 'high' : pct > 50 ? 'moderate' : 'safe'

  const top6 = top.slice(0, 6)
  const restValue = top.slice(6).reduce((s, t) => s + t.total, 0)
  const segments = top6.map((t) => ({ name: t.name, value: t.total }))
  if (restValue > 0) segments.push({ name: 'Pozostali', value: restValue })

  return { top3Pct: pct, top3Names: top3.map((t) => t.name), warningLevel, segments }
}

// =========================================================================
// 6. AKTYWNOSC HEATMAPA — wartosc platnosci per dzien, 90 dni wstecz
// =========================================================================

export type HeatmapDay = { date: string; value: number }

export async function getActivityHeatmap(company: Company): Promise<HeatmapDay[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today.getTime() - 90 * dayMs)
  const [costs] = await Promise.all([
    prisma.purchaseInvoicePayment.findMany({
      where: { paidAt: { gte: start }, invoice: { company } },
      select: { paidAt: true, amount: true },
    }),
  ])
  const map = new Map<string, number>()
  for (const p of costs) {
    const k = p.paidAt.toISOString().slice(0, 10)
    map.set(k, (map.get(k) || 0) + p.amount)
  }
  const out: HeatmapDay[] = []
  const cur = new Date(start)
  while (cur <= today) {
    const k = cur.toISOString().slice(0, 10)
    out.push({ date: k, value: map.get(k) || 0 })
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

// =========================================================================
// 7. FINANSOWANIE INWESTYCJI — kredyty / escrow / zwroty VAT
// Tylko dla MARAF_DEVELOPMENT. Dla MARAF zwraca puste/null.
// =========================================================================

export type LoansSummary = {
  byType: Record<'INWESTYCYJNY' | 'VAT' | 'OBROTOWY' | 'INNE', {
    count: number
    limit: number
    drawn: number
    outstanding: number
    available: number
  }>
  totalOutstanding: number
  totalLimit: number
}

export async function getLoansSummary(company: Company): Promise<LoansSummary> {
  const empty: LoansSummary = {
    byType: {
      INWESTYCYJNY: { count: 0, limit: 0, drawn: 0, outstanding: 0, available: 0 },
      VAT: { count: 0, limit: 0, drawn: 0, outstanding: 0, available: 0 },
      OBROTOWY: { count: 0, limit: 0, drawn: 0, outstanding: 0, available: 0 },
      INNE: { count: 0, limit: 0, drawn: 0, outstanding: 0, available: 0 },
    },
    totalOutstanding: 0,
    totalLimit: 0,
  }
  if (company !== 'MARAF_DEVELOPMENT') return empty

  const loans = await prisma.loan.findMany({
    where: { company, status: 'AKTYWNY' },
    include: {
      tranches: { select: { amount: true } },
      repayments: { select: { principal: true } },
    },
  })

  for (const l of loans) {
    const type = (['INWESTYCYJNY', 'VAT', 'OBROTOWY', 'INNE'].includes(l.type) ? l.type : 'INNE') as keyof LoansSummary['byType']
    const drawn = l.tranches.reduce((s, t) => s + t.amount, 0)
    const principalRepaid = l.repayments.reduce((s, r) => s + r.principal, 0)
    const outstanding = drawn - principalRepaid
    const available = l.limit - outstanding
    empty.byType[type].count += 1
    empty.byType[type].limit += l.limit
    empty.byType[type].drawn += drawn
    empty.byType[type].outstanding += outstanding
    empty.byType[type].available += available
    empty.totalOutstanding += outstanding
    empty.totalLimit += l.limit
  }
  return empty
}

export type EscrowSummary = {
  accountsCount: number
  inEscrow: number       // siedzi na rachunkach (depositsTotal - releasesTotal)
  releasedYTD: number    // uwolnione od początku roku
  releasedAll: number    // uwolnione łącznie
}

export async function getEscrowSummary(company: Company): Promise<EscrowSummary> {
  if (company !== 'MARAF_DEVELOPMENT') {
    return { accountsCount: 0, inEscrow: 0, releasedYTD: 0, releasedAll: 0 }
  }
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const accounts = await prisma.escrowAccount.findMany({
    where: { company },
    include: {
      deposits: { select: { amount: true } },
      releases: { select: { amount: true, date: true } },
    },
  })
  let inEscrow = 0
  let releasedAll = 0
  let releasedYTD = 0
  for (const a of accounts) {
    const dep = a.deposits.reduce((s, d) => s + d.amount, 0)
    const rel = a.releases.reduce((s, r) => s + r.amount, 0)
    inEscrow += dep - rel
    releasedAll += rel
    releasedYTD += a.releases.filter((r) => r.date >= yearStart).reduce((s, r) => s + r.amount, 0)
  }
  return { accountsCount: accounts.length, inEscrow, releasedYTD, releasedAll }
}

export type VatRefundsSummary = {
  count: number
  totalYTD: number
  totalAll: number
  appliedToLoanYTD: number   // zwroty przeznaczone na spłatę kredytu VAT
}

export async function getVatRefundsSummary(company: Company): Promise<VatRefundsSummary> {
  if (company !== 'MARAF_DEVELOPMENT') return { count: 0, totalYTD: 0, totalAll: 0, appliedToLoanYTD: 0 }
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const refunds = await prisma.vatRefund.findMany({
    where: { company },
    select: { amount: true, date: true, appliedToLoanId: true },
  })
  let totalYTD = 0
  let appliedToLoanYTD = 0
  let totalAll = 0
  for (const r of refunds) {
    totalAll += r.amount
    if (r.date >= yearStart) {
      totalYTD += r.amount
      if (r.appliedToLoanId) appliedToLoanYTD += r.amount
    }
  }
  return { count: refunds.length, totalYTD, totalAll, appliedToLoanYTD }
}

// =========================================================================
// 8. CASHFLOW GOTOWKOWY 12 mc — operacyjny + kredyty + escrow + zwroty VAT
// =========================================================================

export type CashRow = {
  m: string
  // wpływy
  salesPaid: number          // wpływy z faktur sprzedażowych
  escrowReleased: number     // uwolnienia z rachunków powierniczych
  vatRefunded: number        // zwroty VAT z US
  loanDrawn: number          // transze kredytów (info)
  // wypływy
  costsPaid: number          // zapłacone FV kosztowe
  loanPrincipal: number      // spłaty kapitału kredytów
  loanInterest: number       // spłaty odsetek (NIE są w FV kosztowych)
  loanFees: number           // prowizje
  // wskaźniki
  cashNet: number            // saldo netto = wpływy - wypływy (loanDrawn osobno bo to nie przychód)
}

export async function getCashflowGotowkowy12m(company: Company): Promise<CashRow[]> {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth() - 11, 1)

  const isMD = company === 'MARAF_DEVELOPMENT'

  const [sales, purchases, releases, refunds, tranches, repayments] = await Promise.all([
    prisma.salesInvoicePayment.findMany({
      where: { paidAt: { gte: start }, invoice: { company } },
      select: { paidAt: true, amount: true },
    }),
    prisma.purchaseInvoicePayment.findMany({
      where: { paidAt: { gte: start }, invoice: { company } },
      select: { paidAt: true, amount: true },
    }),
    isMD ? prisma.escrowRelease.findMany({
      where: { date: { gte: start }, account: { company } },
      select: { date: true, amount: true },
    }) : Promise.resolve([] as { date: Date; amount: number }[]),
    isMD ? prisma.vatRefund.findMany({
      where: { date: { gte: start }, company },
      select: { date: true, amount: true },
    }) : Promise.resolve([] as { date: Date; amount: number }[]),
    isMD ? prisma.loanTranche.findMany({
      where: { date: { gte: start }, loan: { company } },
      select: { date: true, amount: true },
    }) : Promise.resolve([] as { date: Date; amount: number }[]),
    isMD ? prisma.loanRepayment.findMany({
      where: { date: { gte: start }, loan: { company } },
      select: { date: true, principal: true, interest: true, fees: true },
    }) : Promise.resolve([] as { date: Date; principal: number; interest: number; fees: number }[]),
  ])

  // Zainicjalizuj 12 miesięcy
  const map = new Map<string, CashRow>()
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    map.set(k, {
      m: k,
      salesPaid: 0, escrowReleased: 0, vatRefunded: 0, loanDrawn: 0,
      costsPaid: 0, loanPrincipal: 0, loanInterest: 0, loanFees: 0,
      cashNet: 0,
    })
  }

  const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

  for (const p of sales) { const r = map.get(keyOf(p.paidAt)); if (r) r.salesPaid += p.amount }
  for (const p of purchases) { const r = map.get(keyOf(p.paidAt)); if (r) r.costsPaid += p.amount }
  for (const p of releases) { const r = map.get(keyOf(p.date)); if (r) r.escrowReleased += p.amount }
  for (const p of refunds) { const r = map.get(keyOf(p.date)); if (r) r.vatRefunded += p.amount }
  for (const p of tranches) { const r = map.get(keyOf(p.date)); if (r) r.loanDrawn += p.amount }
  for (const p of repayments) {
    const r = map.get(keyOf(p.date))
    if (r) { r.loanPrincipal += p.principal; r.loanInterest += p.interest; r.loanFees += p.fees }
  }

  // cashNet — saldo NETTO (bez transz, bo to zobowiązanie a nie zysk)
  for (const r of map.values()) {
    r.cashNet = (r.salesPaid + r.escrowReleased + r.vatRefunded)
              - (r.costsPaid + r.loanPrincipal + r.loanInterest + r.loanFees)
  }

  return Array.from(map.values())
}

// =========================================================================
// 9. DSCR (Debt Service Coverage Ratio) — zysk operacyjny + escrow + zwroty VAT
//    podzielone przez raty kapitał+odsetki za ostatnie 12 mc.
// =========================================================================

export type DscrData = {
  ratio: number | null     // null gdy brak rat (dzielenie przez 0)
  label: 'safe' | 'warn' | 'risk' | 'na'
  numerator: number        // zysk operacyjny + escrow released + vat refunds
  denominator: number      // raty kapitałowe + odsetki + prowizje
}

export async function getDscr(company: Company): Promise<DscrData> {
  if (company !== 'MARAF_DEVELOPMENT') {
    return { ratio: null, label: 'na', numerator: 0, denominator: 0 }
  }
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth() - 11, 1)

  const [salesAgg, costsAgg, releasesAgg, refundsAgg, repaymentsAgg] = await Promise.all([
    prisma.salesInvoicePayment.aggregate({ where: { paidAt: { gte: start }, invoice: { company } }, _sum: { amount: true } }),
    prisma.purchaseInvoicePayment.aggregate({ where: { paidAt: { gte: start }, invoice: { company } }, _sum: { amount: true } }),
    prisma.escrowRelease.aggregate({ where: { date: { gte: start }, account: { company } }, _sum: { amount: true } }),
    prisma.vatRefund.aggregate({ where: { date: { gte: start }, company }, _sum: { amount: true } }),
    prisma.loanRepayment.aggregate({ where: { date: { gte: start }, loan: { company } }, _sum: { principal: true, interest: true, fees: true } }),
  ])

  const operacyjnyNet = (salesAgg._sum.amount || 0) - (costsAgg._sum.amount || 0)
  const numerator = operacyjnyNet + (releasesAgg._sum.amount || 0) + (refundsAgg._sum.amount || 0)
  const denominator = (repaymentsAgg._sum.principal || 0) + (repaymentsAgg._sum.interest || 0) + (repaymentsAgg._sum.fees || 0)

  if (denominator < 0.01) return { ratio: null, label: 'na', numerator, denominator }
  const ratio = numerator / denominator
  let label: DscrData['label'] = 'safe'
  if (ratio < 1) label = 'risk'
  else if (ratio < 1.25) label = 'warn'
  return { ratio, label, numerator, denominator }
}
