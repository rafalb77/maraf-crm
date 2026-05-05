import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateContractDocx } from '@/lib/contract-generator'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (contract.type !== 'REZERWACYJNA') {
    return NextResponse.json(
      { error: 'Generowanie z szablonu dostępne na razie tylko dla umów rezerwacyjnych' },
      { status: 400 },
    )
  }

  try {
    const buffer = await generateContractDocx(contract)
    const safeNumber = contract.number.replace(/[^a-zA-Z0-9-]/g, '_')
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="umowa_${safeNumber}.docx"`,
      },
    })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message || 'Błąd generowania' }, { status: 500 })
  }
}
