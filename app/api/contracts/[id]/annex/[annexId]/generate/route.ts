import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateAnnexDocx } from '@/lib/contract-generator'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** GET /api/contracts/[id]/annex/[annexId]/generate — pobiera .docx aneksu. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; annexId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      contractClients: { include: { client: true }, orderBy: { position: 'asc' } },
      contractUnits: { include: { unit: true } },
    },
  })
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })

  const annex = await prisma.contractAnnex.findUnique({
    where: { id: params.annexId },
    include: { units: { include: { unit: true } } },
  })
  if (!annex || annex.contractId !== contract.id) {
    return NextResponse.json({ error: 'Nie znaleziono aneksu' }, { status: 404 })
  }

  try {
    const buffer = await generateAnnexDocx(contract as any, {
      number: annex.number,
      signedAt: annex.signedAt,
      units: annex.units,
    })
    const safe = (annex.number || annex.id).replace(/[^a-zA-Z0-9-]/g, '_')
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': DOCX_MIME,
        'Content-Disposition': `attachment; filename="aneks_${safe}.docx"`,
      },
    })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message || 'Błąd generowania aneksu' }, { status: 500 })
  }
}
