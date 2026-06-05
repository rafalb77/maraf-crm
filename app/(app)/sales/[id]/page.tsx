import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils'
import {
  CONTRACT_TYPE_LABELS, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS,
  UNIT_TYPE_LABELS, UNIT_STATUS_LABELS, UNIT_STATUS_COLORS,
  type ContractType, type ContractStatus, type UnitType, type UnitStatus,
} from '@/lib/types'
import { ContractStatusChanger } from '@/components/sales/ContractStatusChanger'
import { DeleteContractButton } from '@/components/sales/DeleteContractButton'
import { ContractAttachments } from '@/components/sales/ContractAttachments'
import { ContractEmailButton } from '@/components/sales/ContractEmailButton'
import { ContractPaymentsPanel } from '@/components/sales/ContractPaymentsPanel'

export default async function ContractDetailPage({ params }: { params: { id: string } }) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      contractClients: { include: { client: true }, orderBy: { position: 'asc' } },
      contractUnits: { include: { unit: true } },
      attachments: true,
      history: { orderBy: { createdAt: 'desc' } },
      payments: {
        orderBy: [{ position: 'asc' }, { plannedDate: 'asc' }],
        include: { escrowDeposit: { select: { id: true } } },
      },
    },
  })
  if (!contract) notFound()

  // Aktywne rachunki powiernicze MD — do dropdownu przy odhaczaniu wpłaty.
  const escrowAccounts = await prisma.escrowAccount.findMany({
    where: { company: 'MARAF_DEVELOPMENT', status: 'AKTYWNY' },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })

  const paymentsForPanel = contract.payments.map((p) => ({
    id: p.id,
    title: p.title,
    type: p.type,
    plannedDate: p.plannedDate ? p.plannedDate.toISOString() : null,
    plannedAmount: p.plannedAmount,
    status: p.status,
    paidDate: p.paidDate ? p.paidDate.toISOString() : null,
    paidAmount: p.paidAmount,
    toEscrow: p.toEscrow,
    note: p.note,
    escrowDepositId: p.escrowDeposit?.id || null,
  }))

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/sales" className="hover:text-blue-600">Sprzedaż</Link>
            <span>/</span>
            <span>{contract.number}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{contract.number}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${CONTRACT_STATUS_COLORS[contract.status as ContractStatus]}`}>
              {CONTRACT_STATUS_LABELS[contract.status as ContractStatus]}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {CONTRACT_TYPE_LABELS[contract.type as ContractType]} · {contract.investmentName}
          </p>
        </div>
        <div className="flex gap-2">
          {contract.type === 'REZERWACYJNA' && (
            <>
              <Link
                href={`/sales/${contract.id}/preview`}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Podgląd
              </Link>
              <a
                href={`/api/contracts/${contract.id}/generate`}
                className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Generuj .docx
              </a>
            </>
          )}
          <ContractEmailButton
            id={contract.id}
            number={contract.number}
            clientEmail={contract.client.email}
            isReservation={contract.type === 'REZERWACYJNA'}
          />
          <ContractStatusChanger contractId={contract.id} currentStatus={contract.status as ContractStatus} />
          <DeleteContractButton id={contract.id} number={contract.number} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Panel title="Dane umowy">
            <Row label="Numer umowy" value={contract.number} />
            <Row label="Typ" value={CONTRACT_TYPE_LABELS[contract.type as ContractType]} />
            <Row label="Inwestycja" value={contract.investmentName} />
            <Row label="Klient">
              <Link href={`/clients/${contract.clientId}`} className="text-blue-600 hover:text-blue-700">
                {contract.client.firstName} {contract.client.lastName}
              </Link>
            </Row>
            {contract.contractClients.map((cc) => (
              <Row key={cc.id} label={`Współrezerwujący ${cc.position}`}>
                <Link href={`/clients/${cc.clientId}`} className="text-blue-600 hover:text-blue-700">
                  {cc.client.firstName} {cc.client.lastName}
                </Link>
              </Row>
            ))}
            <Row label="Data wprowadzenia" value={formatDate(contract.introducedAt)} />
            <Row label="Planowana data podpisania" value={contract.plannedSignDate ? formatDate(contract.plannedSignDate) : '—'} />
            <Row label="Data podpisania" value={contract.signedAt ? formatDate(contract.signedAt) : '—'} />
            <Row label="Opłata rezerwacyjna" value={contract.reservationFee != null ? formatCurrency(contract.reservationFee) : '—'} />
          </Panel>

          <Panel title="Składniki umowy">
            {contract.contractUnits.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak lokali</p>
            ) : (
              <div className="space-y-2">
                {contract.contractUnits.map((cu) => (
                  <div key={cu.id} className="flex items-center gap-3 p-2 rounded-lg border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <Link href={`/units/${cu.unitId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                        {cu.unit.number}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {UNIT_TYPE_LABELS[cu.unit.type as UnitType]} · {formatCurrency(cu.unit.priceGross)}
                      </p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${UNIT_STATUS_COLORS[cu.unit.status as UnitStatus]}`}>
                      {UNIT_STATUS_LABELS[cu.unit.status as UnitStatus]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <ContractPaymentsPanel
            contractId={contract.id}
            contractType={contract.type}
            initialPayments={paymentsForPanel}
            escrowAccounts={escrowAccounts}
          />

          {contract.notes && (
            <Panel title="Notatki">
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{contract.notes}</p>
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          <Panel title="Skany i załączniki">
            <ContractAttachments contractId={contract.id} initialAttachments={contract.attachments} />
          </Panel>

          <Panel title="Historia umowy">
            {contract.history.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak zdarzeń</p>
            ) : (
              <ul className="space-y-3">
                {contract.history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <p className="font-medium text-gray-900">{h.event}</p>
                    {h.details && <p className="text-gray-600">{h.details}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(h.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-3 text-sm">{children}</div>
    </div>
  )
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 w-48 flex-shrink-0">{label}</span>
      <span className="text-gray-900 font-medium">{children || value}</span>
    </div>
  )
}
