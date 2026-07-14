// Silnik alertów kosztowych modułu Budowa (Etap 3) — most z Finansów.
// Kontrakt anty-N+1: JEDNA funkcja loadBudowaCostData ładuje wszystko stałą liczbą
// zapytań; funkcje alertowe są CZYSTE (bez prisma w środku) — reuse przez /budowa/koszty,
// /budowa/wykonawcy, dashboard i Widok Prezesa bez mnożenia zapytań.
//
// Zasady (docs/budowa-rozpoczecie.md, sekcja Integracja z Finansami):
//  - FV NIE dublowana — czytamy z Finansów, tagujemy przez investmentId/stageId/taskId
//  - "nieopłacona FV" = dueDate < dziś I status ∉ {OPLACONA, ANULOWANA, ODRZUCONA} I saldo > 0
//  - budżet etapu = Σ FV netto przypisanych do etapu vs ConstructionStage.budgetNet (90%/100%)
//  - MULTI-FIRMA: sumujemy OBIE firmy (MARAF + MARAF_DEVELOPMENT); widoki ignorują cookie firmy

import { prisma } from './prisma'

const PAID_EXCLUDED = new Set(['OPLACONA', 'ANULOWANA', 'ODRZUCONA'])
const PROTOCOL_DONE = new Set(['ZATWIERDZONY', 'ZAFAKTUROWANY'])

export type CostInvoice = {
  id: string
  number: string
  company: string
  vendorId: string
  vendorName: string
  subVendor: string | null
  status: string
  issueDate: Date
  dueDate: Date | null
  amountNet: number
  amountGross: number
  deposit: number | null
  buildingCosts: number | null
  electricity: number | null
  investmentId: string | null
  constructionStageId: string | null
  constructionTaskId: string | null
  protocolId: string | null
  sumPaid: number
}

export type CostData = {
  investment: { id: string; name: string; budgetNet: number | null }
  stages: { id: string; name: string; order: number; budgetNet: number | null }[]
  invoices: CostInvoice[] // przypisane do inwestycji LUB od zmostkowanego wykonawcy
  subcontractors: { id: string; name: string; vendorId: string | null }[]
  tasks: {
    id: string
    number: string | null
    name: string
    stageId: string | null
    subContractId: string | null
    subcontractorId: string | null
    status: string
    actualEnd: Date | null
  }[]
  protocolsBySubcontract: Map<string, { periodTo: Date; status: string }[]>
}

/** Jeden przebieg zapytań — dane dla wszystkich alertów budowy. */
export async function loadBudowaCostData(investmentId: string): Promise<CostData | null> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: { id: true, name: true, budgetNet: true },
  })
  if (!investment) return null

  const [stages, subcontractors, tasks] = await Promise.all([
    prisma.constructionStage.findMany({
      where: { investmentId },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, order: true, budgetNet: true },
    }),
    prisma.subcontractor.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, vendorId: true },
    }),
    prisma.constructionTask.findMany({
      where: { investmentId, isMilestone: false },
      select: {
        id: true,
        number: true,
        name: true,
        stageId: true,
        subContractId: true,
        subcontractorId: true,
        status: true,
        actualEnd: true,
      },
    }),
  ])

  const linkedVendorIds = subcontractors.map((s) => s.vendorId).filter(Boolean) as string[]

  const rawInvoices = await prisma.purchaseInvoice.findMany({
    where: {
      OR: [
        { investmentId },
        ...(linkedVendorIds.length ? [{ vendorId: { in: linkedVendorIds } }] : []),
      ],
    },
    select: {
      id: true,
      number: true,
      company: true,
      vendorId: true,
      subVendor: true,
      status: true,
      issueDate: true,
      dueDate: true,
      amountNet: true,
      amountGross: true,
      deposit: true,
      buildingCosts: true,
      electricity: true,
      investmentId: true,
      constructionStageId: true,
      constructionTaskId: true,
      protocolId: true,
      vendor: { select: { name: true } },
      payments: { select: { amount: true } },
    },
  })

  const invoices: CostInvoice[] = rawInvoices.map((i) => ({
    id: i.id,
    number: i.number,
    company: i.company,
    vendorId: i.vendorId,
    vendorName: i.vendor.name,
    subVendor: i.subVendor,
    status: i.status,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    amountNet: i.amountNet,
    amountGross: i.amountGross,
    deposit: i.deposit,
    buildingCosts: i.buildingCosts,
    electricity: i.electricity,
    investmentId: i.investmentId,
    constructionStageId: i.constructionStageId,
    constructionTaskId: i.constructionTaskId,
    protocolId: i.protocolId,
    sumPaid: i.payments.reduce((s, p) => s + p.amount, 0),
  }))

  // Protokoły zmostkowanych umów — do checku "zakończone bez rozliczenia"
  const subContractIds = tasks.map((t) => t.subContractId).filter(Boolean) as string[]
  const protocolsBySubcontract = new Map<string, { periodTo: Date; status: string }[]>()
  if (subContractIds.length) {
    const protos = await prisma.protocol.findMany({
      where: { contractId: { in: subContractIds } },
      select: { contractId: true, periodTo: true, status: true },
    })
    for (const p of protos) {
      const arr = protocolsBySubcontract.get(p.contractId) || []
      arr.push({ periodTo: p.periodTo, status: p.status })
      protocolsBySubcontract.set(p.contractId, arr)
    }
  }

  return { investment, stages, invoices, subcontractors, tasks, protocolsBySubcontract }
}

// --- czyste kalkulacje --------------------------------------------------------

/** Kwota należna po potrąceniach (brutto − kaucja − KB − prąd). */
export function payable(i: CostInvoice): number {
  const ded = (i.deposit || 0) + (i.buildingCosts || 0) + (i.electricity || 0)
  return Math.round((i.amountGross - ded) * 100) / 100
}

/** Saldo do zapłaty (należne − wpłacone). */
export function remaining(i: CostInvoice): number {
  return Math.round((payable(i) - i.sumPaid) * 100) / 100
}

/** Faktura z realnym saldem do zapłaty (nie anulowana/odrzucona/opłacona). */
export function isUnpaid(i: CostInvoice): boolean {
  if (PAID_EXCLUDED.has(i.status)) return false
  return remaining(i) > 0.01
}

/** Nieopłacona po terminie. */
export function isOverdueUnpaid(i: CostInvoice, now = new Date()): boolean {
  return isUnpaid(i) && !!i.dueDate && i.dueDate.getTime() < now.getTime()
}

export type StageBudget = {
  stageId: string
  name: string
  budgetNet: number | null
  spentNet: number // Σ FV netto przypisanych do etapu (bez anulowanych/odrzuconych)
  pct: number | null // null gdy brak budżetu
  level: 'ok' | 'warn' | 'over' | 'none'
  invoiceCount: number
}

/** Budżety etapów vs Σ FV netto przypisanych (progi 90% ⚠️ / 100% 🔴). */
export function stageBudgets(data: CostData): StageBudget[] {
  return data.stages.map((s) => {
    // koszt etapu: FV przypisane do etapu, wykluczamy tylko anulowane/odrzucone
    // (opłacone TEŻ są kosztem — budżet mierzy wydatek, nie saldo)
    const counted = data.invoices.filter(
      (i) => i.constructionStageId === s.id && i.status !== 'ANULOWANA' && i.status !== 'ODRZUCONA',
    )
    const spentNet = Math.round(counted.reduce((sum, i) => sum + i.amountNet, 0) * 100) / 100
    const pct = s.budgetNet && s.budgetNet > 0 ? spentNet / s.budgetNet : null
    let level: StageBudget['level'] = 'none'
    if (pct !== null) level = pct >= 1 ? 'over' : pct >= 0.9 ? 'warn' : 'ok'
    return { stageId: s.id, name: s.name, budgetNet: s.budgetNet, spentNet, pct, level, invoiceCount: counted.length }
  })
}

export type ContractorContext = {
  subcontractorId: string
  name: string
  vendorId: string | null
  bridged: boolean
  invoiceCount: number
  overdueCount: number
  overdueAmount: number
}

/** Wykonawcy z kontekstem kosztowym (przez mostek vendorId). */
export function contractorContexts(data: CostData, now = new Date()): ContractorContext[] {
  return data.subcontractors.map((s) => {
    const inv = s.vendorId ? data.invoices.filter((i) => i.vendorId === s.vendorId) : []
    const overdue = inv.filter((i) => isOverdueUnpaid(i, now))
    return {
      subcontractorId: s.id,
      name: s.name,
      vendorId: s.vendorId,
      bridged: !!s.vendorId,
      invoiceCount: inv.length,
      overdueCount: overdue.length,
      overdueAmount: Math.round(overdue.reduce((sum, i) => sum + remaining(i), 0) * 100) / 100,
    }
  })
}

/** FV przypisane do inwestycji, ale bez etapu — inbox "do doprecyzowania". */
export function unassignedToStage(data: CostData): CostInvoice[] {
  return data.invoices.filter(
    (i) => i.investmentId === data.investment.id && !i.constructionStageId && i.status !== 'ANULOWANA',
  )
}

/** FV przypisane do inwestycji od dostawcy BEZ mostka wykonawcy — sygnał "zmostkuj". */
export function invoicesFromUnbridgedVendor(data: CostData): CostInvoice[] {
  const bridged = new Set(data.subcontractors.map((s) => s.vendorId).filter(Boolean))
  return data.invoices.filter(
    (i) => i.investmentId === data.investment.id && !bridged.has(i.vendorId) && i.status !== 'ANULOWANA',
  )
}

/** Zadania ZAKOŃCZONE rozliczane umową, bez FV i bez zatwierdzonego protokołu — "do sprawdzenia". */
export function tasksWithoutSettlement(data: CostData): CostData['tasks'] {
  const invByTask = new Set(data.invoices.filter((i) => i.constructionTaskId).map((i) => i.constructionTaskId!))
  return data.tasks.filter((t) => {
    if (t.status !== 'ZAKONCZONE' || !t.subContractId) return false
    if (invByTask.has(t.id)) return false // ma przypisaną FV
    const protos = data.protocolsBySubcontract.get(t.subContractId) || []
    const hasProto = protos.some(
      (p) => PROTOCOL_DONE.has(p.status) && (!t.actualEnd || p.periodTo.getTime() >= t.actualEnd.getTime()),
    )
    return !hasProto
  })
}

/** Zbiorcze liczby do kafli dashboardu / Widoku Prezesa. */
export function costSummary(data: CostData, now = new Date()) {
  const budgets = stageBudgets(data)
  const contractors = contractorContexts(data, now)
  const overdueInvoices = data.invoices.filter(
    (i) => i.investmentId === data.investment.id && isOverdueUnpaid(i, now),
  )
  return {
    stagesOverBudget: budgets.filter((b) => b.level === 'over').length,
    stagesWarnBudget: budgets.filter((b) => b.level === 'warn').length,
    overdueInvoiceCount: overdueInvoices.length,
    overdueAmount: Math.round(overdueInvoices.reduce((s, i) => s + remaining(i), 0) * 100) / 100,
    contractorsWithOverdue: contractors.filter((c) => c.overdueCount > 0).length,
    unassignedCount: unassignedToStage(data).length,
    toCheckCount: tasksWithoutSettlement(data).length,
    totalSpentNet: Math.round(
      data.invoices
        .filter((i) => i.investmentId === data.investment.id && i.status !== 'ANULOWANA' && i.status !== 'ODRZUCONA')
        .reduce((s, i) => s + i.amountNet, 0) * 100,
    ) / 100,
  }
}
