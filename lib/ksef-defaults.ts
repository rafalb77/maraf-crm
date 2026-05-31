import type { Company } from './types'

// Domyslne dane KSeF per firma — uzywane przy pierwszej inicjalizacji
// KsefConfig (gdy uzytkownik wchodzi na /finanse/ksef po raz pierwszy).
// User wpisuje tylko token przez UI; NIP i syncFromDate sa pre-fillowane.
//
// Decyzja 2026-05-21: pobieranie faktur z KSeF dla obu firm od 1 czerwca 2026.

export const KSEF_DEFAULTS: Record<Company, { nip: string; syncFromDate: Date }> = {
  MARAF: {
    nip: '7322069952', // 732-206-99-52
    syncFromDate: new Date('2026-06-01T00:00:00.000Z'),
  },
  MARAF_DEVELOPMENT: {
    nip: '7322202144',
    syncFromDate: new Date('2026-06-01T00:00:00.000Z'),
  },
}

// Walidacja NIP — 10 cyfr (mozna z mysznikami w UI, normalizujemy do cyfr).
export function normalizeNip(nip: string): string {
  return nip.replace(/[-\s]/g, '')
}

export function isValidNip(nip: string): boolean {
  const n = normalizeNip(nip)
  if (!/^\d{10}$/.test(n)) return false
  // Suma kontrolna NIP (weryfikuje że to poprawny NIP)
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
  const sum = weights.reduce((s, w, i) => s + w * parseInt(n[i], 10), 0)
  return sum % 11 === parseInt(n[9], 10)
}
