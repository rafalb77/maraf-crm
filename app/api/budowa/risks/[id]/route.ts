import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'

const SEVERITIES = ['NISKIE', 'SREDNIE', 'WYSOKIE', 'KRYTYCZNE']
const STATUSES = ['OTWARTE', 'MONITOROWANE', 'ZAZEGNANE', 'ZMATERIALIZOWANE']

/** PATCH /api/budowa/risks/[id] — zmiana statusu/severity/mitygacji (moduł Budowa, Etap 4). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }

  const existing = await prisma.constructionRisk.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Ryzyko nie istnieje' }, { status: 404 })

  const data: any = {}
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Nieznany status' }, { status: 400 })
    data.status = body.status
    // zamknięcie ryzyka stempluje resolvedAt
    data.resolvedAt = body.status === 'ZAZEGNANE' || body.status === 'ZMATERIALIZOWANE' ? new Date() : null
  }
  if (body.severity !== undefined) {
    if (!SEVERITIES.includes(body.severity)) return NextResponse.json({ error: 'Nieznana ważność' }, { status: 400 })
    data.severity = body.severity
  }
  if (body.title !== undefined) {
    const t = String(body.title).trim()
    if (t.length < 2) return NextResponse.json({ error: 'Opis nie może być pusty' }, { status: 400 })
    data.title = t.slice(0, 300)
  }
  if (body.description !== undefined) data.description = body.description ? String(body.description).slice(0, 2000) : null
  if (body.mitigation !== undefined) data.mitigation = body.mitigation ? String(body.mitigation).slice(0, 2000) : null
  if (body.impactDays !== undefined) {
    data.impactDays =
      body.impactDays === null || body.impactDays === '' ? null : Math.max(0, Math.round(Number(body.impactDays)))
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Brak zmian' }, { status: 400 })

  const updated = await prisma.constructionRisk.update({
    where: { id: params.id },
    data,
    select: { id: true, status: true, severity: true, resolvedAt: true },
  })
  void audit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: 'UPDATE',
    entity: 'ConstructionRisk',
    entityId: params.id,
  })
  return NextResponse.json(updated)
}

/** DELETE /api/budowa/risks/[id] — usunięcie ryzyka. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const existing = await prisma.constructionRisk.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Ryzyko nie istnieje' }, { status: 404 })
  await prisma.constructionRisk.delete({ where: { id: params.id } })
  void audit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: 'DELETE',
    entity: 'ConstructionRisk',
    entityId: params.id,
  })
  return NextResponse.json({ ok: true })
}
