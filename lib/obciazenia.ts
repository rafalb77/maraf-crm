// Obciazenia kontrahentow — wspolna agregacja dla /finanse/obciazenia.
//
// Zrodla pozycji:
//  - KAUCJA / KB / PRAD: pola faktur kosztowych (deposit / buildingCosts /
//    electricity) — kwoty potracen pomniejszaja PLATNOSC (brutto), wiec netto
//    liczymy ze stawki VAT faktury: netto = kwota / (1 + vatRate).
//  - KARA: reczny rejestr VendorCharge (kwota wpisywana w NETTO).
//
// Grupowanie po EFEKTYWNYM kontrahencie (etykieta podwykonawcy spod parasola
// STAFFA albo nazwa vendora) — spojnie z lista kontrahentow i warunkami.

import { prisma } from './prisma'
import type { Company } from './types'
import type { ChargeItem, VendorCharges } from './obciazenia-types'

export type { ChargeItem, VendorCharges } from './obciazenia-types'

const r2 = (n: number) => Math.round(n * 100) / 100
const netOf = (amount: number, vatRate: number) => r2(amount / (1 + (vatRate || 0)))

export async function loadObciazenia(company: Company): Promise<Map<string, VendorCharges>> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [invoices, charges] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: {
        company,
        status: { not: 'ANULOWANA' },
        OR: [{ deposit: { gt: 0 } }, { buildingCosts: { gt: 0 } }, { electricity: { gt: 0 } }],
      },
      select: {
        id: true, number: true, issueDate: true, vatRate: true, subVendor: true,
        deposit: true, depositPct: true, depositReturnDate: true, depositReturnedAt: true,
        buildingCosts: true, buildingCostsPct: true, electricity: true,
        vendor: { select: { name: true } },
      },
      orderBy: { issueDate: 'desc' },
    }),
    prisma.vendorCharge.findMany({ where: { company }, orderBy: { chargedAt: 'desc' } }),
  ])

  const map = new Map<string, VendorCharges>()
  const bucket = (label: string, umbrella: string | null): VendorCharges => {
    const k = label.trim()
    if (!map.has(k)) {
      map.set(k, { label: k, umbrella, items: [], netKaucje: 0, netKb: 0, netPrad: 0, netKary: 0, netTotal: 0, overdueReturns: 0 })
    }
    const b = map.get(k)!
    if (!b.umbrella && umbrella) b.umbrella = umbrella
    return b
  }

  for (const inv of invoices) {
    const label = (inv.subVendor || '').trim() || inv.vendor.name
    const umbrella = inv.subVendor ? inv.vendor.name : null
    const b = bucket(label, umbrella)
    const base = {
      date: inv.issueDate.toISOString(),
      number: inv.number,
      invoiceId: inv.id,
      chargeId: null,
      title: null,
      settledAt: null,
      notes: null,
    }
    if (inv.deposit && inv.deposit > 0) {
      const returned = !!inv.depositReturnedAt
      const overdue = !returned && inv.depositReturnDate && new Date(inv.depositReturnDate) < today
      const net = netOf(inv.deposit, inv.vatRate)
      b.items.push({
        ...base,
        key: `KAUCJA:${inv.id}`,
        type: 'KAUCJA',
        amount: inv.deposit,
        amountNet: net,
        pct: inv.depositPct,
        status: returned ? 'ZWROCONA' : overdue ? 'PO_TERMINIE' : 'AKTYWNA',
        returnDate: inv.depositReturnDate ? inv.depositReturnDate.toISOString() : null,
        returnedAt: inv.depositReturnedAt ? inv.depositReturnedAt.toISOString() : null,
      })
      if (!returned) b.netKaucje = r2(b.netKaucje + net)
      if (overdue) b.overdueReturns++
    }
    if (inv.buildingCosts && inv.buildingCosts > 0) {
      const net = netOf(inv.buildingCosts, inv.vatRate)
      b.items.push({
        ...base,
        key: `KB:${inv.id}`,
        type: 'KB',
        amount: inv.buildingCosts,
        amountNet: net,
        pct: inv.buildingCostsPct,
        status: null,
        returnDate: null,
        returnedAt: null,
      })
      b.netKb = r2(b.netKb + net)
    }
    if (inv.electricity && inv.electricity > 0) {
      const net = netOf(inv.electricity, inv.vatRate)
      b.items.push({
        ...base,
        key: `PRAD:${inv.id}`,
        type: 'PRAD',
        amount: inv.electricity,
        amountNet: net,
        pct: null,
        status: null,
        returnDate: null,
        returnedAt: null,
      })
      b.netPrad = r2(b.netPrad + net)
    }
  }

  for (const c of charges) {
    const b = bucket(c.vendorLabel, null)
    b.items.push({
      key: `KARA:${c.id}`,
      type: 'KARA',
      date: c.chargedAt.toISOString(),
      number: c.invoiceNumber,
      invoiceId: null,
      chargeId: c.id,
      title: c.title,
      amount: c.amountNet,
      amountNet: c.amountNet,
      pct: null,
      status: c.settledAt ? 'ROZLICZONA' : 'AKTYWNA',
      returnDate: null,
      returnedAt: null,
      settledAt: c.settledAt ? c.settledAt.toISOString() : null,
      notes: c.notes,
    })
    if (!c.settledAt) b.netKary = r2(b.netKary + c.amountNet)
  }

  for (const b of map.values()) {
    b.netTotal = r2(b.netKaucje + b.netKb + b.netPrad + b.netKary)
    b.items.sort((a, x) => x.date.localeCompare(a.date))
  }
  return map
}
