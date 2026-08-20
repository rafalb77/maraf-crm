import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateProspektDocx } from '@/lib/prospekt-generator'

// GET /api/contracts/[id]/prospekt — prospekt informacyjny .docx dla
// mieszkania z umowy, z ceną ZE SNAPSHOTU umowy (po rabacie); cena za m²
// przeliczona z ceny umownej. Mieszkanie = pierwszy składnik MIESZKALNY
// (ta sama konwencja co generator umowy).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { contractUnits: { include: { unit: true } } },
  })
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })

  const cu = contract.contractUnits.find((x) => x.unit.type === 'MIESZKALNY')
  if (!cu) {
    return NextResponse.json({ error: 'Umowa nie zawiera lokalu mieszkalnego.' }, { status: 400 })
  }

  try {
    const buffer = generateProspektDocx(cu.unit, {
      priceGrossOverride: cu.priceGross ?? undefined,
    })
    const safeNumber = cu.unit.number.replace(/[^a-zA-Z0-9-]/g, '_')
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
