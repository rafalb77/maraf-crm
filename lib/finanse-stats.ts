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

export async function getTopVendors(company: Company, limit = 10): Promise<TopVendorRow[]> {
  const grouped = await prisma.purchaseInvoice.groupBy({
    by: ['vendorId'],
    where: { company, status: { not: 'ANULOWANA' } },
    _sum: { amountGross: true },
    _count: true,
    orderBy: { _sum: { amountGross: 'desc' } },
    take: limit,
  })
  if (grouped.length === 0) return []
  const ids = grouped.map((g) => g.vendorId)
  const [vendors, unpaidGrouped] = await Promise.all([
    prisma.vendor.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.purchaseInvoice.findMany({
      where: { company, vendorId: { in: ids }, status: { in: ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA', 'WPROWADZONA'] } },
      select: { vendorId: true, amountGross: true, deposit: true, buildingCosts: true, electricity: true, payments: { select: { amount: true } } },
    }),
  ])
  const nameMap = new Map(vendors.map((v) => [v.id, v.name]))
  const unpaidMap = new Map<string, number>()
  for (const inv of unpaidGrouped) {
    const remaining = Math.max(0, inv.amountGross - (inv.deposit || 0) - (inv.buildingCosts || 0) - (inv.electricity || 0) - inv.payments.reduce((s, p) => s + p.amount, 0))
    unpaidMap.set(inv.vendorId, (unpaidMap.get(inv.vendorId) || 0) + remaining)
  }
  return grouped.map((g) => ({
    id: g.vendorId,
    name: nameMap.get(g.vendorId) || g.vendorId,
    total: g._sum.amountGross || 0,
    unpaid: unpaidMap.get(g.vendorId) || 0,
    count: g._count,
  }))
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
