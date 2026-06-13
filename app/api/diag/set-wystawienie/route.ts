// TYMCZASOWY, jednorazowy endpoint: ustawia Unit.createdAt (data wystawienia) =
// 2025-10-01 dla WSZYSTKICH lokali. Admin-only + potwierdzenie w URL. Do usunięcia.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'

const TARGET = new Date('2025-10-01T00:00:00.000Z')
const CONFIRM = 'USTAW-2025-10-01'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const confirm = new URL(req.url).searchParams.get('confirm')
  if (confirm !== CONFIRM) {
    return NextResponse.json({
      info: 'Ustawi Unit.createdAt (data wystawienia) = 2025-10-01 dla WSZYSTKICH lokali.',
      howto: `Aby wykonać, otwórz ten sam adres z parametrem: ?confirm=${CONFIRM}`,
    })
  }

  const res = await prisma.unit.updateMany({ data: { createdAt: TARGET } })

  // Szybka weryfikacja: ile sprzedanych lokali ma teraz dodatni czas do sprzedaży.
  const sold = await prisma.unit.findMany({
    where: { status: 'SPRZEDANY' },
    select: {
      createdAt: true,
      soldAt: true,
      contractUnits: { select: { contract: { select: { type: true, status: true, signedAt: true } } } },
    },
  })
  let withSaleDate = 0
  let nowPositive = 0
  let nowNegative = 0
  for (const u of sold) {
    const devSigned = u.contractUnits
      .map((cu) => cu.contract)
      .filter((c) => c.type === 'DEWELOPERSKA' && c.status === 'PODPISANA' && !!c.signedAt)
      .map((c) => c.signedAt as Date)
    const saleDate: Date | null =
      u.soldAt ?? (devSigned.length ? devSigned.reduce((a, b) => (a < b ? a : b)) : null)
    if (!saleDate) continue
    withSaleDate++
    const d = Math.round((saleDate.getTime() - u.createdAt.getTime()) / 86_400_000)
    if (d < 0) nowNegative++
    else nowPositive++
  }

  return NextResponse.json({
    updatedUnits: res.count,
    createdAtSetTo: '2025-10-01',
    check: { soldUnits: sold.length, withSaleDate, nowPositive, nowNegative },
    note:
      nowNegative > 0
        ? `Uwaga: ${nowNegative} sprzedaży jest WCZEŚNIEJSZYCH niż 2025-10-01 — te nadal wypadną. Daj znać, ustawię wcześniejszą datę.`
        : 'OK — wszystkie sprzedaże po 2025-10-01. Widok „co schodzi najszybciej" powinien się wypełnić.',
  })
}
