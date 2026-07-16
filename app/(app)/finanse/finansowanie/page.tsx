import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'
import { FinansowanieView } from '@/components/finanse/finansowanie/FinansowanieView'

export default async function FinansowaniePage() {
  const company = getActiveCompany()

  // Kredyty + escrow + zwroty VAT istnieją tylko dla Maraf Development.
  // Dla Maraf pokazujemy placeholder.
  if (company !== 'MARAF_DEVELOPMENT') {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Finansowanie inwestycji</h1>
          <p className="text-gray-500 text-sm mt-1">Kredyty, rachunki powiernicze, zwroty VAT</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">🏗️</div>
          <h2 className="font-semibold text-gray-900 mb-2">Tylko dla Maraf Development</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Ten moduł jest dostępny tylko dla spółki deweloperskiej. Maraf (generalny wykonawca) nie
            prowadzi kredytów inwestycyjnych ani rachunków powierniczych.
          </p>
          <p className="text-xs text-gray-400 mt-4">
            Przełącz firmę w nagłówku (CompanySwitcher) na <strong>Maraf Development</strong>.
          </p>
        </div>
      </div>
    )
  }

  const [loansRaw, escrowsRaw, vatRefunds] = await Promise.all([
    prisma.loan.findMany({
      where: { company },
      orderBy: [{ status: 'asc' }, { signedAt: 'desc' }],
      include: {
        tranches: { orderBy: { date: 'desc' } },
        repayments: { orderBy: { date: 'desc' } },
      },
    }),
    prisma.escrowAccount.findMany({
      where: { company },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        deposits: { orderBy: { date: 'desc' }, include: { unit: { select: { number: true } } } },
        releases: { orderBy: { date: 'desc' } },
      },
    }),
    prisma.vatRefund.findMany({
      where: { company },
      orderBy: { date: 'desc' },
      include: { appliedToLoan: { select: { id: true, name: true, type: true } } },
    }),
  ])

  // Lista loanów typu VAT dla selectora w VatRefund
  const vatLoans = loansRaw.filter((l) => l.type === 'VAT').map((l) => ({ id: l.id, name: l.name }))

  // Spłaszczone obiekty (serializacja Date → string dla client)
  const loans = loansRaw.map((l) => {
    const drawn = l.tranches.reduce((s, t) => s + t.amount, 0)
    const principalRepaid = l.repayments.reduce((s, r) => s + r.principal, 0)
    const interestPaid = l.repayments.reduce((s, r) => s + r.interest, 0)
    const feesPaid = l.repayments.reduce((s, r) => s + r.fees, 0)
    return {
      id: l.id,
      name: l.name,
      bank: l.bank,
      contractNumber: l.contractNumber,
      type: l.type,
      limit: l.limit,
      interestRate: l.interestRate,
      signedAt: l.signedAt.toISOString(),
      expiresAt: l.expiresAt?.toISOString() || null,
      status: l.status,
      notes: l.notes,
      drawn,
      principalRepaid,
      interestPaid,
      feesPaid,
      outstanding: drawn - principalRepaid,
      available: l.limit - (drawn - principalRepaid),
      tranches: l.tranches.map((t) => ({ id: t.id, date: t.date.toISOString(), amount: t.amount, note: t.note })),
      repayments: l.repayments.map((r) => ({ id: r.id, date: r.date.toISOString(), principal: r.principal, interest: r.interest, fees: r.fees, note: r.note })),
    }
  })

  const escrows = escrowsRaw.map((a) => {
    const depositsTotal = a.deposits.reduce((s, d) => s + d.amount, 0)
    const releasesTotal = a.releases.reduce((s, r) => s + r.amount, 0)
    return {
      id: a.id,
      name: a.name,
      bank: a.bank,
      accountNumber: a.accountNumber,
      type: a.type,
      investmentName: a.investmentName,
      status: a.status,
      notes: a.notes,
      depositsTotal,
      releasesTotal,
      balance: depositsTotal - releasesTotal,
      deposits: a.deposits.map((d) => ({ id: d.id, date: d.date.toISOString(), amount: d.amount, buyerName: d.buyerName, contractNumber: d.contractNumber, unitNumber: d.unit?.number || null, note: d.note })),
      releases: a.releases.map((r) => ({ id: r.id, date: r.date.toISOString(), amount: r.amount, milestone: r.milestone, note: r.note })),
    }
  })

  const refunds = vatRefunds.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    amount: r.amount,
    periodLabel: r.periodLabel,
    note: r.note,
    appliedToLoan: r.appliedToLoan ? { id: r.appliedToLoan.id, name: r.appliedToLoan.name, type: r.appliedToLoan.type } : null,
  }))

  return <FinansowanieView loans={loans} escrows={escrows} refunds={refunds} vatLoans={vatLoans} />
}
