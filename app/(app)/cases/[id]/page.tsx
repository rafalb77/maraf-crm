import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { fmtDate, fmtDaysFromNow } from '@/lib/finanse-format'
import { deadlineState, DEADLINE_STATE_COLORS } from '@/lib/case-deadlines'
import {
  CASE_TYPE_LABELS,
  CASE_TYPE_COLORS,
  CASE_PRIORITY_LABELS,
  CASE_PRIORITY_COLORS,
  CASE_DIRECTION_LABELS,
  CASE_DIRECTION_ICONS,
  CASE_CHANNEL_LABELS,
  type CaseType,
  type CaseStatus,
  type CasePriority,
  type CaseDirection,
  type CaseChannel,
} from '@/lib/types'
import { CaseStatusChanger } from '@/components/cases/CaseStatusChanger'
import { DeleteCaseButton } from '@/components/cases/DeleteCaseButton'
import { CaseEntryForm } from '@/components/cases/CaseEntryForm'
import { DeleteEntryButton } from '@/components/cases/DeleteEntryButton'
import { CaseDocuments } from '@/components/cases/CaseDocuments'

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const item = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      unit: true,
      owner: { select: { id: true, name: true, email: true } },
      entries: { orderBy: { occurredAt: 'desc' }, include: { documents: true } },
      documents: { orderBy: { uploadedAt: 'desc' } },
    },
  })

  if (!item) notFound()

  const dState = deadlineState(item.deadline, item.status)

  return (
    <div className="p-8 max-w-5xl">
      {/* Nagłówek */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/cases" className="hover:text-blue-600">
              Sprawy
            </Link>
            <span>/</span>
            <span className="font-mono text-xs">{item.number}</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{item.title}</h1>
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${CASE_TYPE_COLORS[item.type as CaseType]}`}>
              {CASE_TYPE_LABELS[item.type as CaseType]}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">Utworzono: {formatDateTime(item.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <CaseStatusChanger caseId={item.id} currentStatus={item.status as CaseStatus} />
          <DeleteCaseButton id={item.id} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lewa kolumna — metadane sprawy */}
        <div className="space-y-6">
          <Panel title="Szczegóły">
            <dl className="space-y-3 text-sm">
              <Meta label="Priorytet">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${CASE_PRIORITY_COLORS[item.priority as CasePriority]}`}>
                  {CASE_PRIORITY_LABELS[item.priority as CasePriority]}
                </span>
              </Meta>
              <Meta label="Klient">
                {item.client ? (
                  <Link href={`/clients/${item.clientId}`} className="text-blue-600 hover:text-blue-700 font-medium">
                    {item.client.firstName} {item.client.lastName}
                  </Link>
                ) : (
                  <span className="text-gray-700">{item.counterparty || '—'}</span>
                )}
              </Meta>
              {item.client && item.counterparty && (
                <Meta label="Strona zewn.">{item.counterparty}</Meta>
              )}
              {item.unit && (
                <Meta label="Lokal">
                  <Link href={`/units/${item.unitId}`} className="text-blue-600 hover:text-blue-700 font-medium">
                    {item.unit.number}
                  </Link>
                </Meta>
              )}
              <Meta label="Prowadzący">{item.owner?.name || item.owner?.email || '— nieprzypisana —'}</Meta>
              <Meta label="Data wpływu">{item.receivedAt ? fmtDate(item.receivedAt) : '—'}</Meta>
              <Meta label="Termin">
                {item.deadline ? (
                  <span className={DEADLINE_STATE_COLORS[dState]}>
                    {dState === 'OVERDUE' ? '⚠ ' : ''}
                    {fmtDate(item.deadline)} ({fmtDaysFromNow(item.deadline)})
                  </span>
                ) : (
                  '—'
                )}
              </Meta>
              {item.closedAt && <Meta label="Zamknięto">{fmtDate(item.closedAt)}</Meta>}
            </dl>
            {item.description && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Opis</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.description}</p>
              </div>
            )}
          </Panel>

          <Panel title={`Archiwum skanów (${item.documents.length})`}>
            <CaseDocuments
              caseId={item.id}
              initialDocuments={item.documents.map((d) => ({
                id: d.id,
                filename: d.filename,
                url: d.url,
                size: d.size,
                mimeType: d.mimeType,
                ocrStatus: d.ocrStatus,
                uploadedAt: d.uploadedAt,
              }))}
            />
          </Panel>
        </div>

        {/* Prawa kolumna — oś korespondencji */}
        <div className="lg:col-span-2 space-y-4">
          <Panel title="Korespondencja">
            <div className="mb-5">
              <CaseEntryForm caseId={item.id} />
            </div>

            {item.entries.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak wpisów — dodaj pierwszą korespondencję powyżej.</p>
            ) : (
              <ul>
                {item.entries.map((e, idx) => {
                  const dir = e.direction as CaseDirection
                  const isLast = idx === item.entries.length - 1
                  return (
                    <li key={e.id} className="flex gap-3 group">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 bg-gray-50 border border-gray-200 rounded-full flex items-center justify-center text-sm">
                          {CASE_DIRECTION_ICONS[dir]}
                        </div>
                        {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1" />}
                      </div>
                      <div className="flex-1 pb-5 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-gray-500">
                            {CASE_DIRECTION_LABELS[dir]} · {CASE_CHANNEL_LABELS[e.channel as CaseChannel]}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{formatDateTime(e.occurredAt)}</span>
                            <DeleteEntryButton caseId={item.id} entryId={e.id} />
                          </div>
                        </div>
                        {e.subject && <p className="text-sm font-medium text-gray-900 mt-0.5">{e.subject}</p>}
                        {e.body && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{e.body}</p>}
                        {e.documents.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {e.documents.map((d) => (
                              <a
                                key={d.id}
                                href={d.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-blue-600 hover:bg-gray-100"
                                title={d.filename}
                              >
                                📎 <span className="truncate max-w-[160px]">{d.filename}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
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
      <h2 className="text-sm font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs text-gray-500 flex-shrink-0">{label}</dt>
      <dd className="text-sm text-gray-700 text-right">{children}</dd>
    </div>
  )
}
