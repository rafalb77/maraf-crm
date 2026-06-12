// TYMCZASOWY endpoint diagnostyczny dla widoku „Co schodzi najszybciej".
// Admin-only. Do usunięcia po diagnozie. Zwraca agregaty (bez PII klientów).
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'

const daysBetween = (later: Date, earlier: Date) =>
  Math.round((later.getTime() - earlier.getTime()) / 86_400_000)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rozkład wszystkich umów po typie + statusie (czy w ogóle są deweloperskie podpisane?)
  const grouped = await prisma.contract.groupBy({
    by: ['type', 'status'],
    _count: true,
  })
  const contractsByTypeStatus = grouped
    .map((g) => ({ type: g.type, status: g.status, count: g._count }))
    .sort((a, b) => b.count - a.count)

  // Lokale SPRZEDANY + ich powiązane umowy
  const soldUnits = await prisma.unit.findMany({
    where: { status: 'SPRZEDANY' },
    select: {
      number: true,
      type: true,
      createdAt: true,
      soldAt: true,
      contractUnits: {
        select: { contract: { select: { type: true, status: true, signedAt: true } } },
      },
    },
  })

  let withManualSoldAt = 0
  let withDevContractSigned = 0
  let withAnySaleDate = 0
  let excludedByNegativeDays = 0
  let wouldShow = 0
  const sampleExcludedNegative: unknown[] = []
  const sampleNoSaleDate: unknown[] = []
  let withAnyContractLink = 0

  for (const u of soldUnits) {
    if (u.contractUnits.length) withAnyContractLink++

    const devSigned = u.contractUnits
      .map((cu) => cu.contract)
      .filter((c) => c.type === 'DEWELOPERSKA' && c.status === 'PODPISANA' && !!c.signedAt)
      .map((c) => c.signedAt as Date)

    if (u.soldAt) withManualSoldAt++
    if (devSigned.length) withDevContractSigned++

    const saleDate: Date | null =
      u.soldAt ?? (devSigned.length ? devSigned.reduce((a, b) => (a < b ? a : b)) : null)

    if (saleDate) {
      withAnySaleDate++
      const d = daysBetween(saleDate, u.createdAt)
      if (d < 0) {
        excludedByNegativeDays++
        if (sampleExcludedNegative.length < 5)
          sampleExcludedNegative.push({ number: u.number, createdAt: u.createdAt, saleDate, days: d })
      } else {
        wouldShow++
      }
    } else if (sampleNoSaleDate.length < 5) {
      sampleNoSaleDate.push({
        number: u.number,
        linkedContracts: u.contractUnits.map((cu) => ({
          type: cu.contract.type,
          status: cu.contract.status,
          signedAt: cu.contract.signedAt,
        })),
      })
    }
  }

  return NextResponse.json({
    soldUnitsTotal: soldUnits.length,
    withAnyContractLink,
    withDevContractSigned,
    withManualSoldAt,
    withAnySaleDate,
    excludedByNegativeDays,
    wouldShow, // <-- ile faktycznie pojawi się w „Co schodzi najszybciej"
    contractsByTypeStatus,
    sampleExcludedNegative,
    sampleNoSaleDate,
  })
}
