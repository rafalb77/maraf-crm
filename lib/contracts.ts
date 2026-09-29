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
