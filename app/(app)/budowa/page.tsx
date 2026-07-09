import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getOpenBudowaTasks } from '@/lib/budowa-tasks'
import { INVESTMENT_STATUS_LABELS, INVESTMENT_STATUS_COLORS, InvestmentStatus } from '@/lib/types'

/**
 * Pulpit budowy — moduł Budowa (Project Manager).
 * Etap 1: alerty (Taski BUDOWA_*), ostatni raport kierownika, ostatnie zdjęcia.
 * Mini-oś czasu etapów i opóźnienia dochodzą w Etapie 2 (harmonogram).
 */
export default async function BudowaPage() {
  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!investment) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Budowa</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Brak aktywnej inwestycji. Uruchom seed (<code>npm run db:seed</code>) albo dodaj
          inwestycję w bazie — edycja w UI dojdzie w kolejnych etapach.
        </div>
      </div>
    )
  }

  const status = investment.status as InvestmentStatus
  const statusLabel = INVESTMENT_STATUS_LABELS[status] ?? investment.status
  const statusColor = INVESTMENT_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'

  const daysToEnd = investment.plannedEndDate
    ? Math.ceil((investment.plannedEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const [openTasks, lastReport, lastPhotos] = await Promise.all([
    getOpenBudowaTasks(),
    prisma.siteReport.findFirst({
      where: { investmentId: investment.id },
      orderBy: { reportDate: 'desc' },
      select: {
        id: true,
        reportDate: true,
        workDone: true,
        hasIssue: true,
        needsDecision: true,
        needsContractorAction: true,
        authorEmail: true,
      },
    }),
    prisma.sitePhoto.findMany({
      where: { investmentId: investment.id },
      orderBy: { takenAt: 'desc' },
      take: 4,
      select: { id: true, url: true },
    }),
  ])

  return (
    <div className="p-8">
      {/* Nagłówek inwestycji */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{investment.name}</h1>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
          {statusLabel}
        </span>
        {investment.address && <span className="text-sm text-gray-500">{investment.address}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">Start budowy</div>
          <div className="text-lg font-semibold">
            {investment.startDate ? investment.startDate.toLocaleDateString('pl-PL') : '—'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">
            Planowane zakończenie
          </div>
          <div className="text-lg font-semibold">
            {investment.plannedEndDate
              ? investment.plannedEndDate.toLocaleDateString('pl-PL')
              : '—'}
          </div>
          {daysToEnd !== null && (
            <div className={`text-sm mt-1 ${daysToEnd < 0 ? 'text-red-600' : 'text-gray-500'}`}>
              {daysToEnd >= 0 ? `za ${daysToEnd} dni` : `${Math.abs(daysToEnd)} dni po terminie`}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">Postęp</div>
          <div className="text-lg font-semibold text-gray-400">—</div>
          <div className="text-sm text-gray-500 mt-1">liczony z harmonogramu (Etap 2)</div>
        </div>
      </div>

      {/* Alerty z budowy — otwarte Taski BUDOWA_* (problemy, decyzje, wykonawcy, wyjaśnienia) */}
      {openTasks.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="font-semibold mb-3">Wymaga uwagi ({openTasks.length})</div>
          <ul className="space-y-2">
            {openTasks.slice(0, 6).map((t) => (
              <li key={t.id} className="text-sm flex items-start gap-2">
                <span className="shrink-0">
                  {t.ruleKey?.startsWith('BUDOWA_PROBLEM') && '⚠️'}
                  {t.ruleKey?.startsWith('BUDOWA_RAPORT_DECYZJA') && '🟡'}
                  {t.ruleKey?.startsWith('BUDOWA_WYKONAWCA') && '🔧'}
                  {t.ruleKey?.startsWith('BUDOWA_WYJASNIENIE') && '🚩'}
                </span>
                <span>{t.title.replace(/^Budowa: /, '')}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400 mt-3">
            Odhaczanie w centrum zadań na <Link href="/dashboard" prefetch={false} className="underline">Pulpicie</Link>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Ostatni raport kierownika */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Ostatni raport z budowy</div>
            <Link href="/budowa/dziennik" prefetch={false} className="text-sm text-gray-500 underline">
              Dziennik →
            </Link>
          </div>
          {lastReport ? (
            <>
              <div className="text-xs text-gray-400 mb-1">
                {lastReport.reportDate.toLocaleDateString('pl-PL')}
                {lastReport.authorEmail && <> • {lastReport.authorEmail}</>}
                {lastReport.hasIssue && ' • ⚠️ problem'}
                {lastReport.needsDecision && ' • 🟡 decyzja'}
                {lastReport.needsContractorAction && ' • 🔧 wykonawca'}
              </div>
              <p className="text-sm whitespace-pre-wrap">{lastReport.workDone}</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              Brak raportów — kierownik raportuje z telefonu przez <code>/checkin</code>.
            </p>
          )}
        </div>

        {/* Ostatnie zdjęcia */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Ostatnie zdjęcia</div>
            <Link
              href="/budowa/dziennik?widok=galeria"
              prefetch={false}
              className="text-sm text-gray-500 underline"
            >
              Galeria →
            </Link>
          </div>
          {lastPhotos.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {lastPhotos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="Zdjęcie z budowy" className="w-full h-20 object-cover rounded-lg border border-gray-200" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Jeszcze nie ma zdjęć z budowy.</p>
          )}
        </div>
      </div>

      {/* Zapowiedzi kolejnych etapów modułu — znikają w miarę wdrażania */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6">
          <div className="font-semibold mb-1">Harmonogram (Gantt)</div>
          <p className="text-sm text-gray-500">
            Etapy, zadania, kamienie milowe, opóźnienia, odbiory — Etap 2.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6">
          <div className="font-semibold mb-1">Koszty budowy</div>
          <p className="text-sm text-gray-500">
            Faktury per etap/wykonawca, budżety etapów, alerty — Etap 3 (dane z modułu Finanse).
          </p>
        </div>
      </div>
    </div>
  )
}
