import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getOpenBudowaTasks } from '@/lib/budowa-tasks'
import { INVESTMENT_STATUS_LABELS, InvestmentStatus } from '@/lib/types'
import { FlagButton } from '@/components/budowa/CommentActions'
import { PrezesMessage } from '@/components/budowa/PrezesMessage'

/**
 * /budowa/przeglad — WIDOK PREZESA (moduł Budowa, Etap 1). Mobile-first, duże kafle,
 * mało drobnego tekstu — projektowany pod Bohdana (~70 lat, często w rozjazdach,
 * otwiera z telefonu). Zero edycji danych: czytanie + „Do wyjaśnienia" + wiadomość
 * do Rafała. Oś czasu etapów i statusy wykonawców dochodzą w Etapie 2.
 */

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: 'numeric',
    month: 'long',
  }).format(d)
}

function firstSentence(s: string, max = 90): string {
  const t = s.trim().replace(/\s+/g, ' ')
  const dot = t.indexOf('. ')
  const cut = dot > 10 && dot < max ? t.slice(0, dot + 1) : t
  return cut.length <= max ? cut : cut.slice(0, max - 1) + '…'
}

export default async function PrzegladPage() {
  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!investment) {
    return <div className="max-w-lg mx-auto p-6 text-center text-gray-500">Brak aktywnej inwestycji.</div>
  }

  const [openTasks, photos, reports] = await Promise.all([
    getOpenBudowaTasks(),
    prisma.sitePhoto.findMany({
      where: { investmentId: investment.id },
      orderBy: { takenAt: 'desc' },
      take: 8,
      select: { id: true, url: true, caption: true, takenAt: true },
    }),
    prisma.siteReport.findMany({
      where: { investmentId: investment.id },
      orderBy: { reportDate: 'desc' },
      take: 7,
      select: {
        id: true,
        reportDate: true,
        workDone: true,
        hasIssue: true,
        issueNote: true,
        needsDecision: true,
        authorEmail: true,
      },
    }),
  ])

  const problems = openTasks.filter((t) => t.ruleKey?.startsWith('BUDOWA_PROBLEM')).length
  const decisions = openTasks.filter(
    (t) =>
      t.ruleKey?.startsWith('BUDOWA_RAPORT_DECYZJA') || t.ruleKey?.startsWith('BUDOWA_WYJASNIENIE'),
  ).length
  const contractorActions = openTasks.filter((t) => t.ruleKey?.startsWith('BUDOWA_WYKONAWCA')).length

  const status = INVESTMENT_STATUS_LABELS[investment.status as InvestmentStatus] ?? investment.status
  const daysToEnd = investment.plannedEndDate
    ? Math.ceil((investment.plannedEndDate.getTime() - Date.now()) / 86_400_000)
    : null
  const [latest, ...previous] = reports

  return (
    <div className="max-w-lg mx-auto p-4 pb-16 space-y-5">
      {/* 1. Pasek statusu */}
      <div className="pt-4">
        <h1 className="text-3xl font-extrabold leading-tight">{investment.name}</h1>
        <p className="text-xl mt-1">
          {status}
          {daysToEnd !== null && (
            <span className={daysToEnd < 0 ? 'text-red-600 font-bold' : 'text-gray-500'}>
              {' '}
              • {daysToEnd >= 0 ? `${daysToEnd} dni do końca` : `${Math.abs(daysToEnd)} dni po terminie`}
            </span>
          )}
        </p>
      </div>

      {/* 2. Kafle alertów — tylko gdy coś jest */}
      {(problems > 0 || decisions > 0 || contractorActions > 0) && (
        <div className="grid grid-cols-1 gap-3">
          {problems > 0 && (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-5 text-xl font-bold text-red-800">
              ⚠️ {problems} {problems === 1 ? 'problem na budowie' : 'problemy na budowie'}
            </div>
          )}
          {decisions > 0 && (
            <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-5 text-xl font-bold text-yellow-800">
              🟡 {decisions} {decisions === 1 ? 'sprawa czeka na decyzję' : 'sprawy czekają na decyzję'}
            </div>
          )}
          {contractorActions > 0 && (
            <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5 text-xl font-bold text-blue-800">
              🔧 {contractorActions} {contractorActions === 1 ? 'sprawa u wykonawcy' : 'sprawy u wykonawców'}
            </div>
          )}
        </div>
      )}

      {/* 3. Ostatnie zdjęcia */}
      <div>
        <h2 className="text-xl font-bold mb-3">📷 Ostatnie zdjęcia</h2>
        {photos.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center text-gray-500 text-lg">
            Jeszcze nie ma zdjęć z budowy
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="rounded-2xl overflow-hidden bg-white border border-gray-200">
                <a href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption || 'Zdjęcie z budowy'} className="w-full h-40 object-cover" />
                </a>
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-sm text-gray-500">{fmtDate(p.takenAt)}</span>
                  <FlagButton photoId={p.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Ostatni raport kierownika + historia */}
      <div>
        <h2 className="text-xl font-bold mb-3">📋 Raporty z budowy</h2>
        {!latest ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center text-gray-500 text-lg">
            Jeszcze nie ma raportów
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl bg-white border border-gray-200 p-5">
              <div className="text-sm text-gray-500 mb-2">
                {fmtDate(latest.reportDate)}
                {latest.authorEmail && <> • {latest.authorEmail}</>}
              </div>
              <p className="text-lg whitespace-pre-wrap">{latest.workDone}</p>
              {latest.hasIssue && (
                <div className="mt-3 px-4 py-3 rounded-xl bg-red-50 text-red-800 text-lg font-semibold">
                  ⚠️ {latest.issueNote || 'Zgłoszony problem'}
                </div>
              )}
              {latest.needsDecision && (
                <div className="mt-2 px-4 py-3 rounded-xl bg-yellow-50 text-yellow-800 text-lg font-semibold">
                  🟡 Czeka na decyzję Rafała
                </div>
              )}
              <div className="mt-3">
                <FlagButton reportId={latest.id} big />
              </div>
            </div>
            {previous.length > 0 && (
              <div className="rounded-2xl bg-white border border-gray-200 divide-y divide-gray-100">
                {previous.map((r) => (
                  <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-sm text-gray-400 shrink-0 w-20">{fmtDate(r.reportDate)}</span>
                    <span className="text-base truncate">
                      {r.hasIssue && '⚠️ '}
                      {firstSentence(r.workDone)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Wiadomość do Rafała */}
      <PrezesMessage />

      <p className="text-center">
        <Link href="/budowa" prefetch={false} className="text-sm text-gray-400 underline">
          Przejdź do pełnego widoku
        </Link>
      </p>
    </div>
  )
}
