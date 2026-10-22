import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { json, jsonError, nextInspectionNumber, requireUser } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/odbiory/inspections/[id]/reinspection — nowy PONOWNY odbiór (osobny protokół)
 * do odbioru [id]. Zawsze podpina się do ODBIORU PIERWOTNEGO (root), nawet gdy [id] jest już
 * ponownym — usterki żyją na pierwotnym. Kopiuje zakres, arkusz, wykonawcę i listę obecnych
 * (bez podpisów) z odbioru, z którego wywołano akcję; komisję edytuje się potem na karcie.
 * body: { startedAt?: ISO, inspectorId?: string }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const from = await prisma.inspection.findUnique({ where: { id: params.id }, include: { attendees: { orderBy: { sortOrder: 'asc' } } } })
  if (!from) return jsonError('Odbiór nie istnieje', 404)
  const root = from.parentId ? await prisma.inspection.findUnique({ where: { id: from.parentId } }) : from
  if (!root) return jsonError('Odbiór pierwotny nie istnieje', 404)
  if (!root.sheetId) return jsonError('Odbiór pierwotny nie ma arkusza rzutu')

  let startedAt = new Date()
  if (body.startedAt) {
    const d = new Date(String(body.startedAt))
    if (Number.isNaN(d.getTime())) return jsonError('Nieprawidłowa data odbioru')
    if (d.getTime() > Date.now() + 24 * 3600 * 1000) return jsonError('Data odbioru nie może być w przyszłości')
    startedAt = d
  }
  let inspector = { id: user.id || null, name: user.name }
  if (body.inspectorId && String(body.inspectorId) !== user.id) {
    const u = await prisma.user.findUnique({ where: { id: String(body.inspectorId) }, select: { id: true, name: true, email: true } })
    if (!u) return jsonError('Wskazany prowadzący nie istnieje', 404)
    inspector = { id: u.id, name: u.name || u.email }
  }

  const seqNo = (await prisma.inspection.count({ where: { parentId: root.id } })) + 1
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = await nextInspectionNumber()
    try {
      const created = await prisma.inspection.create({
        data: {
          number,
          investmentId: root.investmentId,
          kind: 'PONOWNY',
          scopeName: `Ponowny odbiór ${seqNo} · ${root.scopeName}`,
          stage: root.stage,
          subcontractorId: root.subcontractorId,
          sheetId: root.sheetId,
          building: root.building,
          staircase: root.staircase,
          floor: root.floor,
          startedAt,
          inspectorId: inspector.id,
          inspectorName: inspector.name,
          parentId: root.id,
          attendees: {
            create: from.attendees.map((a, i) => ({
              role: a.role,
              name: a.name,
              company: a.company,
              userId: a.userId,
              subcontractorId: a.subcontractorId,
              email: a.email,
              phone: a.phone,
              present: true,
              sortOrder: i,
            })),
          },
        },
      })
      void audit({ userId: user.id, userEmail: user.email, action: 'CREATE', entity: 'Inspection', entityId: created.id, metadata: { reinspectionOf: root.number } })
      return json({ id: created.id, number: created.number, parentId: root.id }, 201)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 2) continue
      throw e
    }
  }
  return jsonError('Nie udało się nadać numeru odbioru', 500)
}
