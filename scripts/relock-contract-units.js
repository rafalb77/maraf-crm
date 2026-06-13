/* eslint-disable */
/**
 * Ponowne zablokowanie lokali pod podpisanymi umowami.
 *
 * Auto-wygasanie rezerwacji miękkich potrafiło zwolnić (→ WOLNY) lokale, które
 * faktycznie są składnikiem PODPISANEJ umowy (dane z importu bywały miękko
 * zarezerwowane mimo umowy). Ten skrypt przywraca poprawny status takich lokali:
 *   - umowa PRZENIESIENIA (podpisana)           → SPRZEDANY
 *   - umowa REZERWACYJNA / DEWELOPERSKA (podp.)  → ZAREZERWOWANY + REZERWACJA (twarda),
 *                                                  reservedById = klient umowy
 *
 * OSTROŻNIE: rusza TYLKO lokale, które są teraz WOLNE lub miękko zarezerwowane
 * (MIEKKA) — czyli te „zgubione". Lokali już poprawnie SPRZEDANY/ZAREZERWOWANY
 * (twardo) nie dotyka. Gdy lokal jest w kilku umowach, wygrywa SPRZEDANY.
 * Idempotentny.
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/relock-contract-units.js            # dry-run (podgląd)
 *   node scripts/relock-contract-units.js --apply    # zapis
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const contracts = await prisma.contract.findMany({
    where: { status: 'PODPISANA' },
    select: {
      type: true,
      clientId: true,
      contractUnits: {
        select: { unit: { select: { id: true, number: true, status: true, reservationType: true } } },
      },
    },
  })

  // unitId -> docelowy stan (SPRZEDANY wygrywa nad ZAREZERWOWANY)
  const target = new Map()
  for (const c of contracts) {
    for (const cu of c.contractUnits) {
      const u = cu.unit
      const desired =
        c.type === 'PRZENIESIENIA'
          ? { status: 'SPRZEDANY', reservationType: null, reservedById: null }
          : { status: 'ZAREZERWOWANY', reservationType: 'REZERWACJA', reservedById: c.clientId }
      const prev = target.get(u.id)
      if (!prev || (desired.status === 'SPRZEDANY' && prev.status !== 'SPRZEDANY')) {
        target.set(u.id, { ...desired, number: u.number, curStatus: u.status, curRes: u.reservationType })
      }
    }
  }

  // Naprawiamy tylko „zgubione": WOLNY albo miękko zarezerwowane.
  const toFix = [...target.entries()].filter(
    ([, t]) => t.curStatus === 'WOLNY' || t.curRes === 'MIEKKA',
  )

  console.log(`Umów podpisanych: ${contracts.length}`)
  console.log(`Lokali pod umowami: ${target.size}`)
  console.log(`Do naprawy (WOLNY/MIEKKA): ${toFix.length}`)
  for (const [, t] of toFix) {
    console.log(`  - ${t.number}: ${t.curStatus}/${t.curRes ?? '-'} -> ${t.status}/${t.reservationType ?? '-'}`)
  }

  if (!apply) {
    console.log('\nDRY-RUN. Uruchom z --apply, aby zapisać.')
    return
  }

  let fixed = 0
  for (const [unitId, t] of toFix) {
    await prisma.unit.update({
      where: { id: unitId },
      data: {
        status: t.status,
        reservationType: t.reservationType,
        reservationExpiresAt: null,
        reservedById: t.reservedById,
      },
    })
    fixed++
  }
  console.log(`\nNaprawiono ${fixed} lokali.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
