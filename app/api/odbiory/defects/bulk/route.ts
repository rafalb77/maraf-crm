import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { DEFECT_PRIORITIES, TRADES } from '@/lib/odbiory/constants'
import { json, jsonError, requireUser, toSnapshotDefect } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/odbiory/defects/bulk — zmiana zbiorcza dla zaznaczonych usterek z listy na karcie
 * odbioru: { ids: string[], patch: { trade?, subcontractorId?, dueAt?, priority?, room? } }.
 * Pola nieobecne w patch zostają bez zmian; null czyści (wykonawca, termin, pomieszczenie).
 * Tylko usterki jednego odbioru, tylko gdy odbiór jest W_TOKU. Każda dostaje zdarzenie ZMIENIONA.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String).filter((s: string) => /^[A-Za-z0-9_-]{6,64}$/.test(s)).slice(0, 500) : []
  if (ids.length === 0) return jsonError('Zaznacz przynajmniej jedną usterkę')
  const patch = body.patch && typeof body.patch === 'object' ? body.patch : {}

  const data: Record<string, unknown> = {}
  const changes: string[] = []
  if (patch.trade !== undefined) {
    if (patch.trade !== null && !(TRADES as readonly string[]).includes(patch.trade)) return jsonError('Nieznana branża')
    data.trade = patch.trade
    changes.push(`branża → ${patch.trade ?? '—'}`)
  }
  if (patch.priority !== undefined) {
    if (!(DEFECT_PRIORITIES as readonly string[]).includes(patch.priority)) return jsonError('Nieznany priorytet')
    data.priority = patch.priority
    changes.push(`priorytet → ${patch.priority}`)
  }
  if (patch.subcontractorId !== undefined) {
    if (patch.subcontractorId) {
      const sub = await prisma.subcontractor.findUnique({ where: { id: String(patch.subcontractorId) }, select: { id: true, name: true } })
      if (!sub) return jsonError('Wykonawca nie istnieje', 404)
      data.subcontractorId = sub.id
      changes.push(`wykonawca → ${sub.name}`)
    } else {
      data.subcontractorId = null
      changes.push('wykonawca → brak')
    }
  }
  if (patch.dueAt !== undefined) {
    if (patch.dueAt) {
      const d = new Date(String(patch.dueAt))
      if (Number.isNaN(d.getTime())) return jsonError('Nieprawidłowy termin')
      data.dueAt = d
      changes.push(`termin → ${d.toISOString().slice(0, 10)}`)
    } else {
      data.dueAt = null
      changes.push('termin → brak')
    }
  }
  if (patch.room !== undefined) {
    data.room = patch.room ? String(patch.room).trim().slice(0, 80) : null
    changes.push(`pomieszczenie → ${data.room ?? '—'}`)
  }
  if (Object.keys(data).length === 0) return jsonError('Nie wybrano żadnej zmiany')

  const defects = await prisma.defect.findMany({ where: { id: { in: ids } }, select: { id: true, inspectionId: true } })
  if (defects.length === 0) return jsonError('Usterki nie istnieją', 404)
  const inspectionIds = [...new Set(defects.map((d) => d.inspectionId))]
  if (inspectionIds.length > 1) return jsonError('Zaznaczone usterki należą do różnych odbiorów')
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionIds[0] }, select: { status: true } })
  if (!inspection || inspection.status !== 'W_TOKU') return jsonError('Odbiór jest zakończony — usterki są zablokowane')

  const details = changes.join(', ')
  await prisma.$transaction([
    prisma.defect.updateMany({ where: { id: { in: defects.map((d) => d.id) } }, data }),
    prisma.defectEvent.createMany({
      data: defects.map((d) => ({ defectId: d.id, event: 'ZMIENIONA', details: `zmiana zbiorcza: ${details}`, actorType: 'USER', actorName: user.name })),
    }),
  ])
  const updated = await prisma.defect.findMany({ where: { id: { in: defects.map((d) => d.id) } }, include: { photos: { orderBy: { createdAt: 'asc' } } }, orderBy: { seq: 'asc' } })
  void audit({ userId: user.id, userEmail: user.email, action: 'UPDATE', entity: 'Defect', entityId: inspectionIds[0], metadata: { bulk: details, count: updated.length } })
  return json({ count: updated.length, defects: updated.map(toSnapshotDefect) })
}
