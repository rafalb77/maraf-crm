import { cookies } from 'next/headers'
import type { Company } from './types'

export const FINANSE_COMPANY_COOKIE = 'finanse_company'

/**
 * Aktywna firma w module Finanse (kontekst globalny przez cookie).
 * Maraf i Maraf Development sa calkowicie osobnymi podmiotami — kazdy widok
 * Finansow pokazuje tylko dane aktywnej firmy, nowe faktury auto-przypisuja sie
 * do niej. Przelacznik w app/(app)/finanse/layout.tsx.
 * Domyslnie MARAF.
 */
export function getActiveCompany(): Company {
  const v = cookies().get(FINANSE_COMPANY_COOKIE)?.value
  return v === 'MARAF_DEVELOPMENT' ? 'MARAF_DEVELOPMENT' : 'MARAF'
}
