// Moduł Odbiory — stałe współdzielone przez serwer i klienta (bez Prisma, bez fs).
// Statusy usterki i kolory obwódek pinezek wg decyzji Rafała (12.09.2026):
// czerwony do poprawy, pomarańczowy zgłoszona przez wykonawcę jako poprawiona,
// zielony odebrana, szary anulowana, fioletowy sporna.

export const DEFECT_STATUSES = ['DO_POPRAWY', 'POPRAWIONA', 'ODEBRANA', 'ANULOWANA', 'SPORNA'] as const
export type DefectStatus = (typeof DEFECT_STATUSES)[number]

export const DEFECT_STATUS_LABELS: Record<DefectStatus, string> = {
  DO_POPRAWY: 'Do poprawy',
  POPRAWIONA: 'Poprawiona — do odbioru',
  ODEBRANA: 'Odebrana',
  ANULOWANA: 'Anulowana',
  SPORNA: 'Sporna',
}

/** Kolor obwódki pinezki (hex — używany też w PDF i SVG). */
export const DEFECT_STATUS_RING: Record<DefectStatus, string> = {
  DO_POPRAWY: '#dc2626',
  POPRAWIONA: '#f97316',
  ODEBRANA: '#16a34a',
  ANULOWANA: '#9ca3af',
  SPORNA: '#9333ea',
}

/** Klasy Tailwind dla badge'y statusu. */
export const DEFECT_STATUS_BADGE: Record<DefectStatus, string> = {
  DO_POPRAWY: 'bg-red-100 text-red-700',
  POPRAWIONA: 'bg-orange-100 text-orange-700',
  ODEBRANA: 'bg-green-100 text-green-700',
  ANULOWANA: 'bg-gray-100 text-gray-600',
  SPORNA: 'bg-purple-100 text-purple-700',
}

export const DEFECT_PRIORITIES = ['NISKI', 'NORMALNY', 'PILNY'] as const
export type DefectPriority = (typeof DEFECT_PRIORITIES)[number]
export const DEFECT_PRIORITY_LABELS: Record<DefectPriority, string> = {
  NISKI: 'Niski',
  NORMALNY: 'Normalny',
  PILNY: 'Pilny',
}

export const TRADES = [
  'MURY',
  'KONSTRUKCJA',
  'TYNKI',
  'POSADZKI',
  'ELEKTRYKA',
  'SANITARNA',
  'WENTYLACJA',
  'OKNA',
  'DRZWI',
  'BALKONY',
  'WYKONCZENIE',
  'OGOLNE',
] as const
export type Trade = (typeof TRADES)[number]
export const TRADE_LABELS: Record<Trade, string> = {
  MURY: 'Mury i ściany',
  KONSTRUKCJA: 'Konstrukcja (żelbet, strop)',
  TYNKI: 'Tynki',
  POSADZKI: 'Posadzki i wylewki',
  ELEKTRYKA: 'Elektryka',
  SANITARNA: 'Sanitarna',
  WENTYLACJA: 'Wentylacja',
  OKNA: 'Okna i parapety',
  DRZWI: 'Drzwi',
  BALKONY: 'Balkony i tarasy',
  WYKONCZENIE: 'Wykończenie',
  OGOLNE: 'Ogólne / porządkowe',
}

export const INSPECTION_KINDS = ['ROBOTY', 'TECHNICZNY', 'Z_NABYWCA', 'PRZEGLAD'] as const
export type InspectionKind = (typeof INSPECTION_KINDS)[number]
export const INSPECTION_KIND_LABELS: Record<InspectionKind, string> = {
  ROBOTY: 'Odbiór robót od wykonawcy',
  TECHNICZNY: 'Odbiór techniczny lokalu',
  Z_NABYWCA: 'Odbiór lokalu z nabywcą',
  PRZEGLAD: 'Przegląd (gwarancyjny / kontrolny)',
}

export const INSPECTION_STATUSES = ['W_TOKU', 'ZAKONCZONY', 'ANULOWANY'] as const
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number]
export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  W_TOKU: 'W toku',
  ZAKONCZONY: 'Zakończony',
  ANULOWANY: 'Anulowany',
}
export const INSPECTION_STATUS_BADGE: Record<InspectionStatus, string> = {
  W_TOKU: 'bg-blue-100 text-blue-700',
  ZAKONCZONY: 'bg-green-100 text-green-700',
  ANULOWANY: 'bg-gray-100 text-gray-600',
}

export const INSPECTION_RESULTS = ['ODEBRANO', 'ODEBRANO_Z_UWAGAMI', 'NIE_ODEBRANO'] as const
export type InspectionResult = (typeof INSPECTION_RESULTS)[number]
export const INSPECTION_RESULT_LABELS: Record<InspectionResult, string> = {
  ODEBRANO: 'Odebrano bez uwag',
  ODEBRANO_Z_UWAGAMI: 'Odebrano z uwagami (usterki do usunięcia)',
  NIE_ODEBRANO: 'Nie odebrano (wady istotne)',
}

export const ATTENDEE_ROLES = [
  'INSPEKTOR',
  'WYKONAWCA',
  'KIEROWNIK_BUDOWY',
  'INSPEKTOR_NADZORU',
  'INWESTOR',
  'INNY',
] as const
export type AttendeeRole = (typeof ATTENDEE_ROLES)[number]
export const ATTENDEE_ROLE_LABELS: Record<AttendeeRole, string> = {
  INSPEKTOR: 'Prowadzący odbiór',
  WYKONAWCA: 'Przedstawiciel wykonawcy',
  KIEROWNIK_BUDOWY: 'Kierownik budowy',
  INSPEKTOR_NADZORU: 'Inspektor nadzoru',
  INWESTOR: 'Przedstawiciel inwestora',
  INNY: 'Inna osoba',
}

/** Podpowiedzi pomieszczeń w mini-menu (szybki wybór, nie słownik zamknięty). */
export const ROOM_SUGGESTIONS = [
  'salon',
  'kuchnia',
  'sypialnia',
  'łazienka',
  'WC',
  'przedpokój',
  'korytarz',
  'klatka schodowa',
  'balkon',
  'garaż',
  'komórka',
  'piwnica',
  'szacht',
  'elewacja',
  'dach',
]

/** Akcje inspektora na usterce (tylko zalogowany z uprawnieniem). */
export const DEFECT_ACTIONS = ['ODEBRANO', 'NIE_ODEBRANO', 'ANULUJ', 'SPORNA', 'PRZYWROC', 'POPRAWIONA'] as const
export type DefectAction = (typeof DEFECT_ACTIONS)[number]

/** Ważność linku wykonawcy (dni). */
export const DISPATCH_TOKEN_DAYS = 90
