import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    totalUnits,
    unitsByStatus,
    totalClients,
    clientsByStatus,
    openServiceRequests,
    recentActivities,
    recentClients,
  ] = await Promise.all([
    prisma.unit.count(),
    prisma.unit.groupBy({ by: ['status'], _count: true }),
    prisma.client.count(),
    prisma.client.groupBy({ by: ['status'], _count: true }),
    prisma.serviceRequest.count({ where: { status: { not: 'ZAKONCZONE' } } }),
    prisma.activity.findMany({
      take: 10,
      orderBy: { date: 'desc' },
      include: { client: true },
    }),
    prisma.client.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { clientUnits: { include: { unit: true } } },
    }),
  ])

  const unitStats = Object.fromEntries(unitsByStatus.map((u) => [u.status, u._count]))
  const clientStats = Object.fromEntries(clientsByStatus.map((c) => [c.status, c._count]))

  return NextResponse.json({
    units: {
      total: totalUnits,
      wolne: unitStats['WOLNY'] || 0,
      zarezerwowane: unitStats['ZAREZERWOWANY'] || 0,
      sprzedane: unitStats['SPRZEDANY'] || 0,
      niedostepne: unitStats['NIEDOSTEPNY'] || 0,
    },
    clients: {
      total: totalClients,
      zapytanie: clientStats['ZAPYTANIE'] || 0,
      oferta: clientStats['OFERTA'] || 0,
      rezerwacja: clientStats['REZERWACJA'] || 0,
      umowa: clientStats['UMOWA'] || 0,
      odbior: clientStats['ODBIOR'] || 0,
    },
    openServiceRequests,
    recentActivities,
    recentClients,
  })
}
