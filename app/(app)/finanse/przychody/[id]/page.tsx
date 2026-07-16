import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  SALES_INVOICE_STATUS_LABELS,
  SALES_INVOICE_STATUS_COLORS,
  COMPANY_LABELS,
  type SalesInvoiceStatus,
  type Company,
} from '@/lib/types'
import type { KsefInvoiceData } from '@/lib/types'
import { fmtDate, fmtMoney, isOverdue } from '@/lib/finanse-format'
import { KsefInvoiceDetails } from '@/components/finanse/KsefInvoiceDetails'
import { AddSalesPaymentForm } from '@/components/finanse/AddSalesPaymentForm'
import { DeleteSalesPaymentButton } from '@/components/finanse/DeleteSalesPaymentButton'
import { SalesInvoiceActions } from '@/components/finanse/SalesInvoiceActions'
import { CreateCostButton } from '@/components/finanse/CreateCostButton'

export default async function SalesInvoiceDetailsPage({ params }: { params: { id: string } }) {
  const inv = await prisma.salesInvoice.findUnique({
    where: { id: params.id },
    include: { payments: { orderBy: { paidAt: 'desc' } }, createdBy: { select: { email: true } } },
  })
  if (!inv) notFound()

  const sumPaid = inv.payments.reduce((s, p) => s + p.amount, 0)
  const payable = Math.round((inv.amountGross - (inv.deposit || 0) - (inv.buildingCosts || 0)) * 100) / 100
  const remaining = payable - sumPaid
  const overdue = isOverdue(inv.dueDate, inv.status === 'OPLACONA' ? 'OPLACONA' : 'WYSTAWIONA')
  const ksef = (inv.ksefData as unknown as KsefInvoiceData | null) || null

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <Link href="/finanse/przychody" className="text-sm text-gray-500 hover:text-gray-700">← Faktury przychodowe</Link>
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              {inv.recipientName}
              {inv.recipientCompany && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-normal">{COMPANY_LABELS[inv.recipientCompany as Company] || inv.recipientCompany}</span>}
              {inv.isAdvance && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-normal">zaliczkowa</span>}
            </h1>
            <p className="text-sm text-gray-500 font-mono mt-1 flex items-center gap-2">
              <span>FV {inv.number} • wystawia {COMPANY_LABELS[inv.company as Company] || inv.company}</span>
              {inv.ksefNumber && (
                <span
                  className="text-[11px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-sans font-medium"
                  title={`Numer KSeF: ${inv.ksefNumber}`}
                >
                  KSeF
                </span>
              )}
            </p>
          </div>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${SALES_INVOICE_STATUS_COLORS[inv.status as SalesInvoiceStatus] || 'bg-gray-100 text-gray-700'}`}>
            {SALES_INVOICE_STATUS_LABELS[inv.status as SalesInvoiceStatus] || inv.status}
          </span>
        </div>
      </div>

      <SalesInvoiceActions invoiceId={inv.id} isAdvance={inv.isAdvance} status={inv.status} />

      {inv.recipientCompany && (
        <div className="mt-4">
          <CreateCostButton
            invoiceId={inv.id}
            recipientCompany={inv.recipientCompany}
            linkedPurchaseInvoiceId={inv.linkedPurchaseInvoiceId}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Field label="Data wystawienia" value={fmtDate(inv.issueDate)} />
        <Field label="Termin płatności" value={fmtDate(inv.dueDate)} warn={overdue ? 'PO TERMINIE' : null} />
        <Field label="Stawka VAT" value={`${(inv.vatRate * 100).toFixed(0)}%`} />
        <Field label="Netto" value={fmtMoney(inv.amountNet)} />
        <Field label="VAT" value={fmtMoney(inv.amountVat)} />
        <Field label="Brutto" value={fmtMoney(inv.amountGross)} bold />
        {inv.deposit ? <Field label="Kaucja zatrzymana" value={fmtMoney(inv.deposit)} /> : null}
        {inv.buildingCosts ? <Field label="Koszty budowy" value={fmtMoney(inv.buildingCosts)} /> : null}
        <Field label="Wpłacono" value={fmtMoney(sumPaid)} />
        <Field label="Pozostało do otrzymania" value={remaining > 0.01 ? fmtMoney(remaining) : '—'} bold={remaining > 0.01} />
      </div>

      {inv.description && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Opis</p>
          <p className="text-sm text-gray-800">{inv.description}</p>
        </div>
      )}

      {ksef && <KsefInvoiceDetails data={ksef} />}

      <div className="mt-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Wpłaty klienta</h2>
          <span className="text-sm text-gray-500">{inv.payments.length} {inv.payments.length === 1 ? 'wpis' : 'wpisów'}</span>
        </div>

        {inv.payments.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px] lg:min-w-0">
                <thead className="bg-gray-50 border-b border-gray-200 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium text-gray-700">Data</th>
                    <th className="px-4 py-2 font-medium text-gray-700 text-right">Kwota</th>
                    <th className="px-4 py-2 font-medium text-gray-700">Tytuł</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {inv.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 text-gray-700 tabular-nums">{fmtDate(p.paidAt)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(p.amount)}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{p.reference || '—'}</td>
                      <td className="px-4 py-2 text-right"><DeleteSalesPaymentButton invoiceId={inv.id} paymentId={p.id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {remaining > 0.01 && inv.status !== 'ANULOWANA' && (
          <AddSalesPaymentForm invoiceId={inv.id} remaining={remaining} />
        )}
      </div>
    </div>
  )
}

function Field({ label, value, bold, warn }: { label: string; value: string; bold?: boolean; warn?: string | null }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase font-semibold mb-1">{label}</p>
      <p className={`tabular-nums ${bold ? 'text-lg font-semibold text-gray-900' : 'text-sm text-gray-800'}`}>{value}</p>
      {warn && <p className="text-xs text-red-600 font-medium mt-1">⚠ {warn}</p>}
    </div>
  )
}
