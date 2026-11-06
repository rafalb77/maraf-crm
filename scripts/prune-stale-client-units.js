/* eslint-disable */
/**
 * Zalegające wpisy portfela (ClientUnit): klient ma lokal „przypisany", choć lokal
 * ma już inną stronę — jest na aktywnej umowie innego klienta (klient główny /
 * współkupujący) albo trzyma go rezerwacja kogoś innego (Unit.reservedById).
 * Taki wpis pokazuje klienta w „Przypisani klienci" na karcie lokalu i w jego
 * portfelu, a przy tworzeniu umowy z karty klienta wchodził do składników
 * (MP.21 u Czwondy, 11.2026). Lokale bez znanej strony (wolne, sprzedane bez
 * umowy w systemie) NIE są ruszane.
 *
 * Od 06.11.2026 aplikacja czyści takie wpisy sama (podpisanie / awans etapu,
 * edycja składników, aneks, anulowanie umowy) — ten skrypt sprząta zaszłości.
 *
 *   node scripts/prune-stale-client-units.js           # podgląd (nic nie zmienia)
 *   node scripts/prune-stale-client-units.js --apply   # usunięcie wpisów
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')
const fmtDT = (d) => (d ? new Date(d).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', hour12: false }) : '—')
const personName = (c) => (c ? `${c.lastName} ${c.firstName}` : '—')

async function main() {
  const units = await prisma.unit.findMany({
    where: { clientUnits: { some: {} } },
    select: {
      id: true,
      number: true,
      status: true,
      reservationType: true,
      reservedById: true,
      clientUnits: { select: { clientId: true, assignedAt: true, client: { select: { firstName: true, lastName: true } } } },
      contractUnits: {
        where: { contract: { status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] } } },
        select: {
          contract: {
            select: {
              number: true, type: true, status: true, clientId: true,
              client: { select: { firstName: true, lastName: true } },
              contractClients: { select: { clientId: true } },
            },
          },
        },
      },
    },
    orderBy: { number: 'asc' },
  })
  const holderIds = Array.from(new Set(units.map((u) => u.reservedById).filter(Boolean)))
  const holders = new Map((await prisma.client.findMany({ where: { id: { in: holderIds } }, select: { id: true, firstName: true, lastName: true } })).map((c) => [c.id, c]))

  let stale = 0
  let skippedUnknown = 0
  for (const u of units) {
    const party = new Set()
    for (const cu of u.contractUnits) {
      party.add(cu.contract.clientId)
      for (const cc of cu.contract.contractClients) party.add(cc.clientId)
    }
    if (u.reservedById) party.add(u.reservedById)
    if (party.size === 0) {
      // lokal sprzedany/zarezerwowany bez znanej strony — nie zgadujemy
      if (u.status !== 'WOLNY') skippedUnknown++
      continue
    }
    const rows = u.clientUnits.filter((c) => !party.has(c.clientId))
    if (rows.length === 0) continue
    const owner =
      u.contractUnits.length
        ? u.contractUnits.map((cu) => `umowa ${cu.contract.number} (${cu.contract.type}/${cu.contract.status}, ${personName(cu.contract.client)})`).join(', ')
        : `rezerwacja ${u.reservationType || '—'} na ${personName(holders.get(u.reservedById))}`
    console.log(`\n${u.number} [${u.status}/${u.reservationType || '—'}] — strona: ${owner}`)
    for (const r of rows) {
      stale++
      console.log(`   zalegający wpis: ${personName(r.client)} (przypisany ${fmtDT(r.assignedAt)})${apply ? ' → usuwam' : ''}`)
    }
    if (apply) {
      await prisma.clientUnit.deleteMany({ where: { unitId: u.id, clientId: { in: rows.map((r) => r.clientId) } } })
    }
  }
  console.log(`\nZalegających wpisów: ${stale}${apply ? ' (usunięte)' : ''}; lokali z wpisami bez znanej strony (pominięte): ${skippedUnknown}.`)
  if (!apply && stale) console.log('DRY-RUN. Uruchom z --apply, aby usunąć.')
}

main()
  .catch((e) => {
    console.error('BŁĄD:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
