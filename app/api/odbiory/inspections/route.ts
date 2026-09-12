import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { INSPECTION_KINDS } from '@/lib/odbiory/constants'
import { createInspection, json, jsonError, requireUser } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/** GET /api/odbiory/inspections?status=W_TOKU — lista odbiorów z licznikami usterek. */
export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  const status = req.nextUrl.searchParams.get('status')
  const rows = await prisma.inspection.findMany({
    where: status ? { status } : undefined,
    orderBy: { startedAt: 'desc' },
    take: 200,
    include: {
      subcontractor: { select: { id: true, name: true } },
      _count: { select: { defects: true } },
      defects: { select: { status: true } },
    },
  })
  return json(
    rows.map((r) => {
      const counts: Record<string, number> = {}
      for (const d of r.defects) counts[d.status] = (counts[d.status] || 0) + 1
      return {
        id: r.id,
        number: r.number,
        kind: r.kind,
        scopeName: r.scopeName,
        stage: r.stage,
        status: r.status,
        result: r.result,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
        inspectorName: r.inspectorName,
        subcontractor: r.subcontractor,
        defectCount: r._count.defects,
        counts,
      }
    }),
  )
}

/** POST /api/odbiory/inspections — nowy odbiór (kreator Projekt → Budynek → Klatka → Kondygnacja). */
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const investmentId = String(body.investmentId || '')
  const markersKey = String(body.markersKey || '')
  const kind = String(body.kind || 'ROBOTY')
  if (!investmentId) return jsonError('Wybierz inwestycję')
  if (!markersKey) return jsonError('Wybierz kondygnację (arkusz rzutu)')
  if (!(INSPECTION_KINDS as readonly string[]).includes(kind)) return jsonError('Nieznany rodzaj odbioru')
  const inv = await prisma.investment.findUnique({ where: { id: investmentId }, select: { id: true } })
  if (!inv) return jsonError('Inwestycja nie istnieje', 404)

  try {
    const inspection = await createInspection({
      investmentId,
      kind,
      stage: body.stage ? String(body.stage).slice(0, 120) : null,
      subcontractorId: body.subcontractorId ? String(body.subcontractorId) : null,
      building: body.building ? String(body.building).slice(0, 40) : null,
      staircase: body.staircase ? String(body.staircase).slice(0, 10).toUpperCase() : null,
      markersKey,
      scheduledAt: body.scheduledAt ? new Date(String(body.scheduledAt)) : null,
      notes: body.notes ? String(body.notes).slice(0, 2000) : null,
      user,
    })
    void audit({ userId: user.id, userEmail: user.email, action: 'CREATE', entity: 'Inspection', entityId: inspection.id })
    return json({ id: inspection.id, number: inspection.number }, 201)
  } catch (e: any) {
    return jsonError(e?.message || 'Nie udało się utworzyć odbioru', 400)
  }
}
