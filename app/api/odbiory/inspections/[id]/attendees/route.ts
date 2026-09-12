import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ATTENDEE_ROLES } from '@/lib/odbiory/constants'
import { json, jsonError, requireUser } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/** PUT /api/odbiory/inspections/[id]/attendees — zastępuje listę obecnych (książka projektu + „nie stawił się"). */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const inspection = await prisma.inspection.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!inspection) return jsonError('Odbiór nie istnieje', 404)
  const list = Array.isArray(body.attendees) ? body.attendees : []
  const rows = list
    .map((a: any, i: number) => ({
      inspectionId: inspection.id,
      role: (ATTENDEE_ROLES as readonly string[]).includes(a.role) ? String(a.role) : 'INNY',
      name: String(a.name || '').trim().slice(0, 120),
      company: a.company ? String(a.company).slice(0, 120) : null,
      userId: a.userId ? String(a.userId) : null,
      subcontractorId: a.subcontractorId ? String(a.subcontractorId) : null,
      email: a.email ? String(a.email).slice(0, 160) : null,
      phone: a.phone ? String(a.phone).slice(0, 40) : null,
      present: a.present !== false,
      sortOrder: i,
    }))
    .filter((a: { name: string }) => a.name)
  await prisma.$transaction([
    prisma.inspectionAttendee.deleteMany({ where: { inspectionId: inspection.id } }),
    ...(rows.length ? [prisma.inspectionAttendee.createMany({ data: rows })] : []),
  ])
  const saved = await prisma.inspectionAttendee.findMany({ where: { inspectionId: inspection.id }, orderBy: { sortOrder: 'asc' } })
  return json(saved)
}
