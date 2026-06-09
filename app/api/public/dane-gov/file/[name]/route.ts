import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Publiczny (bez sesji) serwis zamrozonych dziennych snapshotow dla harvestera
// dane.gov.pl. URL-e:
//   /api/public/dane-gov/file/2026-05-15.csv      -> plik CSV
//   /api/public/dane-gov/file/2026-05-15.csv.md5  -> suma MD5 (weryfikacja integralnosci)

export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  const name = params.name
  const md5Match = name.endsWith('.csv.md5')
  const csvMatch = name.endsWith('.csv')
  const date = name.replace(/\.csv(\.md5)?$/, '')

  if ((!md5Match && !csvMatch) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const snapshot = await prisma.daneGovSnapshot.findUnique({ where: { date } })
  if (!snapshot) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (md5Match) {
    return new NextResponse(snapshot.md5, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new NextResponse(snapshot.csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `inline; filename="${date}_ceny-ofertowe-mieszkan.csv"`,
    },
  })
}
