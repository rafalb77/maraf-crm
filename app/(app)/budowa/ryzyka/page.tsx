import { prisma } from '@/lib/prisma'
import { RyzykaView, type Risk } from '@/components/budowa/RyzykaView'
import type { ConstructionRiskKind, ConstructionRiskSeverity, ConstructionRiskStatus } from '@/lib/types'

/**
 * /budowa/ryzyka — rejestr ryzyk i blokerów (moduł Budowa, Etap 4, decyzja Rafała nr 7).
 */
export const dynamic = 'force-dynamic'

export default async function RyzykaPage() {
  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })
  if (!investment) return <div className="p-4 sm:p-6 lg:p-8 text-gray-500">Brak aktywnej inwestycji.</div>

  const [risks, tasks] = await Promise.all([
    prisma.constructionRisk.findMany({
      where: { investmentId: investment.id },
      orderBy: { createdAt: 'desc' },
      include: { task: { select: { number: true, name: true } } },
    }),
    prisma.constructionTask.findMany({
      where: { investmentId: investment.id, isMilestone: false },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, number: true, name: true },
    }),
  ])

  const serialized: Risk[] = risks.map((r) => ({
    id: r.id,
    kind: r.kind as ConstructionRiskKind,
    title: r.title,
    description: r.description,
    severity: r.severity as ConstructionRiskSeverity,
    status: r.status as ConstructionRiskStatus,
    impactDays: r.impactDays,
    mitigation: r.mitigation,
    taskLabel: r.task ? `${r.task.number ? r.task.number + ' ' : ''}${r.task.name}` : null,
    createdByEmail: r.createdByEmail,
    createdAt: r.createdAt.toISOString().slice(0, 10),
  }))

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-bold mb-6">Ryzyka i blokery — {investment.name}</h1>
      <RyzykaView risks={serialized} tasks={tasks} />
    </div>
  )
}
