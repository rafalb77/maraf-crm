/**
 * Integracja z 3D Estate (matryca 3D na novastaffa.pl/mieszkania).
 *
 * Architektura PULL: 3DE odpytuje endpoint `GET /api/integrations/3destate/units`
 * co 15-30 min. My zwracamy aktualny stan wszystkich lokali w formacie JSON.
 *
 * Historia cen i Omnibus — 3DE liczy po swojej stronie z naszych odczytów,
 * my nie wysyłamy `priceHistory` w response (decyzja userska 2026-05-19, patrz
 * docs/integracja-3destate-decyzje.md).
 *
 * Autoryzacja: header `X-API-Key` (klucz w Settings.threeDEstateApiKey),
 * opcjonalnie IP whitelist (Settings.threeDEstateAllowedIp = 213.189.56.203).
 *
 * Pełna specyfikacja od 3DE: docs/integracja-3destate-decyzje.md.
 */

import type { Unit } from '@prisma/client'
import { randomBytes } from 'crypto'

/**
 * Mapowanie statusu CRM → 3DE.
 *
 * 3DE rozpoznaje 4 statusy. Nasz `NIEDOSTEPNY` mapuje na "Niedostępny w sprzedaży"
 * (lokal nie wyświetlany na matrycy). Niezależny od pola `visibleOnMatrix`, które
 * pozwala ukryć lokal **nawet w statusie WOLNY** (np. lokale jeszcze nie wprowadzone
 * do sprzedaży).
 */
export const STATUS_MAP: Record<string, string> = {
  WOLNY: 'Dostępny',
  ZAREZERWOWANY: 'Zarezerwowany',
  SPRZEDANY: 'Sprzedany',
  NIEDOSTEPNY: 'Niedostępny w sprzedaży',
}

/**
 * Mapowanie typu lokalu CRM → wartość czytelna dla 3DE.
 */
export const TYPE_MAP: Record<string, string> = {
  MIESZKALNY: 'Mieszkanie',
  USLUGOWY: 'Lokal usługowy',
  PARKING: 'Miejsce postojowe',
  GARAZ: 'Miejsce garażowe',
  KOMORKA: 'Komórka lokatorska',
}

/**
 * Kształt obiektu lokalu zwracanego do 3DE.
 * Pola dopasowane do dokumentu "Wymagania integracji z CRM — 3DEstate".
 */
export interface ThreeDEstateUnit {
  /** Unikalny ID lokalu w skali firmy. Używamy `Unit.number` (np. "B1.1.M3"). */
  id: string
  /** Typ z TYPE_MAP. */
  type: string
  /** Nazwa wyświetlana — to samo co `id` (czytelna numeracja). */
  name: string
  /** Status z STATUS_MAP. */
  status: string
  /** Powierzchnia w m². */
  area: number
  /** Liczba pokoi (null dla parkingów/komórek). */
  rooms: number | null
  /** Piętro (0 = parter, -1 = podziemie). */
  floor: number | null
  /** Absolutny URL do PDF z kartą lokalu (rzut + opis). */
  kartaUrl: string | null
  /** Absolutny URL do PDF z prospektem informacyjnym (jeden dla inwestycji). */
  prospektUrl: string | null
  /** Czy lokal wyświetla się na matrycy 3D (niezależne od statusu). */
  visibleOnMatrix: boolean
  /** Cena podstawowa brutto (PLN). */
  priceBase: number
  /** Cena podstawowa za m² brutto (PLN/m²). 0 dla typów ryczałtowych (parking, garaż). */
  priceBasePerSqm: number
  /** Cena promocyjna brutto, null jeśli promocja nieaktywna. */
  pricePromo: number | null
  /** Cena promocyjna za m² brutto, null jeśli promocja nieaktywna. */
  pricePromoPerSqm: number | null
  /** Czy promocja jest aktywna. */
  promoActive: boolean
}

/**
 * Serializuje lokal z bazy do formatu 3DE.
 *
 * @param unit Rekord z Prismy.
 * @param baseUrl Bazowy URL aplikacji (np. "https://crm.maraf.pl") — używany do
 *                budowy absolutnych URL-i do PDF-ów (3DE pobiera pliki z naszego
 *                serwera, więc musi mieć pełne URL-e).
 * @param prospektPath Relatywny lub absolutny path do prospektu informacyjnego
 *                     (jeden dla całej inwestycji, z Settings.prospektInformacyjnyUrl).
 *                     Null jeśli prospekt nie jest jeszcze wgrany.
 */
export function serializeUnit(
  unit: Unit,
  baseUrl: string,
  prospektPath: string | null
): ThreeDEstateUnit {
  return {
    id: unit.number,
    type: TYPE_MAP[unit.type] || unit.type,
    name: unit.number,
    status: STATUS_MAP[unit.status] || unit.status,
    area: unit.area,
    rooms: unit.rooms,
    floor: unit.floor,
    kartaUrl: unit.floorPlanUrl ? absoluteUrl(unit.floorPlanUrl, baseUrl) : null,
    prospektUrl: prospektPath ? absoluteUrl(prospektPath, baseUrl) : null,
    visibleOnMatrix: unit.visibleOnMatrix,
    priceBase: unit.priceGross,
    priceBasePerSqm: unit.pricePerSqmGross,
    pricePromo: unit.promoActive ? unit.promoPriceGross : null,
    pricePromoPerSqm: unit.promoActive ? unit.promoPricePerSqmGross : null,
    promoActive: unit.promoActive,
  }
}

/**
 * Konwertuje względny path (np. "/uploads/...") na absolutny URL.
 * Jeśli już jest absolutny (http/https), zwraca bez zmian.
 */
function absoluteUrl(path: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const base = baseUrl.replace(/\/$/, '')
  const rel = path.startsWith('/') ? path : `/${path}`
  return base + rel
}

/**
 * Generuje nowy klucz API (32 bajty hex = 64 znaki).
 * Format: `3de_<hex>` (prefix pomaga rozpoznać klucz w logach).
 */
export function generateApiKey(): string {
  return '3de_' + randomBytes(32).toString('hex')
}

/**
 * Sprawdza czy podany klucz pasuje do zapisanego w Settings.
 * Constant-time comparison żeby uniknąć timing attacks.
 */
export function validateApiKey(provided: string | null, stored: string | null): boolean {
  if (!provided || !stored) return false
  if (provided.length !== stored.length) return false
  let mismatch = 0
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ stored.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Wyciąga IP klienta z requestu uwzględniając reverse proxy (Coolify).
 * Coolify dodaje `x-forwarded-for` z prawdziwym IP klienta.
 */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    // x-forwarded-for może być listą: "client, proxy1, proxy2" — bierzemy pierwszy
    return forwarded.split(',')[0].trim()
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return null
}
