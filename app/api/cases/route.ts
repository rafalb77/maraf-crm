import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'
import { nextCaseNumber } from '@/lib/case-number'
import { defaultDeadline } from '@/lib/case-deadlines'

export const runtime = 'nodejs'

/**
 * GET /api/cases — lista spraw z filtrami (type, status, clientId) i wyszukiwaniem (q).
 * W fazie 1 q przeszukuje sygnaturę/tytuł/opis/stronę. Faza 3 rozszerza o treść
 * wpisów i OCR skanów.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const type = searchParams.get('type') || ''
  const status = searchParams.get('status') || ''
  const clientId = searchParams.get('clientId') || ''

  const where: any = {
    AND: [
      type ? { type } : {},
      status ? { status } : {},
      clientId ? { clientId } : {},
      q
        ? {
            OR: [
              { number: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { counterparty: { contains: q, mode: 'insensitive' } },
              { entries: { some: { body: { contains: q, mode: 'insensitive' } } } },
              { entries: { some: { subject: { contains: q, mode: 'insensitive' } } } },
              { documents: { some: { ocrText: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {},
    ],
  }

  const cases = await prisma.case.findMany({
    where,
    include: {
      client: true,
      unit: true,
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { entries: true, documents: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(cases)
}

/**
 * POST /api/cases — utworzenie sprawy. Nadaje sygnaturę (REK/2026/0042) i — dla
 * reklamacji z datą wpływu — domyślny termin +14 dni (rękojmia), edytowalny.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: 'Tytuł sprawy jest wymagany' }, { status: 400 })
  }

  const type = body.type || 'REKLAMACJA'
  const receivedAt = body.receivedAt ? new Date(body.receivedAt) : null
  const deadline = body.deadline ? new Date(body.deadline) : defaultDeadline(type, receivedAt)
  const meta = extractRequestMeta(req)

  // Retry na rzadki wyścig sygnatury (Case.number @unique).
  let created: any = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = await nextCaseNumber(type)
    try {
      created = await prisma.case.create({
        data: {
          number,
          type,
          title: String(body.title).trim(),
          description: body.description || null,
          status: body.status || 'NOWA',
          priority: body.priority || 'SREDNIA',
          clientId: body.clientId || null,
          unitId: body.unitId || null,
          ownerId: body.ownerId || null,
          counterparty: body.counterparty || null,
          receivedAt,
          deadline,
        },
        include: { client: true, unit: true },
      })
      break
    } catch (e: any) {
      if (e?.code === 'P2002' && attempt < 2) continue
      throw e
    }
  }

  void audit({
    action: 'CREATE',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'Case',
    entityId: created.id,
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { number: created.number, type: created.type },
  })

  return NextResponse.json(created, { status: 201 })
}
