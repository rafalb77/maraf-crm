import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { toSnapshotDefect } from '@/lib/odbiory/server'
import { InspectionCard, type InspectionDetail } from '@/components/odbiory/InspectionCard'

/** /odbiory/[id] — karta odbioru (biuro): usterki, pakiety wykonawców, protokół i obecni. */
export default async function OdbiorPage({ params }: { params: { id: string } }) {
  const r = await prisma.inspection.findUnique({
    where: { id: params.id },
    include: {
      sheet: { select: { id: true, name: true, imageUrl: true, width: true, height: true } },
      subcontractor: { select: { id: true, name: true, email: true } },
      attendees: { orderBy: { sortOrder: 'asc' } },
      defects: { include: { photos: { orderBy: { createdAt: 'asc' } } }, orderBy: { seq: 'asc' } },
      investment: { select: { id: true, name: true } },
      parent: { select: { id: true, number: true } },
      children: { select: { id: true, number: true, startedAt: true }, orderBy: { startedAt: 'desc' } },
    },
  })
  if (!r) notFound()
  const subcontractors = await prisma.subcontractor.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } })

  const detail: InspectionDetail = {
    id: r.id,
    number: r.number,
    kind: r.kind,
    scopeName: r.scopeName,
    stage: r.stage,
    status: r.status,
    result: r.result,
    building: r.building,
    staircase: r.staircase,
    floor: r.floor,
    inspectorName: r.inspectorName,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
    fixDueAt: r.fixDueAt ? r.fixDueAt.toISOString() : null,
    notes: r.notes,
    protocolUrl: r.protocolUrl,
    investment: { ...r.investment, code: null },
    subcontractor: r.subcontractor,
    sheet: r.sheet,
    parent: r.parent,
    children: r.children.map((c) => ({ id: c.id, number: c.number, startedAt: c.startedAt.toISOString() })),
    attendees: r.attendees.map((a) => ({
      id: a.id,
      role: a.role,
      name: a.name,
      company: a.company,
      userId: a.userId,
      subcontractorId: a.subcontractorId,
      email: a.email,
      phone: a.phone,
      present: a.present,
    })),
    defects: r.defects.map(toSnapshotDefect),
  }

  return <InspectionCard initial={detail} subcontractors={subcontractors} />
}
