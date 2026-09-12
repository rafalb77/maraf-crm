import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getInvestmentStructure } from '@/lib/odbiory/sheets'
import { json, jsonError, requireUser } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/odbiory/structure?investmentId=… — dane do kreatora odbioru:
 * inwestycje, struktura Budynek → Klatka → Kondygnacja (z Unit + markers.json),
 * wykonawcy i użytkownicy (książka projektu do listy obecnych).
 */
export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)

  const investments = await prisma.investment.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, status: true },
  })
  const requested = req.nextUrl.searchParams.get('investmentId')
  const chosen = investments.find((i) => i.id === requested) || investments[0] || null
  const [structure, subcontractors, users] = await Promise.all([
    chosen ? getInvestmentStructure(chosen.id) : Promise.resolve(null),
    prisma.subcontractor.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, contactName: true, phone: true },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
  ])
  return json({ investments, structure, subcontractors, users })
}
