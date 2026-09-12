import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { DEFECT_PRIORITIES, TRADES } from '@/lib/odbiory/constants'
import { json, jsonError, requireUser } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/** PATCH /api/odbiory/types/[id] — edycja typu w słowniku. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 160)
    if (!name) return jsonError('Nazwa nie może być pusta')
    data.name = name
  }
  if (body.trade !== undefined) data.trade = (TRADES as readonly string[]).includes(body.trade) ? body.trade : 'OGOLNE'
  if (body.defaultPriority !== undefined) data.defaultPriority = (DEFECT_PRIORITIES as readonly string[]).includes(body.defaultPriority) ? body.defaultPriority : 'NORMALNY'
  if (body.defaultDays !== undefined) data.defaultDays = body.defaultDays === null || body.defaultDays === '' ? null : Math.max(0, Math.min(365, Number(body.defaultDays) || 0))
  if (body.defaultSubcontractorId !== undefined) data.defaultSubcontractorId = body.defaultSubcontractorId || null
  if (body.active !== undefined) data.active = !!body.active
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0
  if (body.code !== undefined) {
    const code = Number(body.code)
    if (!Number.isInteger(code) || code <= 0) return jsonError('Kod musi być liczbą dodatnią')
    data.code = code
  }
  try {
    const updated = await prisma.defectType.update({ where: { id: params.id }, data })
    void audit({ userId: user.id, userEmail: user.email, action: 'UPDATE', entity: 'DefectType', entityId: updated.id })
    return json(updated)
  } catch (e: any) {
    if (e?.code === 'P2002') return jsonError('Ten kod jest już zajęty')
    if (e?.code === 'P2025') return jsonError('Typ nie istnieje', 404)
    throw e
  }
}
