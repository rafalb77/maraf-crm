import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runOcr } from '@/lib/ocr'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cron / catch-up OCR — dobiera dokumenty zaległe (PENDING) i nieudane (FAILED)
 * i uruchamia dla nich OCR sekwencyjnie. Przydatne gdy fire-and-forget z uploadu
 * został przerwany (restart kontenera) albo binaria były chwilowo niedostępne.
 * Chroniony sekretem CASES_CRON_SECRET. Limit partii: ?limit= (domyślnie 20).
 */

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CASES_CRON_SECRET
  if (!secret) return false
  const fromQuery = new URL(req.url).searchParams.get('secret')
  const fromHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return fromQuery === secret || fromHeader === secret
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limitParam = parseInt(new URL(req.url).searchParams.get('limit') || '20', 10)
  const limit = isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100)

  const pending = await prisma.caseDocument.findMany({
    where: { ocrStatus: { in: ['PENDING', 'FAILED'] } },
    select: { id: true },
    orderBy: { uploadedAt: 'asc' },
    take: limit,
  })

  let processed = 0
  for (const d of pending) {
    await runOcr(d.id)
    processed++
  }

  return NextResponse.json({ ok: true, processed, remaining: Math.max(0, pending.length - processed) })
}

export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}
