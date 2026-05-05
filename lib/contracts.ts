import { prisma } from './prisma'
import type { ContractType, UnitType } from './types'
import { CONTRACT_TYPE_LETTER, RESERVATION_CONTRACT_LIMITS } from './types'

/**
 * Generate next contract number in format "M/YYYY/L" (e.g. "1/2026/R").
 * Month-scoped counter per contract type.
 */
export async function generateContractNumber(
  type: ContractType,
  date: Date = new Date(),
): Promise<string> {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  const letter = CONTRACT_TYPE_LETTER[type]

  // Find all contracts for this month/year/type by parsing number field
  const suffix = `/${year}/${letter}`
  const prefix = `${month}/${year}/${letter}`

  const existing = await prisma.contract.findMany({
    where: { number: { endsWith: suffix } },
    select: { number: true },
  })

  // Count how many match "M/YYYY/L" ignoring any extra ordinal suffix. We use plain M/YYYY/L.
  const sameMonth = existing.filter((c) => c.number.startsWith(`${month}/${year}/${letter}`))
  const nextOrdinal = sameMonth.length + 1

  // If there's already a contract with that exact number, add ordinal suffix
  if (sameMonth.length === 0) return prefix

  // Format: M/YYYY/L-N for subsequent contracts in same month
  return `${prefix}-${nextOrdinal}`
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
