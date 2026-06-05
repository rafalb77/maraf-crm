import { prisma } from './prisma'

// Rozwiązuje rachunek powierniczy dla wpłaty z harmonogramu.
// Zwraca { accountId } lub powód braku.
// Logika: jawnie podany accountId → użyj (po walidacji). Inaczej: jedyny aktywny
// rachunek MD → użyj automatycznie. Wiele → wymaga wyboru. Zero → brak.
export async function resolveEscrowAccount(
  explicitAccountId?: string | null
): Promise<{ accountId: string } | { error: 'NEED_CHOICE' | 'NO_ACCOUNT' | 'INVALID' }> {
  if (explicitAccountId) {
    const acc = await prisma.escrowAccount.findUnique({
      where: { id: explicitAccountId },
      select: { id: true, company: true, status: true },
    })
    if (!acc || acc.company !== 'MARAF_DEVELOPMENT') return { error: 'INVALID' }
    return { accountId: acc.id }
  }
  const active = await prisma.escrowAccount.findMany({
    where: { company: 'MARAF_DEVELOPMENT', status: 'AKTYWNY' },
    select: { id: true },
  })
  if (active.length === 0) return { error: 'NO_ACCOUNT' }
  if (active.length > 1) return { error: 'NEED_CHOICE' }
  return { accountId: active[0].id }
}

// Tworzy EscrowDeposit powiązany z ratą harmonogramu. Wyciąga buyerName z głównego
// klienta umowy, unitId z jedynego lokalu (gdy dokładnie jeden), contractNumber z umowy.
export async function createDepositForPayment(params: {
  contractPaymentId: string
  accountId: string
  date: Date
  amount: number
}): Promise<void> {
  const payment = await prisma.contractPayment.findUnique({
    where: { id: params.contractPaymentId },
    include: {
      contract: {
        select: {
          number: true,
          client: { select: { firstName: true, lastName: true } },
          contractUnits: { select: { unitId: true } },
        },
      },
    },
  })
  if (!payment) return

  const c = payment.contract
  const buyerName = c.client ? `${c.client.firstName} ${c.client.lastName}`.trim() : null
  const unitId = c.contractUnits.length === 1 ? c.contractUnits[0].unitId : null

  await prisma.escrowDeposit.create({
    data: {
      accountId: params.accountId,
      date: params.date,
      amount: params.amount,
      buyerName,
      contractNumber: c.number,
      unitId,
      contractPaymentId: params.contractPaymentId,
      source: 'SALES',
      note: payment.title ? `Auto z harmonogramu: ${payment.title}` : 'Auto z harmonogramu wpłat',
    },
  })
}
