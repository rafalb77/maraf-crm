import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateProspektDocx } from '@/lib/prospekt-generator'

// GET /api/units/[id]/prospekt — prospekt informacyjny .docx dla mieszkania.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unit = await prisma.unit.findUnique({ where: { id: params.id } })
  if (!unit) return NextResponse.json({ error: 'Nie znaleziono lokalu' }, { status: 404 })
  if (unit.type !== 'MIESZKALNY') {
    return NextResponse.json({ error: 'Prospekt informacyjny generujemy tylko dla lokali mieszkalnych.' }, { status: 400 })
  }

  try {
    const buffer = generateProspektDocx(unit)
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
