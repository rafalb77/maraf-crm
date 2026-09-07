// Buduje nazwę pliku PDF oferty: imie_nazwisko_nrLokalu_dataWystawienia
// Używane w 3 miejscach: <title> strony druku (window.print → nazwa zapisu),
// Content-Disposition endpointu /pdf oraz nazwa załącznika w mailu.

import { foldPolish } from './text'

// Sanityzacja pojedynczego segmentu. Podkreślnik jest zarezerwowany jako
// separator pól, więc wewnątrz segmentu zamieniamy spacje/inne znaki na "-".
function slug(s: string | null | undefined): string {
  return foldPolish(String(s ?? ''))
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // pozostałe diakrytyki (np. José → Jose)
    .replace(/[^A-Za-z0-9.-]+/g, '-') // niedozwolone (spacje, /, _, itd.) → myślnik
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
}

export type OfferFilenameInput = {
  number: string | null
  createdAt: Date
  client: { firstName: string | null; lastName: string | null } | null
  items: { label: string }[]
}

/** Bazowa nazwa pliku (bez rozszerzenia .pdf). Zawsze ASCII-safe. */
export function buildOfferFilenameBase(offer: OfferFilenameInput): string {
  const parts: string[] = []

  // Imię + nazwisko (osobne pola). Brak klienta → numer oferty jako identyfikator.
  const first = slug(offer.client?.firstName)
  const last = slug(offer.client?.lastName)
  if (first) parts.push(first)
  if (last) parts.push(last)
  if (!first && !last) {
    const n = slug(offer.number)
    if (n) parts.push(n)
  }

  // Numer(y) lokalu. 1 → sam label, 2–3 → łączone "-", >3 → pierwszy + "-i-N-innych".
  const units = offer.items.map((it) => slug(it.label)).filter(Boolean)
  if (units.length === 1) parts.push(units[0])
  else if (units.length > 1 && units.length <= 3) parts.push(units.join('-'))
  else if (units.length > 3) parts.push(`${units[0]}-i-${units.length - 1}-innych`)

  // Data wystawienia w formacie ISO YYYY-MM-DD (sortowalna, lokalna strefa jak na wydruku).
  parts.push(offer.createdAt.toLocaleDateString('sv-SE'))

  const base = parts.filter(Boolean).join('_')
  return base || slug(offer.number) || 'oferta'
}

/** Wartość nagłówka Content-Disposition z ASCII fallback + RFC 5987. */
export function offerContentDisposition(
  base: string,
  disposition: 'inline' | 'attachment' = 'attachment',
): string {
  const filename = `${base}.pdf`
  const encoded = encodeURIComponent(filename)
  return `${disposition}; filename="${filename}"; filename*=UTF-8''${encoded}`
}
