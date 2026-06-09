import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateDaneGovCsv } from '@/lib/dane-gov-export'

export const dynamic = 'force-dynamic'

// Cron dzienny — generuje zamrozony snapshot raportu cen dla dane.gov.pl.
// Wywolywany przez Coolify scheduled task raz dziennie. Chroniony sekretem
// DANEGOV_CRON_SECRET (query ?secret= albo naglowek Authorization: Bearer).
// Idempotentny — ponowne uruchomienie tego samego dnia nadpisuje snapshot.

function todayWarsaw(): string {
  // sv-SE daje YYYY-MM-DD
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date())
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.DANEGOV_CRON_SECRET
  if (!secret) return false
  const fromQuery = new URL(req.url).searchParams.get('secret')
  const fromHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return fromQuery === secret || fromHeader === secret
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = todayWarsaw()
  const { csv, md5, rowCount } = await generateDaneGovCsv(date)

  await prisma.daneGovSnapshot.upsert({
    where: { date },
    create: { date, csv, md5, rowCount },
    update: { csv, md5, rowCount },
  })

  return NextResponse.json({ ok: true, date, rowCount, md5 })
}
