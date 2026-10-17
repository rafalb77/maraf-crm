/* eslint-disable */
/**
 * Diagnostyka rezerwacji MIĘKKICH (Unit.reservationType = 'MIEKKA') wobec umów.
 * Domyślnie TYLKO ODCZYT. Dla każdego lokalu z rezerwacją miękką pokazuje
 * klienta, termin wygaśnięcia, umowy tego klienta (z etapami) i klasyfikuje:
 *
 *   [A] lokal jest składnikiem PODPISANEJ umowy, a nadal ma rezerwację miękką
 *       — niespójność: po podpisaniu lokal powinien być ZAREZERWOWANY/REZERWACJA
 *       (umowa rezerwacyjna) albo SPRZEDANY (deweloperska). Zdarza się po
 *       imporcie z Excela (lokale importowano jako miękkie) i gdy status
 *       umowy ustawiono inną drogą niż „Oznacz jako podpisaną".
 *   [B] lokal jest na umowie W_PRZYGOTOWANIU, która ma w osi etapów datę
 *       podpisania (ołówek przy etapie) — umowa wygląda na podpisaną, ale
 *       formalnie nie jest: trzeba „Oznacz jako podpisaną" na karcie umowy.
 *   [E] lokal jest na umowie W_PRZYGOTOWANIU bez żadnej daty podpisania —
 *       w systemie umowa nie jest podpisana (choć papier może być): „Oznacz
 *       jako podpisaną" na karcie umowy. Miękka po terminie nie wygasa sama,
 *       bo strażnik w lib/reservations.ts chroni lokale na aktywnych umowach.
 *   [C] klient ma aktywną umowę, ale TEN lokal nie jest jej składnikiem —
 *       osobna rezerwacja miękka (np. dodatkowe miejsce postojowe); zwykle
 *       zamierzona, do decyzji.
 *   [D] zwykła rezerwacja miękka bez umowy (informacyjnie: termin, po terminie?).
 *
 * --apply naprawia TYLKO przypadki [A]: lokal dostaje stan wg etapu umowy
 * (REZERWACYJNA → ZAREZERWOWANY/REZERWACJA, DEWELOPERSKA/PRZENIESIENIA →
 * SPRZEDANY) i dopisuje historię umowy — czyli dokładnie to, co z lokalem
 * robi „Oznacz jako podpisaną" (powiązania ClientUnit nie rusza, tak jak ona).
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/diagnose-soft-reservations.js              # podgląd
 *   node scripts/diagnose-soft-reservations.js --apply      # naprawa [A]
 *   node scripts/diagnose-soft-reservations.js --client=Czwonda   # filtr po nazwisku
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const apply = process.argv.includes('--apply')
const clientArg = process.argv.find((a) => a.startsWith('--client='))
const clientFilter = clientArg ? clientArg.split('=')[1].toLowerCase() : null

const fmtDT = (d) => (d ? new Date(d).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', hour12: false }) : '—')
const fmtD = (d) => (d ? new Date(d).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) : '—')

function unitStateForStage(stage, clientId) {
  if (stage === 'DEWELOPERSKA' || stage === 'PRZENIESIENIA') {
    return { status: 'SPRZEDANY', reservationType: null, reservationExpiresAt: null, reservedById: null }
  }
  return { status: 'ZAREZERWOWANY', reservationType: 'REZERWACJA', reservationExpiresAt: null, reservedById: clientId }
}

async function main() {
  const now = new Date()
  const soft = await prisma.unit.findMany({
    where: { reservationType: 'MIEKKA' },
    orderBy: { number: 'asc' },
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      reservationExpiresAt: true,
      reservedById: true,
      updatedAt: true,
      clientUnits: { select: { clientId: true, assignedAt: true } },
      contractUnits: {
        select: {
          contract: {
            select: {
              id: true,
              number: true,
              type: true,
              status: true,
              signedAt: true,
              clientId: true,
              client: { select: { firstName: true, lastName: true } },
              stages: { select: { stage: true, status: true, signedAt: true } },
            },
          },
        },
      },
    },
  })
  const clientIds = [...new Set(soft.map((u) => u.reservedById).filter(Boolean))]
  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      contracts: {
        where: { status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] } },
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          signedAt: true,
          stages: { select: { stage: true, status: true, signedAt: true } },
          contractUnits: { select: { unitId: true, unit: { select: { number: true, status: true, reservationType: true } } } },
        },
      },
      contractClients: {
        select: { contract: { select: { number: true, type: true, status: true } } },
      },
    },
  })
  const clientById = new Map(clients.map((c) => [c.id, c]))

  console.log(`Rezerwacje miękkie: ${soft.length} lokali (stan ${fmtDT(now)})${clientFilter ? `, filtr klienta „${clientFilter}”` : ''}\n`)
  const counts = { A: 0, B: 0, C: 0, D: 0 }
  const toFix = []

  for (const u of soft) {
    const client = u.reservedById ? clientById.get(u.reservedById) : null
    const clientName = client ? `${client.lastName} ${client.firstName}` : u.reservedById ? `(klient ${u.reservedById} — nie istnieje)` : '(bez klienta)'
    if (clientFilter && !clientName.toLowerCase().includes(clientFilter)) continue

    const expired = u.reservationExpiresAt && u.reservationExpiresAt < now
    const onContracts = u.contractUnits.map((cu) => cu.contract).filter((c) => c.status !== 'ROZWIAZANA' && c.status !== 'ANULOWANA')
    const signedOn = onContracts.filter((c) => c.status === 'PODPISANA')
    const prepWithSignedStage = onContracts.filter(
      (c) => c.status === 'W_PRZYGOTOWANIU' && c.stages.some((s) => s.stage === c.type && (s.signedAt || s.status === 'PODPISANA')),
    )
    const clientContractsElsewhere = client
      ? client.contracts.filter((c) => !c.contractUnits.some((cu) => cu.unitId === u.id))
      : []

    const prepNoDate = onContracts.filter((c) => c.status === 'W_PRZYGOTOWANIU' && !prepWithSignedStage.includes(c))
    let cat = 'D'
    if (signedOn.length) cat = 'A'
    else if (prepWithSignedStage.length) cat = 'B'
    else if (prepNoDate.length) cat = 'E'
    else if (clientContractsElsewhere.length) cat = 'C'
    counts[cat] = (counts[cat] || 0) + 1

    console.log(`[${cat}] ${u.number.padEnd(10)} ${u.type.padEnd(10)} status=${u.status.padEnd(13)} miękka do ${fmtD(u.reservationExpiresAt)}${expired ? ' (PO TERMINIE)' : ''}  klient: ${clientName}${client ? ` [${client.status}]` : ''}  (zmiana lokalu ${fmtDT(u.updatedAt)})`)
    for (const c of onContracts) {
      const st = c.stages.map((s) => `${s.stage}:${s.status}${s.signedAt ? '@' + fmtD(s.signedAt) : ''}`).join(', ')
      console.log(`       na umowie ${c.number} [${c.type}/${c.status}${c.signedAt ? ', podpisana ' + fmtD(c.signedAt) : ''}] klient umowy: ${c.client ? c.client.lastName + ' ' + c.client.firstName : '—'}; etapy: ${st}`)
    }
    for (const c of clientContractsElsewhere) {
      const units = c.contractUnits.map((cu) => `${cu.unit.number}(${cu.unit.status}/${cu.unit.reservationType || '—'})`).join(', ')
      console.log(`       inna umowa klienta ${c.number} [${c.type}/${c.status}${c.signedAt ? ', podpisana ' + fmtD(c.signedAt) : ''}] — lokale: ${units}`)
    }
    if (client && client.contractClients.length) {
      console.log(`       współkupujący na: ${client.contractClients.map((cc) => `${cc.contract.number} [${cc.contract.type}/${cc.contract.status}]`).join(', ')}`)
    }
    if (cat === 'A') {
      const c = signedOn[0]
      const target = unitStateForStage(c.type, c.clientId)
      console.log(`       → NAPRAWA: lokal powinien być ${target.status}${target.reservationType ? '/' + target.reservationType : ''} (wg etapu ${c.type} umowy ${c.number})`)
      toFix.push({ unit: u, contract: c, target })
    } else if (cat === 'B') {
      console.log(`       → umowa ${prepWithSignedStage[0].number} ma datę podpisania w osi etapów, ale status W_PRZYGOTOWANIU — na karcie umowy użyj „Oznacz jako podpisaną” (ustawi lokal i status klienta)`)
    } else if (cat === 'E') {
      console.log(`       → umowa ${prepNoDate[0].number} jest W PRZYGOTOWANIU bez żadnej daty podpisania: w systemie NIE jest podpisana. Jeśli papier jest podpisany — na karcie umowy „Oznacz jako podpisaną” z datą (lokal stanie się rezerwacją twardą, klient → Umowa). Miękka po terminie nie wygasa sama, bo lokal jest na aktywnej umowie.`)
    } else if (cat === 'C') {
      console.log(`       → ten lokal nie jest na umowie klienta — osobna rezerwacja miękka (dodać do umowy przez „Edytuj składniki” albo zwolnić)`)
    }
    console.log('')
  }

  console.log(
    `Podsumowanie: [A] na podpisanej umowie: ${counts.A}, [B] umowa z datą w osi, ale W_PRZYGOTOWANIU: ${counts.B}, [E] umowa W_PRZYGOTOWANIU bez daty: ${counts.E || 0}, [C] lokal poza umową klienta: ${counts.C}, [D] zwykłe miękkie bez umowy: ${counts.D}.`,
  )

  if (toFix.length && apply) {
    for (const { unit, contract, target } of toFix) {
      await prisma.$transaction([
        prisma.unit.update({ where: { id: unit.id }, data: { ...target, reservationAlertsMuted: false } }),
        prisma.contractHistory.create({
          data: {
            contractId: contract.id,
            event: 'KOREKTA',
            details: `Lokal ${unit.number}: rezerwacja miękka → ${target.status}${target.reservationType ? '/' + target.reservationType : ''} wg podpisanej umowy (skrypt diagnose-soft-reservations)`,
          },
        }),
      ])
      console.log(`naprawiono ${unit.number} → ${target.status}${target.reservationType ? '/' + target.reservationType : ''} (umowa ${contract.number})`)
    }
  } else if (toFix.length) {
    console.log(`DRY-RUN: ${toFix.length} lokali do naprawy [A]. Uruchom z --apply, aby ustawić stan lokali wg podpisanych umów.`)
  }
}

main()
  .catch((e) => {
    console.error('BŁĄD:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
