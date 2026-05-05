import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contracts = await prisma.subContract.findMany({
    where: { status: { not: 'ANULOWANA' } },
    include: { subcontractor: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(
    contracts.map((c) => ({
      id: c.id,
      title: c.title,
      subName: c.subcontractor.name,
      retentionPct: c.retentionPct,
    })),
  )
}
