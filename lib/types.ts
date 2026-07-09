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

// =====================================================================
// MODUŁ: SPRAWY (cases) — reklamacje, sprawy urzędowe, korespondencja
// =====================================================================
export type CaseType = 'REKLAMACJA' | 'URZEDOWA' | 'INNE'
export type CaseStatus = 'NOWA' | 'W_TOKU' | 'OCZEKUJE' | 'ROZSTRZYGNIETA' | 'ZAMKNIETA'
export type CasePriority = 'NISKA' | 'SREDNIA' | 'WYSOKA'
export type CaseDirection = 'PRZYCHODZACA' | 'WYCHODZACA' | 'WEWNETRZNA'
export type CaseChannel = 'LIST' | 'EMAIL' | 'TELEFON' | 'OSOBISCIE' | 'EPUAP' | 'INNE'

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  REKLAMACJA: 'Reklamacja',
  URZEDOWA: 'Sprawa urzędowa',
  INNE: 'Inne',
}

export const CASE_TYPE_COLORS: Record<CaseType, string> = {
  REKLAMACJA: 'bg-orange-100 text-orange-700',
  URZEDOWA: 'bg-indigo-100 text-indigo-700',
  INNE: 'bg-gray-100 text-gray-700',
}

// Prefiks sygnatury per typ (REK/2026/0042, URZ/2026/0007)
export const CASE_TYPE_PREFIX: Record<CaseType, string> = {
  REKLAMACJA: 'REK',
  URZEDOWA: 'URZ',
  INNE: 'SPR',
}

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  NOWA: 'Nowa',
  W_TOKU: 'W toku',
  OCZEKUJE: 'Oczekuje',
  ROZSTRZYGNIETA: 'Rozstrzygnięta',
  ZAMKNIETA: 'Zamknięta',
}

export const CASE_STATUS_COLORS: Record<CaseStatus, string> = {
  NOWA: 'bg-blue-100 text-blue-700',
  W_TOKU: 'bg-yellow-100 text-yellow-700',
  OCZEKUJE: 'bg-amber-100 text-amber-700',
  ROZSTRZYGNIETA: 'bg-green-100 text-green-700',
  ZAMKNIETA: 'bg-gray-100 text-gray-600',
}

// Statusy traktowane jako „sprawa zamknięta" — używane przy liczeniu otwartych
// spraw i pomijaniu w cronie przypomnień.
export const CASE_CLOSED_STATUSES: CaseStatus[] = ['ROZSTRZYGNIETA', 'ZAMKNIETA']

export const CASE_PRIORITY_LABELS: Record<CasePriority, string> = {
  NISKA: 'Niska',
  SREDNIA: 'Średnia',
  WYSOKA: 'Wysoka',
}

export const CASE_PRIORITY_COLORS: Record<CasePriority, string> = {
  NISKA: 'bg-gray-100 text-gray-600',
  SREDNIA: 'bg-orange-100 text-orange-700',
  WYSOKA: 'bg-red-100 text-red-700',
}

export const CASE_DIRECTION_LABELS: Record<CaseDirection, string> = {
  PRZYCHODZACA: 'Przychodząca',
  WYCHODZACA: 'Wychodząca',
  WEWNETRZNA: 'Wewnętrzna',
}

export const CASE_DIRECTION_ICONS: Record<CaseDirection, string> = {
  PRZYCHODZACA: '📥',
  WYCHODZACA: '📤',
  WEWNETRZNA: '📝',
}

export const CASE_CHANNEL_LABELS: Record<CaseChannel, string> = {
  LIST: 'List',
  EMAIL: 'E-mail',
  TELEFON: 'Telefon',
  OSOBISCIE: 'Osobiście',
  EPUAP: 'ePUAP / e-Doręczenia',
  INNE: 'Inne',
}

// =====================================================================
// MODUŁ: ZADANIA (centrum zadań „Do zrobienia" na pulpicie)
// =====================================================================
export type TaskType = 'TELEFON' | 'EMAIL' | 'SPOTKANIE' | 'REZERWACJA' | 'PLATNOSC' | 'SPRAWA' | 'INNE'
export type TaskStatus = 'OTWARTE' | 'ZROBIONE' | 'ANULOWANE'
// Koszyk pilności — liczony z dueAt względem dnia dzisiejszego (Europe/Warsaw)
export type TaskBucket = 'PRZETERMINOWANE' | 'DZIS' | 'NADCHODZACE' | 'POZNIEJ'

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  TELEFON: 'Telefon',
  EMAIL: 'E-mail',
  SPOTKANIE: 'Spotkanie',
  REZERWACJA: 'Rezerwacja',
  PLATNOSC: 'Płatność',
  SPRAWA: 'Sprawa',
  INNE: 'Inne',
}

export const TASK_TYPE_ICONS: Record<TaskType, string> = {
  TELEFON: '📞',
  EMAIL: '✉️',
  SPOTKANIE: '🤝',
  REZERWACJA: '🏠',
  PLATNOSC: '💰',
  SPRAWA: '⚠️',
  INNE: '📌',
}

export const TASK_BUCKET_LABELS: Record<TaskBucket, string> = {
  PRZETERMINOWANE: 'Przeterminowane',
  DZIS: 'Dziś',
  NADCHODZACE: 'Nadchodzące',
  POZNIEJ: 'Później',
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

// Kolejność etapów dealu. Contract.type = bieżący etap; deal posuwa się w przód
// po tej ścieżce. Może startować od dowolnego etapu (np. od deweloperskiej).
export const CONTRACT_STAGE_ORDER: ContractType[] = [
  'REZERWACYJNA',
  'DEWELOPERSKA',
  'PRZENIESIENIA',
]

/** Następny etap dealu, albo null gdy już na ostatnim (przeniesienie własności). */
export function nextContractStage(stage: ContractType): ContractType | null {
  const i = CONTRACT_STAGE_ORDER.indexOf(stage)
  return i >= 0 && i < CONTRACT_STAGE_ORDER.length - 1 ? CONTRACT_STAGE_ORDER[i + 1] : null
}

/** Poprzedni etap dealu, albo null gdy już na pierwszym (rezerwacyjna). */
export function prevContractStage(stage: ContractType): ContractType | null {
  const i = CONTRACT_STAGE_ORDER.indexOf(stage)
  return i > 0 ? CONTRACT_STAGE_ORDER[i - 1] : null
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

// Kind zdjec w galerii lokalu (UnitImage) — wykorzystywane przez generator
// kreacji Meta Ads do wyboru wlasciwego zdjecia per format reklamy.
export type UnitImageKind = 'RZUT_3D' | 'DOLL_HOUSE' | 'WNETRZE' | 'WIDOK_Z_OKNA' | 'INNE'

export const UNIT_IMAGE_KIND_LABELS: Record<UnitImageKind, string> = {
  RZUT_3D: 'Rzut 3D',
  DOLL_HOUSE: 'Doll house',
  WNETRZE: 'Wnętrze',
  WIDOK_Z_OKNA: 'Widok z okna',
  INNE: 'Inne',
}

// Kind wizualizacji wspolnych dla calej inwestycji (InvestmentImage) —
// tlo dla kreacji w wszystkich formatach (zwlaszcza Stories 9:16 i Landscape 1.91:1).
export type InvestmentImageKind = 'ZEWNETRZNE' | 'WEWNETRZNE' | 'OTOCZENIE' | 'INNE'

export const INVESTMENT_IMAGE_KIND_LABELS: Record<InvestmentImageKind, string> = {
  ZEWNETRZNE: 'Zewnętrzne',
  WEWNETRZNE: 'Wewnętrzne',
  OTOCZENIE: 'Otoczenie',
  INNE: 'Inne',
}

// Generowanie kreacji reklamowych Meta Ads dozwolone tylko dla lokali
// faktycznie sprzedawanych: mieszkalne / uslugowe o statusie != SPRZEDANY.
// Komorki lokatorskie, miejsca parkingowe/garazowe oraz lokale sprzedane
// nie maja generatora kreacji.
export function canGenerateCreative(unit: { type: string; status: string }): boolean {
  if (unit.status === 'SPRZEDANY') return false
  if (unit.type === 'KOMORKA' || unit.type === 'PARKING' || unit.type === 'GARAZ') return false
  return true
}

// Validation: 1 umowa rezerwacyjna = max 1 MIESZKALNY + 2 PARKING + 2 GARAZ + 1 KOMORKA
export const RESERVATION_CONTRACT_LIMITS: Record<UnitType, number> = {
  MIESZKALNY: 1,
  USLUGOWY: 1,
  PARKING: 2,
  GARAZ: 2,
  KOMORKA: 1,
}

// =====================================================================
// MODUŁ: FINANSE
// =====================================================================

// Multi-firma. Faktury (kosztowe i przychodowe) przypisane do jednej z firm grupy.
export type Company = 'MARAF' | 'MARAF_DEVELOPMENT'

export const COMPANY_LABELS: Record<Company, string> = {
  MARAF: 'Maraf',
  MARAF_DEVELOPMENT: 'Maraf Development',
}

export const COMPANY_SHORT: Record<Company, string> = {
  MARAF: 'Maraf',
  MARAF_DEVELOPMENT: 'MD',
}

export type VendorCategory = 'DOSTAWCA' | 'BANK' | 'LEASING' | 'URZAD' | 'PODWYKONAWCA' | 'INNE'

export const VENDOR_CATEGORY_LABELS: Record<VendorCategory, string> = {
  DOSTAWCA: 'Dostawca',
  BANK: 'Bank',
  LEASING: 'Leasing',
  URZAD: 'Urząd',
  PODWYKONAWCA: 'Podwykonawca',
  INNE: 'Inne',
}

export type PurchaseInvoiceStatus =
  | 'WPROWADZONA'
  | 'DO_ZATWIERDZENIA'
  | 'ZATWIERDZONA'
  | 'ZAPLANOWANA'
  | 'OPLACONA'
  | 'CZESCIOWO_OPLACONA'
  | 'ODRZUCONA'
  | 'ANULOWANA'

export const PURCHASE_INVOICE_STATUS_LABELS: Record<PurchaseInvoiceStatus, string> = {
  WPROWADZONA: 'Wprowadzona',
  DO_ZATWIERDZENIA: 'Do zatwierdzenia',
  ZATWIERDZONA: 'Zatwierdzona',
  ZAPLANOWANA: 'Zaplanowana',
  OPLACONA: 'Opłacona',
  CZESCIOWO_OPLACONA: 'Częściowo opłacona',
  ODRZUCONA: 'Odrzucona',
  ANULOWANA: 'Anulowana',
}

export const PURCHASE_INVOICE_STATUS_COLORS: Record<PurchaseInvoiceStatus, string> = {
  WPROWADZONA: 'bg-gray-100 text-gray-700',
  DO_ZATWIERDZENIA: 'bg-amber-100 text-amber-700',
  ZATWIERDZONA: 'bg-blue-100 text-blue-700',
  ZAPLANOWANA: 'bg-indigo-100 text-indigo-700',
  OPLACONA: 'bg-green-100 text-green-700',
  CZESCIOWO_OPLACONA: 'bg-emerald-100 text-emerald-700',
  ODRZUCONA: 'bg-red-100 text-red-700',
  ANULOWANA: 'bg-gray-200 text-gray-500',
}

// Ręczna kategoria kosztowa faktury (pole PurchaseInvoice.category) —
// przypisywana per faktura w szczegółach, niezależna od folderów vendorowych
// (lib/finanse-folders.ts). Wartości ustalone z użytkownikiem (2026-06).
export type PurchaseInvoiceCategory = 'STAFFA' | 'STALE' | 'TYNKI' | 'INNE'

export const PURCHASE_INVOICE_CATEGORIES: PurchaseInvoiceCategory[] = ['STAFFA', 'STALE', 'TYNKI', 'INNE']

export const PURCHASE_INVOICE_CATEGORY_LABELS: Record<PurchaseInvoiceCategory, string> = {
  STAFFA: 'Staffa',
  STALE: 'Stałe',
  TYNKI: 'Tynki',
  INNE: 'Inne',
}

export const PURCHASE_INVOICE_CATEGORY_COLORS: Record<PurchaseInvoiceCategory, string> = {
  STAFFA: 'bg-purple-100 text-purple-700',
  STALE: 'bg-blue-100 text-blue-700',
  TYNKI: 'bg-orange-100 text-orange-700',
  INNE: 'bg-gray-100 text-gray-600',
}

// Etykiety dla akcji w PurchaseInvoiceApproval.action (audit log)
export const INVOICE_APPROVAL_ACTION_LABELS: Record<string, string> = {
  SUBMITTED: 'Wysłana do zatwierdzenia',
  APPROVED: 'Zatwierdzona',
  REJECTED: 'Odrzucona',
  RESET: 'Cofnięta do edycji',
  EDITED: 'Edytowana',
}

// Faktury przychodowe (sprzedazowe)
export type SalesInvoiceStatus = 'WYSTAWIONA' | 'CZESCIOWO_OPLACONA' | 'OPLACONA' | 'ANULOWANA'

export const SALES_INVOICE_STATUS_LABELS: Record<SalesInvoiceStatus, string> = {
  WYSTAWIONA: 'Wystawiona',
  CZESCIOWO_OPLACONA: 'Częściowo opłacona',
  OPLACONA: 'Opłacona',
  ANULOWANA: 'Anulowana',
}

export const SALES_INVOICE_STATUS_COLORS: Record<SalesInvoiceStatus, string> = {
  WYSTAWIONA: 'bg-blue-100 text-blue-700',
  CZESCIOWO_OPLACONA: 'bg-emerald-100 text-emerald-700',
  OPLACONA: 'bg-green-100 text-green-700',
  ANULOWANA: 'bg-gray-200 text-gray-500',
}

// Orientacyjna stawka CIT (mały podatnik). Zmienialna w przyszłości per firma.
export const CIT_RATE = 0.09

// =====================================================================
// KSeF — snapshot pełnych danych faktury z FA(3) (pole PurchaseInvoice.ksefData
// / SalesInvoice.ksefData, typ Json). READ-only do wyświetlenia w szczegółach.
// Wypełniane przez parser w lib/ksef-client.ts. Wszystkie pola opcjonalne —
// FA(3)/FA(2) bywają niekompletne, a stare faktury (sprzed dodania pola) mają null.
// =====================================================================

export type KsefParty = {
  nip?: string | null
  name?: string | null
  // Adres złożony z linii FA(3) (AdresL1 = ulica/nr, AdresL2 = kod + miasto)
  // lub z pól strukturalnych — parser składa do gotowych linii.
  addressLines?: string[]
  countryCode?: string | null
  email?: string | null
  phone?: string | null
}

export type KsefLine = {
  no?: number | null          // NrWierszaFa
  name?: string | null        // P_7 — nazwa towaru/usługi
  unit?: string | null        // P_8A — jednostka miary
  quantity?: number | null    // P_8B — ilość
  unitPriceNet?: number | null // P_9A — cena jednostkowa netto
  net?: number | null         // P_11 — wartość netto pozycji
  gross?: number | null       // P_11A — wartość brutto pozycji (gdy podana)
  vatRate?: string | null     // P_12 — stawka VAT ("23", "8", "zw", "np", "0")
}

export type KsefPayment = {
  paid?: boolean              // Zapłacono = 1 (cała faktura opłacona)
  paidDate?: string | null    // DataZapłaty (ISO)
  dueDate?: string | null     // TerminPłatności/Termin (ISO)
  methodCode?: string | null  // FormaPłatności (kod 1..7)
  // Płatności częściowe (ZapłataCzęściowa) — kwota + data.
  partial?: { amount: number; date?: string | null }[]
}

export type KsefInvoiceData = {
  schema?: string             // "FA(3)" | "FA(2)" | "?"
  seller?: KsefParty
  buyer?: KsefParty
  lines?: KsefLine[]
  payment?: KsefPayment
}

// FormaPłatności (FA(3) — kod → opis)
export const KSEF_PAYMENT_METHOD_LABELS: Record<string, string> = {
  '1': 'Gotówka',
  '2': 'Karta',
  '3': 'Bon',
  '4': 'Czek',
  '5': 'Kredyt',
  '6': 'Przelew',
  '7': 'Płatność mobilna',
}

// =====================================================================
// MODUŁ: BUDOWA (Project Manager) — patrz docs/budowa-rozpoczecie.md
// =====================================================================

export type InvestmentStatus = 'PRZYGOTOWANIE' | 'W_BUDOWIE' | 'ODBIORY' | 'ZAKONCZONA'

export const INVESTMENT_STATUS_LABELS: Record<InvestmentStatus, string> = {
  PRZYGOTOWANIE: 'Przygotowanie',
  W_BUDOWIE: 'W budowie',
  ODBIORY: 'Odbiory',
  ZAKONCZONA: 'Zakończona',
}

export const INVESTMENT_STATUS_COLORS: Record<InvestmentStatus, string> = {
  PRZYGOTOWANIE: 'bg-gray-100 text-gray-600',
  W_BUDOWIE: 'bg-blue-100 text-blue-700',
  ODBIORY: 'bg-yellow-100 text-yellow-700',
  ZAKONCZONA: 'bg-green-100 text-green-700',
}

export type ConstructionStageStatus = 'PLANOWANY' | 'W_TOKU' | 'ZAKONCZONY' | 'WSTRZYMANY'
export type ConstructionTaskStatus =
  | 'PLANOWANE'
  | 'W_TOKU'
  | 'WSTRZYMANE'
  | 'DO_ODBIORU'
  | 'ZAKONCZONE'
  | 'ANULOWANE'

export const CONSTRUCTION_TASK_STATUS_LABELS: Record<ConstructionTaskStatus, string> = {
  PLANOWANE: 'Planowane',
  W_TOKU: 'W toku',
  WSTRZYMANE: 'Wstrzymane',
  DO_ODBIORU: 'Do odbioru',
  ZAKONCZONE: 'Zakończone',
  ANULOWANE: 'Anulowane',
}

export const CONSTRUCTION_TASK_STATUS_COLORS: Record<ConstructionTaskStatus, string> = {
  PLANOWANE: 'bg-gray-100 text-gray-600',
  W_TOKU: 'bg-blue-100 text-blue-700',
  WSTRZYMANE: 'bg-orange-100 text-orange-700',
  DO_ODBIORU: 'bg-purple-100 text-purple-700',
  ZAKONCZONE: 'bg-green-100 text-green-700',
  ANULOWANE: 'bg-gray-100 text-gray-400',
}

export const ACCEPTANCE_RESULT_LABELS: Record<string, string> = {
  PRZYJETY: 'Przyjęty',
  PRZYJETY_Z_UWAGAMI: 'Przyjęty z uwagami',
  ODRZUCONY: 'Odrzucony',
}
