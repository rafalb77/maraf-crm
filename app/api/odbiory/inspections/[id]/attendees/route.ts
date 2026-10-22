import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ATTENDEE_ROLES } from '@/lib/odbiory/constants'
import { json, jsonError, requireUser } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/odbiory/inspections/[id]/attendees — zapisuje listę obecnych.
 * Wiersze z `id` są aktualizowane (zachowują podpis), nowe tworzone, brakujące usuwane.
 * Podpisany obecny (signatureUrl) nie zmienia nazwiska, firmy ani roli — podpis dotyczy
 * konkretnej osoby; żeby poprawić dane, trzeba najpierw usunąć podpis.
 */
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
  const existing = await prisma.inspectionAttendee.findMany({ where: { inspectionId: inspection.id } })
  const byId = new Map(existing.map((a) => [a.id, a]))

  const list = Array.isArray(body.attendees) ? body.attendees : []
  const rows = list
    .map((a: any, i: number) => ({
      id: a.id && byId.has(String(a.id)) ? String(a.id) : null,
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

  const keepIds = new Set(rows.map((r: { id: string | null }) => r.id).filter(Boolean) as string[])
  const removedSigned = existing.filter((a) => !keepIds.has(a.id) && a.signatureUrl)
  if (removedSigned.length) return jsonError(`Nie można usunąć podpisanej osoby (${removedSigned.map((a) => a.name).join(', ')}) — najpierw usuń podpis`)

  await prisma.$transaction([
    prisma.inspectionAttendee.deleteMany({ where: { inspectionId: inspection.id, id: { notIn: [...keepIds] } } }),
    ...rows.map((r: any) => {
      const { id, ...data } = r
      if (id) {
        const prev = byId.get(id)!
        // podpisany: tylko kolejność i obecność
        const patch = prev.signatureUrl ? { sortOrder: data.sortOrder, present: data.present } : data
        return prisma.inspectionAttendee.update({ where: { id }, data: patch })
      }
      return prisma.inspectionAttendee.create({ data: { ...data, inspectionId: inspection.id } })
    }),
  ])
  const saved = await prisma.inspectionAttendee.findMany({ where: { inspectionId: inspection.id }, orderBy: { sortOrder: 'asc' } })
  return json(saved)
}
