import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateDaneGovCsv } from '@/lib/dane-gov-export'

export const dynamic = 'force-dynamic'

// Panel admina dla raportowania dane.gov.pl — lista snapshotow + reczne
// wygenerowanie snapshotu na dzis (poza cronem, np. do testu).

function todayWarsaw(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date())
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const snapshots = await prisma.daneGovSnapshot.findMany({
    orderBy: { date: 'desc' },
    select: { date: true, md5: true, rowCount: true, createdAt: true },
    take: 60,
  })
  const latest = await prisma.daneGovSnapshot.findFirst({
    orderBy: { date: 'desc' },
    select: { date: true, csv: true },
  })
  // Podglad: naglowek + pierwsze 5 wierszy danych.
  const preview = latest
    ? { date: latest.date, lines: latest.csv.split('\r\n').slice(0, 6) }
    : null

  return NextResponse.json({ snapshots, preview })
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = todayWarsaw()
  const { csv, md5, rowCount } = await generateDaneGovCsv(date)
  await prisma.daneGovSnapshot.upsert({
    where: { date },
    create: { date, csv, md5, rowCount },
    update: { csv, md5, rowCount },
  })

  return NextResponse.json({ ok: true, date, rowCount, md5 })
}
