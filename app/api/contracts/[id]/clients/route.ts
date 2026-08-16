import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Zarządzanie współrezerwującymi/współkupującymi umowy (ContractClient).
// Główny klient umowy (Contract.clientId) nie jest tu ruszany — usuwać/dodawać
// można wyłącznie dodatkowych kupujących. Każda zmiana trafia do historii umowy.
// Uwaga: do wygenerowanej umowy (.docx) trafia PIERWSZY współrezerwujący
// różny od głównego klienta (placeholder client2 w szablonie).

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const clientId = typeof body.clientId === 'string' ? body.clientId : ''
  if (!clientId) return NextResponse.json({ error: 'Brak klienta' }, { status: 400 })

  const [contract, client] = await Promise.all([
    prisma.contract.findUnique({
      where: { id: params.id },
      select: { id: true, clientId: true, status: true, contractClients: { select: { clientId: true, position: true } } },
    }),
    prisma.client.findUnique({ where: { id: clientId }, select: { id: true, firstName: true, lastName: true } }),
  ])
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })
  if (!client) return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 })
  if (clientId === contract.clientId) {
    return NextResponse.json({ error: 'Ten klient jest już głównym kupującym tej umowy.' }, { status: 409 })
  }
  if (contract.contractClients.some((cc) => cc.clientId === clientId)) {
    return NextResponse.json({ error: 'Ten klient jest już dopisany do tej umowy.' }, { status: 409 })
  }

  const maxPosition = contract.contractClients.reduce((m, cc) => Math.max(m, cc.position), 0)
  await prisma.$transaction([
    prisma.contractClient.create({
      data: { contractId: contract.id, clientId, position: maxPosition + 1 },
    }),
    prisma.contractHistory.create({
      data: {
        contractId: contract.id,
        event: 'WSPOLKUPUJACY',
        details: `Dodano: ${client.firstName} ${client.lastName}`,
      },
    }),
  ])

  // Współkupujący na podpisanej umowie = klient na etapie UMOWA (jak przy
  // podpisywaniu w PATCH /api/contracts/[id]); lejka nie cofamy.
  if (contract.status === 'PODPISANA') {
    await prisma.client.updateMany({
      where: { id: clientId, status: { in: ['ZAPYTANIE', 'OFERTA', 'REZERWACJA'] } },
      data: { status: 'UMOWA' },
    })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId') || ''
  if (!clientId) return NextResponse.json({ error: 'Brak klienta' }, { status: 400 })

  const entry = await prisma.contractClient.findUnique({
    where: { contractId_clientId: { contractId: params.id, clientId } },
    include: { client: { select: { firstName: true, lastName: true } } },
  })
  if (!entry) return NextResponse.json({ error: 'Ten klient nie jest dopisany do tej umowy.' }, { status: 404 })

  await prisma.$transaction([
    prisma.contractClient.delete({ where: { id: entry.id } }),
    prisma.contractHistory.create({
      data: {
        contractId: params.id,
        event: 'WSPOLKUPUJACY',
        details: `Usunięto: ${entry.client.firstName} ${entry.client.lastName}`,
      },
    }),
  ])

  return NextResponse.json({ success: true })
}
