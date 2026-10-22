import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { toSnapshotDefect } from '@/lib/odbiory/server'
import { InspectionCard, type InspectionDetail } from '@/components/odbiory/InspectionCard'

const defectsInclude = { include: { photos: { orderBy: { createdAt: 'asc' as const } } }, orderBy: { seq: 'asc' as const } }

/**
 * /odbiory/[id] — karta odbioru (biuro): usterki, pakiety wykonawców, protokół i obecni.
 * Ponowny odbiór (kind PONOWNY, parentId) pokazuje usterki i pinezki ODBIORU PIERWOTNEGO —
 * ma tylko własną komisję, datę, wynik i protokół.
 */
export default async function OdbiorPage({ params }: { params: { id: string } }) {
  const r = await prisma.inspection.findUnique({
    where: { id: params.id },
    include: {
      sheet: { select: { id: true, name: true, imageUrl: true, width: true, height: true } },
      subcontractor: { select: { id: true, name: true, email: true } },
      attendees: { orderBy: { sortOrder: 'asc' } },
      defects: defectsInclude,
      investment: { select: { id: true, name: true } },
      parent: { select: { id: true, number: true, status: true, startedAt: true, defects: defectsInclude } },
      children: { select: { id: true, number: true, startedAt: true, status: true, result: true }, orderBy: { startedAt: 'desc' } },
    },
  })
  if (!r) notFound()
  const subcontractors = await prisma.subcontractor.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } })

  const isReinspection = !!r.parent
  const sourceDefects = r.parent ? r.parent.defects : r.defects
  // „w tym odbiorze": decyzje odebrano / nie odebrano w oknie czasu ponownego odbioru
  let verifiedInThis: { accepted: number; rejected: number } | null = null
  if (r.parent) {
    const events = await prisma.defectEvent.findMany({
      where: {
        defect: { inspectionId: r.parent.id },
        event: { in: ['ODEBRANA', 'NIE_ODEBRANA'] },
        createdAt: { gte: r.startedAt, ...(r.finishedAt ? { lte: r.finishedAt } : {}) },
      },
      orderBy: { createdAt: 'asc' },
      select: { defectId: true, event: true },
    })
    const last = new Map<string, string>()
    for (const e of events) last.set(e.defectId, e.event)
    verifiedInThis = { accepted: 0, rejected: 0 }
    for (const ev of last.values()) {
      if (ev === 'ODEBRANA') verifiedInThis.accepted++
      else verifiedInThis.rejected++
    }
  }

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
    parent: r.parent ? { id: r.parent.id, number: r.parent.number, startedAt: r.parent.startedAt.toISOString() } : null,
    children: r.children.map((c) => ({ id: c.id, number: c.number, startedAt: c.startedAt.toISOString(), status: c.status, result: c.result })),
    isReinspection,
    defectsOwnerId: r.parent ? r.parent.id : r.id,
    defectsOwnerStatus: r.parent ? r.parent.status : r.status,
    verifiedInThis,
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
      signatureUrl: a.signatureUrl,
      signedAt: a.signedAt ? a.signedAt.toISOString() : null,
    })),
    defects: sourceDefects.map(toSnapshotDefect),
  }

  return <InspectionCard initial={detail} subcontractors={subcontractors} />
}
