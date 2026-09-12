import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { INSPECTION_RESULTS } from '@/lib/odbiory/constants'
import { json, jsonError, requireUser, toSnapshotDefect } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/** GET /api/odbiory/inspections/[id] — karta odbioru (biuro). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  const r = await prisma.inspection.findUnique({
    where: { id: params.id },
    include: {
      sheet: true,
      subcontractor: { select: { id: true, name: true, email: true } },
      attendees: { orderBy: { sortOrder: 'asc' } },
      defects: { include: { photos: { orderBy: { createdAt: 'asc' } } }, orderBy: { seq: 'asc' } },
      dispatches: {
        orderBy: { createdAt: 'desc' },
        include: { subcontractor: { select: { id: true, name: true } }, _count: { select: { items: true } } },
      },
      investment: { select: { id: true, name: true } },
    },
  })
  if (!r) return jsonError('Odbiór nie istnieje', 404)
  return json({
    ...r,
    defects: r.defects.map(toSnapshotDefect),
  })
}

/** PATCH /api/odbiory/inspections/[id] — notatki, wynik, wspólny termin, zakończenie/anulowanie. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const current = await prisma.inspection.findUnique({ where: { id: params.id }, select: { id: true, status: true } })
  if (!current) return jsonError('Odbiór nie istnieje', 404)

  const data: Record<string, unknown> = {}
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).slice(0, 5000) : null
  if (body.stage !== undefined) data.stage = body.stage ? String(body.stage).slice(0, 120) : null
  if (body.subcontractorId !== undefined) data.subcontractorId = body.subcontractorId ? String(body.subcontractorId) : null
  if (body.fixDueAt !== undefined) {
    const d = body.fixDueAt ? new Date(String(body.fixDueAt)) : null
    if (d && Number.isNaN(d.getTime())) return jsonError('Nieprawidłowa data terminu')
    data.fixDueAt = d
  }
  if (body.result !== undefined) {
    if (body.result && !(INSPECTION_RESULTS as readonly string[]).includes(body.result)) return jsonError('Nieznany wynik odbioru')
    data.result = body.result || null
  }
  if (body.status !== undefined) {
    const s = String(body.status)
    if (s === 'ZAKONCZONY') {
      if (!data.result && !body.result) {
        const existing = await prisma.inspection.findUnique({ where: { id: params.id }, select: { result: true } })
        if (!existing?.result) return jsonError('Wybierz wynik odbioru przed zakończeniem')
      }
      data.status = 'ZAKONCZONY'
      data.finishedAt = new Date()
    } else if (s === 'ANULOWANY') {
      data.status = 'ANULOWANY'
      data.finishedAt = new Date()
    } else if (s === 'W_TOKU') {
      data.status = 'W_TOKU'
      data.finishedAt = null
    } else {
      return jsonError('Nieznany status')
    }
  }
  const updated = await prisma.inspection.update({ where: { id: params.id }, data })
  void audit({ userId: user.id, userEmail: user.email, action: 'UPDATE', entity: 'Inspection', entityId: updated.id, metadata: data })
  return json({ id: updated.id, status: updated.status, result: updated.result, finishedAt: updated.finishedAt })
}
