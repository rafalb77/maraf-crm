// Klucze w tabeli Settings z danymi dewelopera/inwestycji dla raportu dane.gov.pl.
// Wydzielone osobno (bez zaleznosci serwerowych) — uzywane i przez generator CSV
// (lib/dane-gov-export.ts) i przez komponent UI panelu /settings/dane-gov.

export type DaneGovField = {
  key: string
  label: string
  group: 'Deweloper' | 'Biuro sprzedaży' | 'Inwestycja'
  placeholder?: string
}

export const DANE_GOV_SETTING_FIELDS: DaneGovField[] = [
  { key: 'companyName', label: 'Nazwa dewelopera', group: 'Deweloper', placeholder: 'MARAF Development Sp. z o.o.' },
  { key: 'devLegalForm', label: 'Forma prawna dewelopera', group: 'Deweloper', placeholder: 'SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ' },
  { key: 'devKrs', label: 'Numer KRS', group: 'Deweloper' },
  { key: 'devCeidg', label: 'Nr wpisu do CEIDG', group: 'Deweloper' },
  { key: 'devNip', label: 'NIP', group: 'Deweloper' },
  { key: 'devRegon', label: 'Nr REGON', group: 'Deweloper' },
  { key: 'devPhone', label: 'Nr telefonu', group: 'Deweloper' },
  { key: 'devEmail', label: 'Adres poczty elektronicznej', group: 'Deweloper' },
  { key: 'devWww', label: 'Adres strony internetowej dewelopera', group: 'Deweloper' },
  { key: 'devAddrWoj', label: 'Województwo siedziby', group: 'Deweloper' },
  { key: 'devAddrPowiat', label: 'Powiat siedziby', group: 'Deweloper' },
  { key: 'devAddrGmina', label: 'Gmina siedziby', group: 'Deweloper' },
  { key: 'devAddrMiejscowosc', label: 'Miejscowość siedziby', group: 'Deweloper' },
  { key: 'devAddrUlica', label: 'Ulica siedziby', group: 'Deweloper' },
  { key: 'devAddrNr', label: 'Nr nieruchomości siedziby', group: 'Deweloper' },
  { key: 'devAddrLokal', label: 'Nr lokalu siedziby', group: 'Deweloper' },
  { key: 'devAddrKod', label: 'Kod pocztowy siedziby', group: 'Deweloper' },
  { key: 'salesWoj', label: 'Województwo biura sprzedaży', group: 'Biuro sprzedaży' },
  { key: 'salesPowiat', label: 'Powiat biura sprzedaży', group: 'Biuro sprzedaży' },
  { key: 'salesGmina', label: 'Gmina biura sprzedaży', group: 'Biuro sprzedaży' },
  { key: 'salesMiejscowosc', label: 'Miejscowość biura sprzedaży', group: 'Biuro sprzedaży' },
  { key: 'salesUlica', label: 'Ulica biura sprzedaży', group: 'Biuro sprzedaży' },
  { key: 'salesNr', label: 'Nr nieruchomości biura sprzedaży', group: 'Biuro sprzedaży' },
  { key: 'salesLokal', label: 'Nr lokalu biura sprzedaży', group: 'Biuro sprzedaży' },
  { key: 'salesKod', label: 'Kod pocztowy biura sprzedaży', group: 'Biuro sprzedaży' },
  { key: 'salesExtra', label: 'Dodatkowe lokalizacje sprzedaży', group: 'Biuro sprzedaży' },
  { key: 'salesContact', label: 'Sposób kontaktu nabywcy z deweloperem', group: 'Biuro sprzedaży', placeholder: 'Telefon, Email, Biuro sprzedaży, Strona www' },
  { key: 'invWoj', label: 'Województwo lokalizacji przedsięwzięcia', group: 'Inwestycja' },
  { key: 'invPowiat', label: 'Powiat lokalizacji przedsięwzięcia', group: 'Inwestycja' },
  { key: 'invGmina', label: 'Gmina lokalizacji przedsięwzięcia', group: 'Inwestycja' },
  { key: 'invMiejscowosc', label: 'Miejscowość lokalizacji przedsięwzięcia', group: 'Inwestycja' },
  { key: 'invUlica', label: 'Ulica lokalizacji przedsięwzięcia', group: 'Inwestycja' },
  { key: 'invNr', label: 'Nr nieruchomości lokalizacji przedsięwzięcia', group: 'Inwestycja' },
  { key: 'invKod', label: 'Kod pocztowy lokalizacji przedsięwzięcia', group: 'Inwestycja' },
  { key: 'prospektUrl', label: 'Adres strony internetowej prospektu informacyjnego', group: 'Inwestycja' },
  { key: 'requiredParts', label: 'Części/pomieszczenia wymagane do zakupu', group: 'Inwestycja' },
  { key: 'optionalParts', label: 'Części/pomieszczenia opcjonalne do zakupu', group: 'Inwestycja' },
]
