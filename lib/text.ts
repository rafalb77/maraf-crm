// Wspólne helpery tekstowe — foldowanie polskich znaków do ASCII.
// Używane przy wyszukiwaniu (combobox klienta) i budowaniu nazw plików.

const PL_MAP: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z',
}

/** Zamienia polskie znaki diakrytyczne na odpowiedniki ASCII (Żółw → Zolw). */
export function foldPolish(s: string): string {
  return s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => PL_MAP[c] ?? c)
}

/**
 * Normalizacja do porównań przy wyszukiwaniu: bez polskich znaków, bez
 * pozostałych diakrytyków, lowercase. Dzięki temu "sloczynski" znajduje
 * "Słoczyński", a "jose" znajduje "José".
 */
export function normalizeForSearch(s: string | null | undefined): string {
  return foldPolish(String(s ?? ''))
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}
