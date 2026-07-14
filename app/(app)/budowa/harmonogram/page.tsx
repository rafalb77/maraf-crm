import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { HarmonogramView } from '@/components/budowa/HarmonogramView'
import { GanttLazy } from '@/components/budowa/GanttLazy'

/**
 * /budowa/harmonogram — harmonogram budowy (moduł Budowa, Etap 2).
 * Dwa widoki na tych samych danych (?widok=):
 *  - gantt (domyślny) — SVAR React Gantt: zwijane etapy, drag terminów, linia "dziś"
 *  - lista — edycja inline (daty/postęp/status/wykonawca), dodawanie, usuwanie
 */
export const dynamic = 'force-dynamic'

function toISODate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

export default async function HarmonogramPage({
  searchParams,
}: {
  searchParams: { widok?: string }
}) {
  const widok = searchParams.widok === 'lista' ? 'lista' : 'gantt'
  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, plannedEndDate: true },
  })
  if (!investment) {
    return <div className="p-8 text-gray-500">Brak aktywnej inwestycji.</div>
  }

  const [stages, tasks, subs] = await Promise.all([
    prisma.constructionStage.findMany({
      where: { investmentId: investment.id },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, status: true, order: true, plannedStart: true, plannedEnd: true, notes: true, budgetNet: true },
    }),
    prisma.constructionTask.findMany({
      where: { investmentId: investment.id },
      orderBy: [{ orderIndex: 'asc' }, { plannedStart: 'asc' }],
      select: {
        id: true,
        number: true,
        name: true,
        stageId: true,
        status: true,
        progress: true,
        plannedStart: true,
        plannedEnd: true,
        isMilestone: true,
        subcontractorId: true,
        delayReason: true,
        acceptanceResult: true,
        acceptedAt: true,
      },
    }),
    prisma.subcontractor.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const isEmpty = stages.length === 0 && tasks.length === 0

  if (isEmpty) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Harmonogram — {investment.name}</h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 mb-4">
            Harmonogram jest pusty. Zaimportuj plik Excel z terminami robót — potem wygodnie
            poprawisz daty w tabeli.
          </p>
          <Link
            href="/budowa/harmonogram/import"
            prefetch={false}
            className="inline-block px-5 py-3 rounded-xl text-white font-semibold"
            style={{ background: '#1F2D3F' }}
          >
            📥 Importuj harmonogram z Excela
          </Link>
        </div>
      </div>
    )
  }

  const serializedStages = stages.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    order: s.order,
    plannedStart: toISODate(s.plannedStart),
    plannedEnd: toISODate(s.plannedEnd),
    notes: s.notes,
    budgetNet: s.budgetNet,
  }))
  const serializedTasks = tasks.map((t) => ({
    id: t.id,
    number: t.number,
    name: t.name,
    stageId: t.stageId,
    status: t.status,
    progress: t.progress,
    plannedStart: toISODate(t.plannedStart),
    plannedEnd: toISODate(t.plannedEnd),
    isMilestone: t.isMilestone,
    subcontractorId: t.subcontractorId,
    delayReason: t.delayReason,
    acceptanceResult: t.acceptanceResult,
    acceptedAt: toISODate(t.acceptedAt),
  }))

  const tabCls = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-semibold ${
      active ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
    }`

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Harmonogram — {investment.name}</h1>
        <div className="flex gap-2">
          <Link href="/budowa/harmonogram" prefetch={false} className={tabCls(widok === 'gantt')}>
            Gantt
          </Link>
          <Link
            href="/budowa/harmonogram?widok=lista"
            prefetch={false}
            className={tabCls(widok === 'lista')}
          >
            Lista
          </Link>
          <Link
            href="/budowa/harmonogram/import"
            prefetch={false}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium"
          >
            📥 Import z Excela
          </Link>
        </div>
      </div>
      {widok === 'gantt' ? (
        <GanttLazy stages={serializedStages} tasks={serializedTasks} />
      ) : (
        <HarmonogramView
          stages={serializedStages}
          tasks={serializedTasks}
          subcontractors={subs}
          plannedEndDate={toISODate(investment.plannedEndDate)}
        />
      )}
    </div>
  )
}
