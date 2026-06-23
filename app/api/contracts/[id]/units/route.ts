import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateContractUnits } from '@/lib/contracts'
import { computeReservationFee, findClientUnitConflict } from '@/lib/contract-pricing'
import type { ContractType, UnitType } from '@/lib/types'

/**
 * PUT /api/contracts/[id]/units — edycja składników umowy.
 *
 * Body: { units: [{ unitId, priceGross }] } — DOCELOWY zestaw lokali z cenami
 * brutto po rabacie (snapshot na umowie). Cena netto pochodna wg VAT lokalu.
 *
 * - przelicza wartość umowy (valueNet/valueGross) i opłatę rezerwacyjną (1%),
 * - synchronizuje twardą rezerwację lokali: dodane → ZAREZERWOWANY/REZERWACJA
 *   (reservedById = klient umowy), usunięte → WOLNY (o ile były zarezerwowane
 *   tą umową i nie są w innej aktywnej umowie),
 * - blokuje dołożenie lokalu, który jest już w INNEJ aktywnej umowie klienta.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    select: {
      id: true, type: true, status: true, clientId: true,
      contractUnits: { select: { unitId: true, priceNet: true, priceGross: true } },
    },
  })
  if (!contract) return NextResponse.json({ error: 'Nie znaleziono umowy' }, { status: 404 })
  // Składniki edytujemy TYLKO w umowie w przygotowaniu — podpisana to zamrożony
  // snapshot (DOCX), a rozwiązana/anulowana zwolniła lokale (edycja by je wskrzesiła).
  if (contract.status !== 'W_PRZYGOTOWANIU') {
    return NextResponse.json(
      { error: 'Składniki można edytować tylko w umowie o statusie „w przygotowaniu".' },
      { status: 409 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const rawUnits: { unitId?: string; priceGross?: unknown }[] = Array.isArray(body.units) ? body.units : []
  // Dedup wewnętrzny + walidacja unitId.
  const wanted = new Map<string, number>()
  for (const r of rawUnits) {
    if (!r.unitId) continue
    const g = Number(r.priceGross)
    wanted.set(r.unitId, Number.isFinite(g) && g >= 0 ? g : NaN)
  }
  const unitIds = [...wanted.keys()]

  // Umowa musi mieć co najmniej jeden lokal (pusty zestaw zerowałby umowę).
  if (unitIds.length === 0) {
    return NextResponse.json({ error: 'Umowa musi zawierać co najmniej jeden lokal.' }, { status: 400 })
  }
  // Ceny muszą być poprawne (nie podstawiamy po cichu ceny bazowej przy zapisie).
  for (const g of wanted.values()) {
    if (!Number.isFinite(g)) {
      return NextResponse.json({ error: 'Niepoprawna cena lokalu.' }, { status: 400 })
    }
  }

  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds } },
    select: { id: true, type: true, status: true, vatRate: true, priceNet: true, priceGross: true, reservationType: true, reservedById: true },
  })
  if (units.length !== unitIds.length) {
    return NextResponse.json({ error: 'Nie znaleziono wszystkich lokali' }, { status: 400 })
  }

  // Walidacja składu (limity umowy rezerwacyjnej).
  const validationError = validateContractUnits(
    contract.type as ContractType,
    units.map((u) => ({ type: u.type as UnitType })),
  )
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  // Dedup: dokładany lokal nie może być w INNEJ aktywnej umowie tego klienta.
  const prevUnitIds = new Set(contract.contractUnits.map((cu) => cu.unitId))
  const addedUnitIds = unitIds.filter((id) => !prevUnitIds.has(id))
  const conflict = await findClientUnitConflict(contract.clientId, addedUnitIds, contract.id)
  if (conflict) {
    return NextResponse.json(
      { error: `Lokal ${conflict.units.join(', ')} jest już w aktywnej umowie ${conflict.number} tego klienta.`, conflictContractId: conflict.id },
      { status: 409 },
    )
  }

  // Re-walidacja dostępności DOKŁADANYCH lokali po stronie serwera (nie ufamy
  // filtrowi z dropdownu — lokal mógł zostać sprzedany/zarezerwowany w międzyczasie).
  const blocked = units.find(
    (u) =>
      addedUnitIds.includes(u.id) &&
      (u.status === 'SPRZEDANY' ||
        u.status === 'NIEDOSTEPNY' ||
        (u.reservationType === 'REZERWACJA' && u.reservedById != null && u.reservedById !== contract.clientId)),
  )
  if (blocked) {
    return NextResponse.json(
      { error: 'Któryś z dokładanych lokali jest niedostępny (sprzedany lub zarezerwowany przez innego klienta).' },
      { status: 409 },
    )
  }

  // Wyceny snapshot: brutto z body (fallback cena bazowa), netto pochodne wg VAT.
  let totalNet = 0
  let totalGross = 0
  const unitById = new Map(units.map((u) => [u.id, u]))
  const existingByUnit = new Map(contract.contractUnits.map((cu) => [cu.unitId, cu]))
  const snapshot = unitIds.map((unitId) => {
    const u = unitById.get(unitId)!
    const wantedGross = wanted.get(unitId)!
    const priceGross = Math.round((Number.isFinite(wantedGross) && wantedGross >= 0 ? wantedGross : u.priceGross) * 100) / 100
    const existing = existingByUnit.get(unitId)
    // Brutto bez zmian → zachowaj oryginalne netto ze snapshotu (mogło pochodzić
    // z oferty, gdzie netto nie jest dokładnie brutto/(1+VAT)). Inaczej licz z VAT.
    let priceNet: number
    if (existing && existing.priceGross != null && existing.priceNet != null && Math.abs(existing.priceGross - priceGross) < 0.005) {
      priceNet = existing.priceNet
    } else {
      const vat = (u.vatRate ?? 8) / 100
      priceNet = Math.round((priceGross / (1 + vat)) * 100) / 100
    }
    totalNet += priceNet
    totalGross += priceGross
    return { unitId, priceNet, priceGross }
  })
  const reservationFee = computeReservationFee(totalGross)

  const removedUnitIds = [...prevUnitIds].filter((id) => !wanted.has(id))

  // Lokale do zwolnienia: usunięte, twardo zarezerwowane tą umową (klient),
  // i nieobecne w żadnej innej aktywnej umowie.
  let releasableIds: string[] = []
  if (removedUnitIds.length) {
    const stillUsed = await prisma.contractUnit.findMany({
      where: {
        unitId: { in: removedUnitIds },
        contractId: { not: contract.id },
        contract: { status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] } },
      },
      select: { unitId: true },
    })
    const stillUsedSet = new Set(stillUsed.map((cu) => cu.unitId))
    const removedUnits = await prisma.unit.findMany({
      where: { id: { in: removedUnitIds } },
      select: { id: true, reservationType: true, reservedById: true },
    })
    releasableIds = removedUnits
      .filter((u) => !stillUsedSet.has(u.id) && u.reservationType === 'REZERWACJA' && u.reservedById === contract.clientId)
      .map((u) => u.id)
  }

  await prisma.$transaction(async (tx) => {
    // Zamień zestaw składników: usuń stare, dołóż nowe ze snapshotem.
    await tx.contractUnit.deleteMany({ where: { contractId: contract.id } })
    for (const s of snapshot) {
      await tx.contractUnit.create({
        data: { contractId: contract.id, unitId: s.unitId, priceNet: s.priceNet, priceGross: s.priceGross },
      })
    }

    // Twarda rezerwacja dołożonych lokali.
    if (addedUnitIds.length) {
      await tx.unit.updateMany({
        where: { id: { in: addedUnitIds } },
        data: { status: 'ZAREZERWOWANY', reservationType: 'REZERWACJA', reservationExpiresAt: null, reservedById: contract.clientId },
      })
    }
    // Zwolnienie usuniętych (bezpieczne).
    if (releasableIds.length) {
      await tx.unit.updateMany({
        where: { id: { in: releasableIds } },
        data: { status: 'WOLNY', reservationType: null, reservationExpiresAt: null, reservedById: null },
      })
    }

    await tx.contract.update({
      where: { id: contract.id },
      data: {
        valueNet: Math.round(totalNet * 100) / 100,
        valueGross: Math.round(totalGross * 100) / 100,
        reservationFee,
        history: { create: { event: 'EDYCJA_SKLADNIKOW', details: `Składniki zaktualizowane (${snapshot.length} lok., wartość ${Math.round(totalGross * 100) / 100} zł)` } },
      },
    })
  })

  return NextResponse.json({ success: true })
}
