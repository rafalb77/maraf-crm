import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'
import { hasPermission } from '@/lib/permissions'
import { fmtDate, fmtMoney } from '@/lib/finanse-format'
import { ApprovalCard } from '@/components/finanse/ApprovalCard'

export default async function DoZatwierdzeniaPage() {
  const session = await getServerSession(authOptions)
  const userIsAdmin = isAdmin(session?.user?.email)
  const userPerms = ((session?.user as any)?.permissions as string[]) || []
  const canApprove = userIsAdmin || hasPermission(userPerms, 'finanse.approve')

  const invoices = await prisma.purchaseInvoice.findMany({
    where: { status: 'DO_ZATWIERDZENIA' },
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'desc' }],
    include: { vendor: { select: { name: true } } },
  })

  const totalSum = invoices.reduce((s, i) => s + i.amountGross, 0)

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Do zatwierdzenia</h1>
        <p className="text-gray-500 text-sm mt-1">
          {invoices.length} {invoices.length === 1 ? 'faktura czeka' : 'faktur czeka'} na akceptację
          {' '}— łącznie <strong className="text-gray-900">{fmtMoney(totalSum)}</strong>
        </p>
      </div>

      {!canApprove && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-900">
          ℹ️ Widzisz inbox akceptacyjny, ale nie masz uprawnienia <code className="bg-amber-100 px-1 rounded">finanse.approve</code>{' '}
          żeby zatwierdzać. Możesz tylko przeglądać. Akceptację robi Bohdan.
        </div>
      )}

      {invoices.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400">🎉 Nic do zatwierdzenia. Wszystko ogarnięte.</p>
        </div>
      )}

      <div className="space-y-3">
        {invoices.map((inv) => (
          <ApprovalCard
            key={inv.id}
            invoice={{
              id: inv.id,
              vendorName: inv.vendor.name,
              subVendor: inv.subVendor,
              number: inv.number,
              issueDate: fmtDate(inv.issueDate),
              dueDate: fmtDate(inv.dueDate),
              amountGross: inv.amountGross,
              description: inv.description,
            }}
            canApprove={canApprove}
          />
        ))}
      </div>
    </div>
  )
}
