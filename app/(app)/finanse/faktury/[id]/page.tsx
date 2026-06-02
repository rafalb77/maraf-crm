import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'
import { hasPermission } from '@/lib/permissions'
import {
  PURCHASE_INVOICE_STATUS_LABELS,
  PURCHASE_INVOICE_STATUS_COLORS,
  INVOICE_APPROVAL_ACTION_LABELS,
  COMPANY_LABELS,
  type PurchaseInvoiceStatus,
  type Company,
} from '@/lib/types'
import { fmtDate, fmtMoney, isOverdue, payableAmount } from '@/lib/finanse-format'
import { InvoiceActions } from '@/components/finanse/InvoiceActions'
import { AddPaymentForm } from '@/components/finanse/AddPaymentForm'
import { DeletePaymentButton } from '@/components/finanse/DeletePaymentButton'
import { DepositForm } from '@/components/finanse/DepositForm'

export default async function InvoiceDetailsPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)

  const inv = await prisma.purchaseInvoice.findUnique({
    where: { id: params.id },
    include: {
      vendor: true,
      payments: { orderBy: { paidAt: 'desc' } },
      approvals: { orderBy: { createdAt: 'desc' } },
      attachments: true,
      createdBy: { select: { email: true, name: true } },
    },
  })
  if (!inv) notFound()

  const userIsAdmin = isAdmin(session?.user?.email)
  const userPerms = ((session?.user as any)?.permissions as string[]) || []
  const canApprove = userIsAdmin || hasPermission(userPerms, 'finanse.approve')

  const sumPaid = inv.payments.reduce((s, p) => s + p.amount, 0)
  const payable = payableAmount(inv) // brutto - kaucja - KB - prad
  const remaining = payable - sumPaid // do zaplaty (po potraceniach)
  const overdue = isOverdue(inv.dueDate, inv.status)

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <Link href="/finanse/faktury" className="text-sm text-gray-500 hover:text-gray-700">← Wszystkie faktury</Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            {/* Gdy jest podkontrahent (Janpol/PATRIMEX pod STAFFA) — to ON jest
                glownym, czytelnym tytulem; parasol (STAFFA) maly nad nim. */}
            {inv.subVendor && (
              <p className="text-xs text-gray-400 leading-tight">{inv.vendor.name}</p>
            )}
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              {inv.subVendor || inv.vendor.name}
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-normal">
                {COMPANY_LABELS[inv.company as Company] || inv.company}
              </span>
            </h1>
            <p className="text-sm text-gray-500 font-mono mt-1">FV {inv.number}</p>
          </div>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
            PURCHASE_INVOICE_STATUS_COLORS[inv.status as PurchaseInvoiceStatus] || 'bg-gray-100 text-gray-700'
          }`}>
            {PURCHASE_INVOICE_STATUS_LABELS[inv.status as PurchaseInvoiceStatus] || inv.status}
          </span>
        </div>
      </div>

      {/* Akcje workflow */}
      <InvoiceActions
        invoiceId={inv.id}
        status={inv.status}
        canApprove={canApprove}
        isAdmin={userIsAdmin}
      />

      {/* Glowne dane faktury */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Field label="Data wystawienia" value={fmtDate(inv.issueDate)} />
        <Field
          label="Termin płatności"
          value={fmtDate(inv.dueDate)}
          warn={overdue ? 'PO TERMINIE' : null}
        />
        <Field label="Stawka VAT" value={`${(inv.vatRate * 100).toFixed(0)}%`} />
        <Field label="Kwota netto" value={fmtMoney(inv.amountNet)} />
        <Field label="VAT" value={fmtMoney(inv.amountVat)} />
        <Field label="Kwota brutto" value={fmtMoney(inv.amountGross)} bold />
        <Field label="Zapłacono" value={fmtMoney(sumPaid)} />
        <Field
          label="Do zapłaty"
          value={remaining > 0.01 ? fmtMoney(remaining) : '—'}
          bold={remaining > 0.01}
        />
        <Field label="Waluta" value={inv.currency || 'PLN'} />
      </div>

      {/* Kaucja gwarancyjna i potrącenia (edytowalne) */}
      <div className="mt-4">
        <DepositForm
          invoiceId={inv.id}
          amountGross={inv.amountGross}
          deposit={inv.deposit}
          depositPct={inv.depositPct}
          buildingCosts={inv.buildingCosts}
          buildingCostsPct={inv.buildingCostsPct}
          electricity={inv.electricity}
          depositReturnDate={inv.depositReturnDate ? inv.depositReturnDate.toISOString() : null}
          depositReturnedAt={inv.depositReturnedAt ? inv.depositReturnedAt.toISOString() : null}
        />
      </div>

      {inv.description && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Opis</p>
          <p className="text-sm text-gray-800">{inv.description}</p>
        </div>
      )}

      {inv.notes && (
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-xs text-yellow-700 uppercase font-semibold mb-1">Notatka wewnętrzna</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{inv.notes}</p>
        </div>
      )}

      {/* Platnosci */}
      <div className="mt-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Płatności</h2>
          <span className="text-sm text-gray-500">{inv.payments.length} {inv.payments.length === 1 ? 'wpis' : 'wpisów'}</span>
        </div>

        {inv.payments.length === 0 && (
          <p className="text-sm text-gray-400 mb-4">Brak płatności.</p>
        )}

        {inv.payments.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium text-gray-700">Data</th>
                  <th className="px-4 py-2 font-medium text-gray-700 text-right">Kwota</th>
                  <th className="px-4 py-2 font-medium text-gray-700">Bank</th>
                  <th className="px-4 py-2 font-medium text-gray-700">Tytuł</th>
                  <th className="px-4 py-2 font-medium text-gray-700">Notatka</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inv.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 text-gray-700 tabular-nums">{fmtDate(p.paidAt)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(p.amount)}</td>
                    <td className="px-4 py-2 text-gray-600">{p.bankAccount || '—'}</td>
                    <td className="px-4 py-2 text-gray-600 text-xs">{p.reference || '—'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{p.notes || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <DeletePaymentButton invoiceId={inv.id} paymentId={p.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {remaining > 0.01 && (inv.status === 'ZATWIERDZONA' || inv.status === 'CZESCIOWO_OPLACONA' || inv.status === 'WPROWADZONA' || inv.status === 'ZAPLANOWANA') && (
          <AddPaymentForm invoiceId={inv.id} remaining={remaining} />
        )}
      </div>

      {/* Audit log akceptacji */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Historia akceptacji</h2>
        {inv.approvals.length === 0 && (
          <p className="text-sm text-gray-400">Brak wpisów w historii akceptacji.</p>
        )}
        {inv.approvals.length > 0 && (
          <ol className="space-y-2">
            {inv.approvals.map((a) => (
              <li key={a.id} className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{INVOICE_APPROVAL_ACTION_LABELS[a.action] || a.action}</span>
                    {a.userEmail && <span className="text-gray-500 ml-2">— {a.userEmail}</span>}
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums">{fmtDate(a.createdAt)}</span>
                </div>
                {a.comment && <p className="text-gray-700 mt-1">{a.comment}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Audit pochodzenia */}
      {(inv.importSheet || inv.createdBy) && (
        <div className="mt-8 text-xs text-gray-400 pt-4 border-t border-gray-100">
          {inv.importSheet && (
            <p>Zaimportowana z xlsx: zakładka <strong>{inv.importSheet}</strong>, wiersz <strong>{inv.importRow}</strong>.</p>
          )}
          {inv.createdBy && (
            <p>Utworzona przez {inv.createdBy.email} dnia {fmtDate(inv.createdAt)}.</p>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, bold, warn }: { label: string; value: string; bold?: boolean; warn?: string | null }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase font-semibold mb-1">{label}</p>
      <p className={`tabular-nums ${bold ? 'text-lg font-semibold text-gray-900' : 'text-sm text-gray-800'}`}>
        {value}
      </p>
      {warn && <p className="text-xs text-red-600 font-medium mt-1">⚠ {warn}</p>}
    </div>
  )
}
