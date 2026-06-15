import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeReservationFee, findClientUnitConflict } from '@/lib/contract-pricing'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { items: true, client: true },
  })
  if (!offer) return NextResponse.json({ error: 'Nie znaleziono oferty' }, { status: 404 })
  if (!offer.clientId) {
    return NextResponse.json({ error: 'Oferta nie ma przypisanego klienta — nie można utworzyć umowy' }, { status: 400 })
  }
  const unitIds = offer.items.map((it) => it.unitId).filter(Boolean) as string[]
  if (unitIds.length === 0) {
    return NextResponse.json({ error: 'Oferta nie zawiera lokali z bazy (tylko niestandardowe pozycje)' }, { status: 400 })
  }

  // Ustal numer umowy: UR/RRRR/MM/NNN
  const now = new Date()
  const yearMonth = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastThisMonth = await prisma.contract.findFirst({
    where: { number: { startsWith: `UR/${yearMonth}/` } },
    orderBy: { createdAt: 'desc' },
  })
  let seq = 1
  if (lastThisMonth?.number) {
    const last = parseInt(lastThisMonth.number.split('/').pop() || '0', 10)
    seq = (isNaN(last) ? 0 : last) + 1
  }
  const number = `UR/${yearMonth}/${String(seq).padStart(3, '0')}`

  // Settings — nazwa inwestycji
  const inv = await prisma.settings.findUnique({ where: { key: 'investmentName' } })
  const investmentName = inv?.value || 'Inwestycja'

  // Dedup: klient już ma aktywną umowę z którymś z tych lokali?
  const conflict = await findClientUnitConflict(offer.clientId, unitIds)
  if (conflict) {
    return NextResponse.json(
      {
        error: `Klient ma już aktywną umowę ${conflict.number} z lokalem ${conflict.units.join(', ')}. Nie tworzę drugiej z tej oferty.`,
        conflictContractId: conflict.id,
      },
      { status: 409 },
    )
  }

  // Snapshot cen z pozycji oferty (po rabacie) + opłata rezerwacyjna 1%.
  const itemByUnit = new Map(offer.items.filter((it) => it.unitId).map((it) => [it.unitId as string, it]))
  const contractUnitsData = unitIds.map((uid) => {
    const it = itemByUnit.get(uid)
    return { unitId: uid, priceNet: it?.finalNet ?? null, priceGross: it?.finalGross ?? null }
  })
  const reservationFee = computeReservationFee(offer.totalGross)

  // Utwórz umowę + powiązania + zarezerwuj lokale.
  // Bez wpisu contractClients dla głównego klienta — to on jest contract.client;
  // współrezerwujący doda się osobno (oferta ma jednego klienta).
  const contract = await prisma.contract.create({
    data: {
      number,
      type: 'REZERWACYJNA',
      status: 'W_PRZYGOTOWANIU',
      investmentName,
      clientId: offer.clientId,
      valueNet: offer.totalNet,
      valueGross: offer.totalGross,
      discount: offer.totalDiscountGross || null,
      reservationFee,
      reservationFeeDays: 7,
      notes: `Utworzono na podstawie oferty ${offer.number}.${offer.notes ? '\n\n' + offer.notes : ''}`,
      contractUnits: { create: contractUnitsData },
      stages: { create: { stage: 'REZERWACYJNA', status: 'W_PRZYGOTOWANIU' } },
      history: {
        create: [{ event: 'UTWORZONA', details: `Z oferty ${offer.number}` }],
      },
    },
  })

  // Lokale → status ZAREZERWOWANY
  await prisma.unit.updateMany({
    where: { id: { in: unitIds }, status: { in: ['WOLNY', 'ZAREZERWOWANY'] } },
    data: { status: 'ZAREZERWOWANY', reservationType: 'REZERWACJA' },
  })

  // Klient → status REZERWACJA
  await prisma.client.update({ where: { id: offer.clientId }, data: { status: 'REZERWACJA' } })

  // Aktywność klienta
  await prisma.activity.create({
    data: {
      clientId: offer.clientId,
      type: 'DOKUMENT',
      title: `Utworzono umowę rezerwacyjną ${contract.number}`,
      content: `Z oferty ${offer.number}, wartość brutto: ${offer.totalGross.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`,
    },
  })

  // Status oferty: zaakceptowana (jeśli nie była)
  if (offer.status !== 'ZAAKCEPTOWANA') {
    await prisma.offer.update({ where: { id: offer.id }, data: { status: 'ZAAKCEPTOWANA' } })
  }

  return NextResponse.json({ contractId: contract.id, contractNumber: contract.number })
}
