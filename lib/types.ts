export type ClientStatus = 'ZAPYTANIE' | 'OFERTA' | 'REZERWACJA' | 'UMOWA' | 'ODBIOR'
export type UnitType = 'MIESZKALNY' | 'USLUGOWY' | 'PARKING' | 'GARAZ' | 'KOMORKA'
export type UnitStatus = 'WOLNY' | 'ZAREZERWOWANY' | 'SPRZEDANY' | 'NIEDOSTEPNY'
export type ActivityType = 'NOTATKA' | 'TELEFON' | 'EMAIL' | 'SPOTKANIE' | 'DOKUMENT'
export type ServiceStatus = 'ZGLOSZONO' | 'W_TOKU' | 'ZAKONCZONE'
export type ServicePriority = 'NISKA' | 'SREDNIA' | 'WYSOKA'

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  ZAPYTANIE: 'Zapytanie',
  OFERTA: 'Oferta',
  REZERWACJA: 'Rezerwacja',
  UMOWA: 'Umowa',
  ODBIOR: 'Odbiór',
}

export const CLIENT_STATUS_COLORS: Record<ClientStatus, string> = {
  ZAPYTANIE: 'bg-gray-100 text-gray-700',
  OFERTA: 'bg-blue-100 text-blue-700',
  REZERWACJA: 'bg-yellow-100 text-yellow-700',
  UMOWA: 'bg-green-100 text-green-700',
  ODBIOR: 'bg-purple-100 text-purple-700',
}

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  MIESZKALNY: 'Mieszkanie',
  USLUGOWY: 'Lokal usługowy',
  PARKING: 'Miejsce parkingowe',
  GARAZ: 'Miejsce garażowe',
  KOMORKA: 'Komórka lokatorska',
}

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  WOLNY: 'Wolny',
  ZAREZERWOWANY: 'Zarezerwowany',
  SPRZEDANY: 'Sprzedany',
  NIEDOSTEPNY: 'Niedostępny',
}

export const UNIT_STATUS_COLORS: Record<UnitStatus, string> = {
  WOLNY: 'bg-green-100 text-green-700',
  ZAREZERWOWANY: 'bg-yellow-100 text-yellow-700',
  SPRZEDANY: 'bg-blue-100 text-blue-700',
  NIEDOSTEPNY: 'bg-red-100 text-red-700',
}

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  NOTATKA: 'Notatka',
  TELEFON: 'Telefon',
  EMAIL: 'Email',
  SPOTKANIE: 'Spotkanie',
  DOKUMENT: 'Dokument',
}

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  ZGLOSZONO: 'Zgłoszono',
  W_TOKU: 'W toku',
  ZAKONCZONE: 'Zakończone',
}

export const SERVICE_STATUS_COLORS: Record<ServiceStatus, string> = {
  ZGLOSZONO: 'bg-red-100 text-red-700',
  W_TOKU: 'bg-yellow-100 text-yellow-700',
  ZAKONCZONE: 'bg-green-100 text-green-700',
}

export const SERVICE_PRIORITY_LABELS: Record<ServicePriority, string> = {
  NISKA: 'Niska',
  SREDNIA: 'Średnia',
  WYSOKA: 'Wysoka',
}

export const SERVICE_PRIORITY_COLORS: Record<ServicePriority, string> = {
  NISKA: 'bg-gray-100 text-gray-600',
  SREDNIA: 'bg-orange-100 text-orange-700',
  WYSOKA: 'bg-red-100 text-red-700',
}

// Reservation types
export type ReservationType = 'MIEKKA' | 'REZERWACJA'

export const RESERVATION_TYPE_LABELS: Record<ReservationType, string> = {
  MIEKKA: 'Miękka rezerwacja',
  REZERWACJA: 'Rezerwacja',
}

export const RESERVATION_TYPE_COLORS: Record<ReservationType, string> = {
  MIEKKA: 'bg-amber-100 text-amber-700',
  REZERWACJA: 'bg-yellow-200 text-yellow-800',
}

// Contract types
export type ContractType = 'REZERWACYJNA' | 'DEWELOPERSKA' | 'PRZENIESIENIA'
export type ContractStatus = 'W_PRZYGOTOWANIU' | 'PODPISANA' | 'ROZWIAZANA' | 'ANULOWANA'

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  REZERWACYJNA: 'Umowa rezerwacyjna',
  DEWELOPERSKA: 'Umowa deweloperska',
  PRZENIESIENIA: 'Umowa przeniesienia własności',
}

export const CONTRACT_TYPE_LETTER: Record<ContractType, string> = {
  REZERWACYJNA: 'R',
  DEWELOPERSKA: 'D',
  PRZENIESIENIA: 'P',
}

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  W_PRZYGOTOWANIU: 'W przygotowaniu',
  PODPISANA: 'Podpisana',
  ROZWIAZANA: 'Rozwiązana',
  ANULOWANA: 'Anulowana',
}

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  W_PRZYGOTOWANIU: 'bg-gray-100 text-gray-700',
  PODPISANA: 'bg-green-100 text-green-700',
  ROZWIAZANA: 'bg-orange-100 text-orange-700',
  ANULOWANA: 'bg-red-100 text-red-700',
}

// Validation: 1 umowa rezerwacyjna = max 1 MIESZKALNY + 2 PARKING + 2 GARAZ + 1 KOMORKA
export const RESERVATION_CONTRACT_LIMITS: Record<UnitType, number> = {
  MIESZKALNY: 1,
  USLUGOWY: 1,
  PARKING: 2,
  GARAZ: 2,
  KOMORKA: 1,
}
