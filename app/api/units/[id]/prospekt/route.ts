import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateProspektDocx } from '@/lib/prospekt-generator'

// GET /api/units/[id]/prospekt[?priceGross=…] — prospekt informacyjny .docx dla
// mieszkania. Domyślnie cena z cennika; `priceGross` = cena końcowa brutto po
// rabacie (np. z kalkulatora oferty) — prospekt liczy wtedy cenę za m² z niej.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unit = await prisma.unit.findUnique({ where: { id: params.id } })
  if (!unit) return NextResponse.json({ error: 'Nie znaleziono lokalu' }, { status: 404 })
  if (unit.type !== 'MIESZKALNY') {
    return NextResponse.json({ error: 'Prospekt informacyjny generujemy tylko dla lokali mieszkalnych.' }, { status: 400 })
  }

  const priceRaw = req.nextUrl.searchParams.get('priceGross')
  let priceGrossOverride: number | undefined
  if (priceRaw !== null) {
    const n = Number(priceRaw)
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: 'priceGross musi być dodatnią kwotą brutto.' }, { status: 400 })
    }
    priceGrossOverride = Math.round(n * 100) / 100
  }

  try {
    const buffer = generateProspektDocx(unit, priceGrossOverride != null ? { priceGrossOverride } : undefined)
    const safeNumber = unit.number.replace(/[^a-zA-Z0-9-]/g, '_')
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="prospekt_${safeNumber}.docx"`,
      },
    })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message || 'Błąd generowania' }, { status: 500 })
  }
}
