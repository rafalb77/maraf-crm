import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { DEFECT_PRIORITIES, TRADES } from '@/lib/odbiory/constants'
import { json, jsonError, requireUser } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/** GET /api/odbiory/types — słownik usterek (legenda). */
export async function GET() {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  const rows = await prisma.defectType.findMany({
    orderBy: [{ active: 'desc' }, { code: 'asc' }],
    include: { defaultSubcontractor: { select: { id: true, name: true } } },
  })
  return json(rows)
}

/** POST /api/odbiory/types — nowy typ (także „w locie" z budowy: sam name wystarczy). */
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const name = String(body.name || '').trim().slice(0, 160)
  if (!name) return jsonError('Podaj nazwę usterki')
  const trade = (TRADES as readonly string[]).includes(body.trade) ? String(body.trade) : 'OGOLNE'
  const defaultPriority = (DEFECT_PRIORITIES as readonly string[]).includes(body.defaultPriority) ? String(body.defaultPriority) : 'NORMALNY'
  const defaultDays = body.defaultDays != null && body.defaultDays !== '' ? Math.max(0, Math.min(365, Number(body.defaultDays) || 0)) : null
  const defaultSubcontractorId = body.defaultSubcontractorId ? String(body.defaultSubcontractorId) : null

  let code = Number.isInteger(body.code) && body.code > 0 ? Number(body.code) : null
  if (!code) {
    const agg = await prisma.defectType.aggregate({ _max: { code: true } })
    code = (agg._max.code ?? 0) + 1
  }
  try {
    const created = await prisma.defectType.create({
      data: { code, name, trade, defaultPriority, defaultDays, defaultSubcontractorId },
    })
    void audit({ userId: user.id, userEmail: user.email, action: 'CREATE', entity: 'DefectType', entityId: created.id })
    return json(created, 201)
  } catch (e: any) {
    if (e?.code === 'P2002') return jsonError(`Kod ${code} jest już zajęty`)
    throw e
  }
}
