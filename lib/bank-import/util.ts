// Wspólne helpery parserów wyciągów ING.

/**
 * Parsuje polską kwotę: separator tysięcy = spacja/kropka, dziesiętny = przecinek.
 * Akceptuje też format z kropką dziesiętną (camt/XML). Zwraca liczbę lub null.
 * Znak (minus/„-”) zachowany.
 */
export function parseAmountPl(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return isFinite(raw) ? raw : null
  let s = String(raw).trim()
  if (!s) return null
  const negative = /^-|-$|\(.*\)/.test(s)
  s = s.replace(/[^\d.,-]/g, '') // usuń walutę, spacje NBSP itd.
  s = s.replace(/-/g, '')
  if (s.includes(',') && s.includes('.')) {
    // Ostatni separator = dziesiętny; drugi = tysięcy.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (s.includes(',')) {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  if (!isFinite(n)) return null
  return negative ? -Math.abs(n) : n
}

/** Data z 'YYMMDD' (MT940) → Date w północy UTC. Rok 2-cyfrowy → 20xx. */
export function dateFromYYMMDD(s: string): Date | null {
  if (!/^\d{6}$/.test(s)) return null
  const yy = Number(s.slice(0, 2))
  const mm = Number(s.slice(2, 4))
  const dd = Number(s.slice(4, 6))
  const year = 2000 + yy
  const d = new Date(Date.UTC(year, mm - 1, dd))
  return isNaN(d.getTime()) ? null : d
}

/** Data księgowania MT940 z 'MMDD' + rok referencyjny z daty waluty (obsługa przełomu roku). */
export function dateFromMMDD(s: string, refYear: number, refMonth: number): Date | null {
  if (!/^\d{4}$/.test(s)) return null
  const mm = Number(s.slice(0, 2))
  const dd = Number(s.slice(2, 4))
  // Przełom roku: jeśli księgowanie w grudniu a waluta w styczniu → rok-1.
  let year = refYear
  if (mm === 12 && refMonth === 1) year = refYear - 1
  else if (mm === 1 && refMonth === 12) year = refYear + 1
  const d = new Date(Date.UTC(year, mm - 1, dd))
  return isNaN(d.getTime()) ? null : d
}

/** Data 'YYYY-MM-DD' lub 'DD-MM-YYYY' / 'DD.MM.YYYY' → Date w północy UTC. */
export function parseFlexibleDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const s = String(raw).trim()
  let m = s.match(/^(\d{4})[-./](\d{2})[-./](\d{2})/)
  if (m) return utc(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{2})[-./](\d{2})[-./](\d{4})/)
  if (m) return utc(Number(m[3]), Number(m[2]), Number(m[1]))
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

function utc(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return isNaN(dt.getTime()) ? null : dt
}

/** Wyłuskuje pierwszy IBAN z tekstu (PL lub dowolny kraj). */
export function extractIban(text: string | null | undefined): string | null {
  if (!text) return null
  const m = String(text).replace(/[\s\-]/g, '').match(/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/)
  if (m) return m[0].toUpperCase()
  // Polski NRB bez prefiksu PL (26 cyfr)
  const nrb = String(text).replace(/[\s\-]/g, '').match(/\b\d{26}\b/)
  return nrb ? 'PL' + nrb[0] : null
}
