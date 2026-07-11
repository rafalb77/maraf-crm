import { prisma } from '@/lib/prisma'
import { CheckinForm } from '@/components/budowa/CheckinForm'

/**
 * /checkin — mobilny raport kierownika budowy (moduł Budowa, Etap 1+2).
 * Permission 'checkin' egzekwuje middleware; sesja — layout (mobile).
 * Etap 2: sekcja zadań z harmonogramu (postęp 25/50/75/100, gotowe do odbioru,
 * notatka) — zasila paski Gantta bez udziału Rafała.
 */
export default async function CheckinPage() {
  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })

  if (!investment) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-gray-500">
        Brak aktywnej inwestycji — skontaktuj się z biurem.
      </div>
    )
  }

  const [subcontractors, tasks] = await Promise.all([
    prisma.subcontractor.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    // zadania "w grze": trwające, czekające na odbiór i planowane, które już powinny ruszyć
    prisma.constructionTask.findMany({
      where: {
        investmentId: investment.id,
        isMilestone: false,
        OR: [
          { status: { in: ['W_TOKU', 'DO_ODBIORU'] } },
          { status: 'PLANOWANE', plannedStart: { lte: new Date(Date.now() + 3 * 86_400_000) } },
        ],
      },
      orderBy: { plannedEnd: 'asc' },
      take: 40,
      select: {
        id: true,
        number: true,
        name: true,
        status: true,
        progress: true,
        plannedEnd: true,
        acceptanceResult: true,
        acceptanceNote: true,
      },
    }),
  ])

  return (
    <CheckinForm
      investmentName={investment.name}
      subcontractors={subcontractors}
      tasks={tasks.map((t) => ({
        id: t.id,
        number: t.number,
        name: t.name,
        status: t.status,
        progress: t.progress,
        plannedEnd: t.plannedEnd.toISOString().slice(0, 10),
        acceptanceResult: t.acceptanceResult,
        acceptanceNote: t.acceptanceNote,
      }))}
    />
  )
}
