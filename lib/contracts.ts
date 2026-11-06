import { prisma } from './prisma'
import type { ContractType, UnitType } from './types'
import { CONTRACT_TYPE_LETTER, RESERVATION_CONTRACT_LIMITS } from './types'

/** Miesiąc i rok w czasie polskim (kontener prod chodzi w UTC — na przełomie miesiąca różnica). */
function warsawYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: 'numeric' }).formatToParts(date)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  return { year: year || date.getFullYear(), month: month || date.getMonth() + 1 }
}

/**
 * Następny numer umowy „M/RRRR/L” (np. „9/2026/R”), kolejne w tym samym miesiącu
 * i typie: „M/RRRR/L-2”, „-3”, … Licznik = NAJWYŻSZY istniejący numer porządkowy + 1.
 *
 * Do 29.09.2026 zapytanie brało numery kończące się na „/RRRR/L”, więc numerów
 * z dopiskiem „-N” nie widziało: trzecia umowa w miesiącu dostawała znów „-2”,
 * baza odrzucała duplikat i tworzenie umowy kończyło się błędem 500.
 */
export async function generateContractNumber(
  type: ContractType,
  date: Date = new Date(),
): Promise<string> {
  const { year, month } = warsawYearMonth(date)
  const prefix = `${month}/${year}/${CONTRACT_TYPE_LETTER[type]}`

  const existing = await prisma.contract.findMany({
    where: { number: { startsWith: prefix } },
    select: { number: true },
  })
  const taken = new Set(existing.map((c) => c.number))

  let maxOrdinal = 0
  for (const n of taken) {
    if (n === prefix) maxOrdinal = Math.max(maxOrdinal, 1)
    else {
      const m = n.slice(prefix.length).match(/^-(\d+)$/)
      if (m) maxOrdinal = Math.max(maxOrdinal, parseInt(m[1], 10))
    }
  }
  if (maxOrdinal === 0 && !taken.has(prefix)) return prefix

  let next = maxOrdinal + 1
  while (taken.has(`${prefix}-${next}`)) next++
  return `${prefix}-${next}`
}

/**
 * Numer umowy tworzonej z oferty: „UR/RRRR/MM/NNN”. Licznik = najwyższy numer
 * w miesiącu + 1 (nie „ostatnio utworzona”), z pominięciem zajętych.
 */
export async function generateOfferContractNumber(date: Date = new Date()): Promise<string> {
  const { year, month } = warsawYearMonth(date)
  const prefix = `UR/${year}/${String(month).padStart(2, '0')}/`
  const existing = await prisma.contract.findMany({
    where: { number: { startsWith: prefix } },
    select: { number: true },
  })
  const taken = new Set(existing.map((c) => c.number))
  let max = 0
  for (const n of taken) {
    const m = n.slice(prefix.length).match(/^(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  let next = max + 1
  while (taken.has(`${prefix}${String(next).padStart(3, '0')}`)) next++
  return `${prefix}${String(next).padStart(3, '0')}`
}

/** Czy błąd to kolizja unikalności numeru umowy (np. dwie osoby tworzą umowę w tej samej chwili). */
export function isContractNumberCollision(e: unknown): boolean {
  const err = e as { code?: string; meta?: { target?: string[] | string } } | null
  if (!err || err.code !== 'P2002') return false
  const target = err.meta?.target
  if (Array.isArray(target)) return target.includes('number')
  if (typeof target === 'string') return target.includes('number')
  return true
}

/**
 * Tworzy umowę ze świeżym numerem; przy kolizji numeru (wyścig) losuje kolejny
 * i ponawia. Inne błędy przepuszcza — wywołujący zamienia je na czytelny JSON.
 */
export async function createWithFreshNumber<T>(
  generate: () => Promise<string>,
  create: (number: string) => Promise<T>,
  attempts = 5,
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    const number = await generate()
    try {
      return await create(number)
    } catch (e) {
      if (!isContractNumberCollision(e)) throw e
      lastError = e
    }
  }
  throw lastError
}

/** Krótki, bezpieczny do pokazania opis błędu tworzenia umowy. */
export function contractCreateErrorMessage(e: unknown): string {
  if (isContractNumberCollision(e)) return 'nie udało się nadać wolnego numeru umowy — spróbuj ponownie'
  const err = e as { code?: string; message?: string } | null
  if (err?.code === 'P2003') return 'jeden z lokali lub klient nie istnieje (odśwież stronę)'
  if (err?.code === 'P2002') return 'taki wpis już istnieje (duplikat)'
  if (err?.code) return `błąd bazy danych (${err.code})`
  return 'błąd serwera'
}

export type UnitStageState = {
  status: string
  reservationType: string | null
  reservationExpiresAt: Date | null
  reservedById: string | null
}

/**
 * Docelowy stan lokalu wg etapu umowy:
 *  - DEWELOPERSKA / PRZENIESIENIA = wiążąca sprzedaż → SPRZEDANY (bez rezerwacji),
 *  - REZERWACYJNA = twarda rezerwacja → ZAREZERWOWANY (REZERWACJA, reservedById = klient).
 */
export function unitStateForStage(stage: ContractType, clientId: string): UnitStageState {
  if (stage === 'DEWELOPERSKA' || stage === 'PRZENIESIENIA') {
    return { status: 'SPRZEDANY', reservationType: null, reservationExpiresAt: null, reservedById: null }
  }
  return { status: 'ZAREZERWOWANY', reservationType: 'REZERWACJA', reservationExpiresAt: null, reservedById: clientId }
}

export type ReleaseUnitsResult = {
  released: string[] // numery lokali zwolnionych (WOLNY)
  kept: { unitNumber: string; contractNumber: string }[] // lokale zostawione pod inną aktywną umową
}

/**
 * Zwalnia lokale umowy przy jej rozwiązaniu/anulowaniu/usunięciu — ale lokal,
 * który jest też składnikiem INNEJ aktywnej umowy (duplikat rekordu, para z
 * importu), nie wraca do puli: dostaje stan wg etapu tamtej umowy. Bez tego
 * anulowanie zdublowanej rezerwacji zwalniało mieszkanie spod prawdziwej umowy.
 * Powiązania ClientUnit kasowane tylko dla lokali faktycznie zwolnionych.
 */
export async function releaseContractUnits(contractId: string, unitIds: string[]): Promise<ReleaseUnitsResult> {
  const result: ReleaseUnitsResult = { released: [], kept: [] }
  if (unitIds.length === 0) return result
  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds } },
    select: {
      id: true,
      number: true,
      contractUnits: {
        where: { contract: { id: { not: contractId }, status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] } } },
        select: { contract: { select: { number: true, type: true, clientId: true, status: true } } },
        orderBy: { contract: { createdAt: 'desc' } },
      },
    },
  })
  const toRelease: string[] = []
  for (const u of units) {
    const other = u.contractUnits[0]?.contract
    if (other) {
      await prisma.unit.update({ where: { id: u.id }, data: unitStateForStage(other.type as ContractType, other.clientId) })
      result.kept.push({ unitNumber: u.number, contractNumber: other.number })
    } else {
      toRelease.push(u.id)
      result.released.push(u.number)
    }
  }
  if (toRelease.length) {
    await prisma.unit.updateMany({
      where: { id: { in: toRelease } },
      data: { status: 'WOLNY', reservationType: null, reservationExpiresAt: null, reservedById: null },
    })
    await prisma.clientUnit.deleteMany({ where: { unitId: { in: toRelease } } })
  }
  // Lokale zostawione pod inną umową: wpis portfela klienta tej (anulowanej) umowy
  // jest już tylko śladem — lokal ma inną stronę — więc znika z jego portfela.
  const keptIds = units.filter((u) => u.contractUnits[0]).map((u) => u.id)
  if (keptIds.length) await pruneStaleClientUnits(keptIds, { excludeContractId: contractId })
  return result
}

export function describeRelease(r: ReleaseUnitsResult): string {
  const parts: string[] = []
  if (r.released.length) parts.push(`zwolniono: ${r.released.join(', ')}`)
  if (r.kept.length) parts.push(`zostały pod inną umową: ${r.kept.map((k) => `${k.unitNumber} (${k.contractNumber})`).join(', ')}`)
  return parts.join('; ')
}

/**
 * Validate that the unit composition matches the constraints for a given contract type.
 * Reservation contract (REZERWACYJNA): max 1 MIESZKALNY + 2 PARKING + 2 GARAZ + 1 KOMORKA.
 * Returns error message or null if valid.
 */
export function validateContractUnits(
  type: ContractType,
  units: { type: UnitType }[],
): string | null {
  if (type !== 'REZERWACYJNA') return null

  const counts: Record<string, number> = {}
  for (const u of units) {
    counts[u.type] = (counts[u.type] || 0) + 1
  }

  for (const [t, limit] of Object.entries(RESERVATION_CONTRACT_LIMITS)) {
    if ((counts[t] || 0) > limit) {
      return `Umowa rezerwacyjna: przekroczony limit dla typu ${t} (max ${limit}, wybrano ${counts[t]})`
    }
  }
  return null
}


// ---------------------------------------------------------------------------
// Dostępność lokali dla umowy — zapora przed „dwiema umowami różnych klientów na
// jeden lokal" (MP.21, 11.2026: rezerwacyjna Czwondy na miejscu sprzedanym aktem
// Rataj; lokal wszedł do umowy z zalegającego wpisu w portfelu klienta).
// ---------------------------------------------------------------------------

export type UnitAvailabilityIssue = {
  unitId: string
  unitNumber: string
  /** Powód po polsku, w formie „jest na aktywnej umowie X (Jan Kowalski)". */
  reason: string
  /** Umowa innego klienta, na której lokal już jest (gdy to jest powód). */
  contract?: { id: string; number: string }
}

const personName = (c: { firstName: string; lastName: string } | null | undefined) =>
  c ? `${c.firstName} ${c.lastName}`.trim() : 'inny klient'

/**
 * Lokale, których nie wolno dołożyć do umowy stron `partyClientIds` (klient główny
 * + współkupujący) ani na niej podpisać:
 *  - lokal jest składnikiem AKTYWNEJ umowy innego klienta — prawda z bazy,
 *    niezależna od flag lokalu (flagi potrafią kłamać po imporcie / podpisaniu
 *    drugiej umowy, która je nadpisała);
 *  - przy `checkFlags` dodatkowo: lokal oznaczony jako sprzedany/niedostępny bez
 *    aktywnej umowy stron, albo z twardą rezerwacją innego klienta.
 * `excludeContractId` — umowa, dla której sprawdzamy (jej własne składniki to nie
 * konflikt). Podpisanie i awans etapu sprawdzają tylko umowy (flagi mogły ustawić
 * poprzednie etapy tej samej umowy); dokładanie składników — także flagi.
 */
export async function findUnavailableUnits(
  unitIds: string[],
  partyClientIds: string[],
  opts: { excludeContractId?: string; checkFlags?: boolean } = {},
): Promise<UnitAvailabilityIssue[]> {
  if (unitIds.length === 0) return []
  const party = new Set(partyClientIds)
  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds } },
    select: {
      id: true,
      number: true,
      status: true,
      reservationType: true,
      reservedById: true,
      contractUnits: {
        where: {
          contract: {
            status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] },
            ...(opts.excludeContractId ? { id: { not: opts.excludeContractId } } : {}),
          },
        },
        select: {
          contract: {
            select: {
              id: true,
              number: true,
              clientId: true,
              client: { select: { firstName: true, lastName: true } },
              contractClients: { select: { clientId: true } },
            },
          },
        },
        orderBy: { contract: { createdAt: 'asc' } },
      },
    },
  })

  // Nazwy klientów trzymających twardą rezerwację (Unit.reservedById to goły string, bez relacji).
  const holderIds = opts.checkFlags
    ? Array.from(new Set(units.map((u) => u.reservedById).filter((x): x is string => !!x && !party.has(x))))
    : []
  const holders = new Map<string, { firstName: string; lastName: string }>()
  if (holderIds.length) {
    const rows = await prisma.client.findMany({ where: { id: { in: holderIds } }, select: { id: true, firstName: true, lastName: true } })
    for (const r of rows) holders.set(r.id, r)
  }

  const isParty = (c: { clientId: string; contractClients: { clientId: string }[] }) =>
    party.has(c.clientId) || c.contractClients.some((cc) => party.has(cc.clientId))

  const issues: UnitAvailabilityIssue[] = []
  for (const u of units) {
    const foreign = u.contractUnits.map((cu) => cu.contract).find((c) => !isParty(c))
    if (foreign) {
      issues.push({
        unitId: u.id,
        unitNumber: u.number,
        reason: `jest na aktywnej umowie ${foreign.number} (${personName(foreign.client)})`,
        contract: { id: foreign.id, number: foreign.number },
      })
      continue
    }
    if (!opts.checkFlags) continue
    const ownActive = u.contractUnits.length > 0
    if (u.status === 'SPRZEDANY' && !ownActive) {
      issues.push({ unitId: u.id, unitNumber: u.number, reason: 'jest oznaczony jako sprzedany (bez aktywnej umowy w systemie)' })
    } else if (u.status === 'NIEDOSTEPNY') {
      issues.push({ unitId: u.id, unitNumber: u.number, reason: 'jest oznaczony jako niedostępny' })
    } else if (u.reservationType === 'REZERWACJA' && u.reservedById && !party.has(u.reservedById)) {
      issues.push({
        unitId: u.id,
        unitNumber: u.number,
        reason: `ma twardą rezerwację innego klienta (${personName(holders.get(u.reservedById))})`,
      })
    }
  }
  return issues
}

/** Komunikat 409 dla findUnavailableUnits; `hint` mówi, co zrobić (zależy od miejsca). */
export function unavailableUnitsMessage(issues: UnitAvailabilityIssue[], hint: string): string {
  if (issues.length === 1) return `Lokal ${issues[0].unitNumber} ${issues[0].reason}. ${hint}`
  return `Lokale: ${issues.map((i) => `${i.unitNumber} – ${i.reason}`).join('; ')}. ${hint}`
}

/**
 * Usuwa zalegające wpisy portfela (ClientUnit) dla lokali, które mają już stronę:
 * są na aktywnej umowie albo mają rezerwację konkretnego klienta (Unit.reservedById).
 * Wpis zostaje, gdy klient jest stroną aktywnej umowy z tym lokalem (klient główny
 * lub współkupujący) albo trzyma jego rezerwację. Lokal bez znanej strony (wolny,
 * sprzedany bez umowy w systemie) nie jest ruszany. Wołane po podpisaniu / awansie
 * etapu, edycji składników, aneksie i zwolnieniu lokali — bez tego karta lokalu
 * pokazywała w „Przypisani klienci" klienta, który lokal dawno stracił (MP.21 u
 * Czwondy po zdjęciu z umowy, 11.2026), a karta klienta trzymała go w portfelu.
 */
export async function pruneStaleClientUnits(
  unitIds: string[],
  opts: { excludeContractId?: string } = {},
): Promise<{ unitNumber: string; clientId: string }[]> {
  if (unitIds.length === 0) return []
  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds } },
    select: {
      id: true,
      number: true,
      reservedById: true,
      clientUnits: { select: { clientId: true } },
      contractUnits: {
        // excludeContractId: umowa właśnie anulowana / kasowana — jej status zmienia się
        // dopiero po zwolnieniu lokali, więc nie może liczyć się jako strona.
        where: {
          contract: {
            status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] },
            ...(opts.excludeContractId ? { id: { not: opts.excludeContractId } } : {}),
          },
        },
        select: { contract: { select: { clientId: true, contractClients: { select: { clientId: true } } } } },
      },
    },
  })
  const removed: { unitNumber: string; clientId: string }[] = []
  for (const u of units) {
    const party = new Set<string>()
    for (const cu of u.contractUnits) {
      party.add(cu.contract.clientId)
      for (const cc of cu.contract.contractClients) party.add(cc.clientId)
    }
    if (u.reservedById) party.add(u.reservedById)
    if (party.size === 0) continue
    const stale = u.clientUnits.map((c) => c.clientId).filter((id) => !party.has(id))
    if (stale.length === 0) continue
    await prisma.clientUnit.deleteMany({ where: { unitId: u.id, clientId: { in: stale } } })
    for (const clientId of stale) removed.push({ unitNumber: u.number, clientId })
  }
  return removed
}
