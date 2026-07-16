import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { FlagButton, ResolveButton } from '@/components/budowa/CommentActions'

/**
 * /budowa/dziennik — dziennik budowy (moduł Budowa, Etap 1).
 * Feed raportów kierownika + zakładka „Galeria" (?widok=galeria).
 * Etap/wykonawca przy zdjęciach dojdą w Etapie 2 (wynikają z zadania).
 */

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export default async function DziennikPage({
  searchParams,
}: {
  searchParams: { widok?: string }
}) {
  const galeria = searchParams.widok === 'galeria'

  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })
  if (!investment) {
    return <div className="p-4 sm:p-6 lg:p-8 text-gray-500">Brak aktywnej inwestycji.</div>
  }

  const tabCls = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-semibold ${
      active ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
    }`

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h1 className="text-2xl font-bold">Dziennik budowy — {investment.name}</h1>
      <div className="flex gap-2">
        <Link href="/budowa/dziennik" prefetch={false} className={tabCls(!galeria)}>
          Raporty
        </Link>
        <Link href="/budowa/dziennik?widok=galeria" prefetch={false} className={tabCls(galeria)}>
          Galeria
        </Link>
      </div>
    </div>
  )

  // ------------------------------------------------------------- GALERIA
  if (galeria) {
    const photos = await prisma.sitePhoto.findMany({
      where: { investmentId: investment.id },
      orderBy: { takenAt: 'desc' },
      take: 120,
      select: { id: true, url: true, caption: true, takenAt: true, reportId: true },
    })
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        {header}
        {photos.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 text-center text-gray-500">
            Brak zdjęć — pierwsze pojawią się po raporcie kierownika z <code>/checkin</code>.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <a href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption || 'Zdjęcie z budowy'} className="w-full h-40 object-cover" />
                </a>
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">{fmtDate(p.takenAt)}</span>
                  <FlagButton photoId={p.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ------------------------------------------------------------- RAPORTY
  const [reports, subs] = await Promise.all([
    prisma.siteReport.findMany({
      where: { investmentId: investment.id },
      orderBy: { reportDate: 'desc' },
      take: 30,
      include: {
        photos: { select: { id: true, url: true }, orderBy: { takenAt: 'asc' } },
        comments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            needsClarification: true,
            resolvedAt: true,
            authorEmail: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.subcontractor.findMany({ select: { id: true, name: true } }),
  ])
  const subName = new Map(subs.map((s) => [s.id, s.name]))

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {header}
      {reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 text-center text-gray-500">
          Brak raportów. Kierownik budowy raportuje z telefonu przez <code>/checkin</code>.
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {reports.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-sm text-gray-500">
                  {fmtDate(r.reportDate)}
                  {r.authorEmail && <> • {r.authorEmail}</>}
                </div>
                <FlagButton reportId={r.id} />
              </div>

              <p className="whitespace-pre-wrap mb-3">{r.workDone}</p>

              {(r.hasIssue || r.needsDecision || r.needsContractorAction) && (
                <div className="space-y-2 mb-3">
                  {r.hasIssue && (
                    <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm">
                      ⚠️ <span className="font-semibold">Problem:</span> {r.issueNote || '—'}
                    </div>
                  )}
                  {r.needsDecision && (
                    <div className="px-3 py-2 rounded-lg bg-yellow-50 text-yellow-800 text-sm">
                      🟡 <span className="font-semibold">Do decyzji:</span> {r.decisionNote || '—'}
                    </div>
                  )}
                  {r.needsContractorAction && (
                    <div className="px-3 py-2 rounded-lg bg-blue-50 text-blue-800 text-sm">
                      🔧 <span className="font-semibold">Reakcja wykonawcy
                      {r.contractorActionSubcontractorId
                        ? ` (${subName.get(r.contractorActionSubcontractorId) || '?'})`
                        : ''}:</span>{' '}
                      {r.contractorActionNote || '—'}
                    </div>
                  )}
                </div>
              )}

              {r.photos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {r.photos.map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="Zdjęcie z budowy" className="h-24 w-24 object-cover rounded-lg border border-gray-200" />
                    </a>
                  ))}
                </div>
              )}

              {r.comments.length > 0 && (
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  {r.comments.map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className={c.resolvedAt ? 'text-gray-400' : ''}>
                        {c.needsClarification && (
                          <span className={`font-semibold mr-1 ${c.resolvedAt ? '' : 'text-amber-700'}`}>
                            🚩 Do wyjaśnienia{c.resolvedAt ? ' (wyjaśnione)' : ''}:
                          </span>
                        )}
                        {c.body || <span className="italic">bez opisu</span>}
                        <span className="text-xs text-gray-400"> — {c.authorEmail || '?'}</span>
                      </div>
                      {c.needsClarification && !c.resolvedAt && <ResolveButton commentId={c.id} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
