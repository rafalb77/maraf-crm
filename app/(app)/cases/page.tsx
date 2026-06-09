import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { fmtDate } from '@/lib/finanse-format'
import { deadlineState, DEADLINE_STATE_COLORS } from '@/lib/case-deadlines'
import {
  CASE_TYPE_LABELS,
  CASE_TYPE_COLORS,
  CASE_STATUS_LABELS,
  CASE_STATUS_COLORS,
  CASE_PRIORITY_LABELS,
  CASE_PRIORITY_COLORS,
  CASE_CLOSED_STATUSES,
  type CaseType,
  type CaseStatus,
  type CasePriority,
} from '@/lib/types'

export default async function CasesPage({
  searchParams,
}: {
  searchParams: { q?: string; type?: string; status?: string }
}) {
  const q = (searchParams.q || '').trim()
  const type = searchParams.type || ''
  const status = searchParams.status || ''

  const where: any = {
    AND: [
      type ? { type } : {},
      status ? { status } : {},
      q
        ? {
            OR: [
              { number: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { counterparty: { contains: q, mode: 'insensitive' } },
              { entries: { some: { body: { contains: q, mode: 'insensitive' } } } },
              { entries: { some: { subject: { contains: q, mode: 'insensitive' } } } },
              { documents: { some: { ocrText: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {},
    ],
  }

  const cases = await prisma.case.findMany({
    where,
    include: {
      client: true,
      unit: true,
      _count: { select: { entries: true, documents: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const open = cases.filter((c) => !CASE_CLOSED_STATUSES.includes(c.status as CaseStatus)).length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sprawy</h1>
          <p className="text-gray-500 text-sm mt-1">
            {open} otwartych · {cases.length} {q || type || status ? 'znalezionych' : 'łącznie'}
          </p>
        </div>
        <Link
          href="/cases/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nowa sprawa
        </Link>
      </div>

      {/* Wyszukiwarka (GET — działa bez JS, przeszukuje też treść korespondencji i OCR skanów) */}
      <form method="GET" action="/cases" className="mb-4 flex gap-2">
        {type && <input type="hidden" name="type" value={type} />}
        {status && <input type="hidden" name="status" value={status} />}
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Szukaj: sygnatura, tytuł, treść pism, skany (OCR)..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700">
          Szukaj
        </button>
        {(q || type || status) && (
          <Link href="/cases" className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Wyczyść
          </Link>
        )}
      </form>

      {/* Filtry typu + statusu */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink href="/cases" label="Wszystkie" active={!type && !status} />
        <FilterLink href="/cases?type=REKLAMACJA" label="Reklamacje" active={type === 'REKLAMACJA'} />
        <FilterLink href="/cases?type=URZEDOWA" label="Urzędowe" active={type === 'URZEDOWA'} />
        <span className="w-px bg-gray-200 mx-1" />
        <FilterLink href="/cases?status=NOWA" label="Nowe" active={status === 'NOWA'} />
        <FilterLink href="/cases?status=W_TOKU" label="W toku" active={status === 'W_TOKU'} />
        <FilterLink href="/cases?status=OCZEKUJE" label="Oczekujące" active={status === 'OCZEKUJE'} />
      </div>

      <div className="space-y-2">
        {cases.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            {q || type || status ? 'Brak spraw spełniających kryteria' : 'Brak spraw — utwórz pierwszą'}
          </div>
        ) : (
          cases.map((c) => {
            const dState = deadlineState(c.deadline, c.status)
            return (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className="flex items-start gap-4 bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-200 hover:shadow-sm transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">{c.number}</span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${CASE_TYPE_COLORS[c.type as CaseType]}`}>
                      {CASE_TYPE_LABELS[c.type as CaseType]}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900 mt-1">{c.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {c.client ? `${c.client.firstName} ${c.client.lastName}` : c.counterparty || '—'}
                    {c.unit ? ` · ${c.unit.number}` : ''}
                    {c._count.entries > 0 ? ` · ${c._count.entries} wpis(ów)` : ''}
                    {c._count.documents > 0 ? ` · ${c._count.documents} skan(ów)` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <div className="flex gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${CASE_PRIORITY_COLORS[c.priority as CasePriority]}`}>
                      {CASE_PRIORITY_LABELS[c.priority as CasePriority]}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${CASE_STATUS_COLORS[c.status as CaseStatus]}`}>
                      {CASE_STATUS_LABELS[c.status as CaseStatus]}
                    </span>
                  </div>
                  {c.deadline && (
                    <span className={`text-xs ${DEADLINE_STATE_COLORS[dState]}`}>
                      {dState === 'OVERDUE' ? '⚠ ' : ''}
                      termin: {fmtDate(c.deadline)}
                    </span>
                  )}
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}

function FilterLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 border rounded-lg text-sm transition-colors ${
        active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
    </Link>
  )
}
