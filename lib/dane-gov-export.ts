import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

// Generator dziennego raportu cen lokali dla portalu dane.gov.pl (ustawa o
// jawnosci cen mieszkan, Dz.U.2025.758). Format: CSV UTF-8, separator przecinek,
// puste pola jako literalne "X" (konwencja przyjeta przez dane.gov.pl).
// Schemat 55 kolumn — odwzorowany z realnego, przyjetego pliku dewelopera.
// Patrz docs/raportowanie-dane-gov-rozpoczecie.md (research) + docs/changelog.md.

export { DANE_GOV_SETTING_FIELDS } from '@/lib/dane-gov-fields'

// Naglowki 55 kolumn — kolejnosc obowiazujaca, odwzorowana z pliku przyjetego
// przez dane.gov.pl. NIE zmieniaj kolejnosci bez weryfikacji ze wzorcem.
const CSV_HEADERS = [
  'Nazwa dewelopera',
  'Forma prawna dewelopera',
  'Numer KRS',
  'Nr wpisu do CEIDG',
  'NIP',
  'Nr REGON',
  'Nr telefonu',
  'Adres poczty elektronicznej',
  'Adres strony internetowej dewelopera',
  'Województwo adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Powiat adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Gmina adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Miejscowość adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Ulica adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Nr nieruchomości adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Nr lokalu adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Kod pocztowy adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Województwo adresu lokalu, w którym prowadzona jest sprzedaż',
  'Powiat adresu lokalu, w którym prowadzona jest sprzedaż',
  'Gmina adresu lokalu, w którym prowadzona jest sprzedaż',
  'Miejscowość adresu lokalu, w którym prowadzona jest sprzedaż',
  'Ulica adresu lokalu, w którym prowadzona jest sprzedaż',
  'Nr nieruchomości adresu lokalu, w którym prowadzona jest sprzedaż',
  'Nr lokalu adresu lokalu, w którym prowadzona jest sprzedaż',
  'Kod pocztowy adresu lokalu, w którym prowadzona jest sprzedaż',
  'Dodatkowe lokalizacje, w których prowadzona jest sprzedaż',
  'Sposób kontaktu nabywcy z deweloperem',
  'Województwo lokalizacji przedsięwzięcia deweloperskiego lub zadania inwestycyjnego',
  'Powiat lokalizacji przedsięwzięcia deweloperskiego lub zadania inwestycyjnego',
  'Gmina lokalizacji przedsięwzięcia deweloperskiego lub zadania inwestycyjnego',
  'Miejscowość lokalizacji przedsięwzięcia deweloperskiego lub zadania inwestycyjnego',
  'Ulica lokalizacji przedsięwzięcia deweloperskiego lub zadania inwestycyjnego',
  'Nr nieruchomości lokalizacji przedsięwzięcia deweloperskiego lub zadania inwestycyjnego',
  'Kod pocztowy lokalizacji przedsięwzięcia deweloperskiego lub zadania inwestycyjnego',
  'Rodzaj nieruchomości: lokal mieszkalny, dom jednorodzinny',
  'Nr lokalu lub domu jednorodzinnego nadany przez dewelopera',
  'Cena m 2 powierzchni użytkowej lokalu mieszkalnego / domu jednorodzinnego [zł]',
  'Cena lokalu mieszkalnego lub domu jednorodzinnego będących przedmiotem umowy stanowiąca iloczyn ceny m2 oraz powierzchni [zł]',
  'Cena lokalu mieszkalnego lub domu jednorodzinnego uwzględniająca cenę lokalu stanowiącą iloczyn powierzchni oraz metrażu i innych składowych ceny, o których mowa w art. 19a ust. 1 pkt 1), 2) lub 3) [zł]',
  'Rodzaj części nieruchomości będących przedmiotem umowy',
  'Oznaczenie części nieruchomości nadane przez dewelopera',
  'Cena części nieruchomości, będących przedmiotem umowy [zł]',
  'Rodzaj pomieszczeń przynależnych, o których mowa w art. 2 ust. 4 ustawy z dnia 24 czerwca 1994 r. o własności lokali',
  'Oznaczenie pomieszczeń przynależnych, o których mowa w art. 2 ust. 4 ustawy z dnia 24 czerwca 1994 r. o własności lokali',
  'Wyszczególnienie cen pomieszczeń przynależnych, o których mowa w art. 2 ust. 4 ustawy z dnia 24 czerwca 1994 r. o własności lokali [zł]',
  'Wyszczególnienie praw niezbędnych do korzystania z lokalu mieszkalnego lub domu jednorodzinnego',
  'Wartość praw niezbędnych do korzystania z lokalu mieszkalnego lub domu jednorodzinnego [zł]',
  'Wyszczególnienie rodzajów innych świadczeń pieniężnych, które nabywca zobowiązany jest spełnić na rzecz dewelopera w wykonaniu umowy przenoszącej własność',
  'Wartość innych świadczeń pieniężnych, które nabywca zobowiązany jest spełnić na rzecz dewelopera w wykonaniu umowy przenoszącej własność [zł]',
  'Adres strony internetowej, pod którym dostępny jest prospekt informacyjny',
  'Wyszczególnienie rodzajów części nieruchomości oraz pomieszczeń, o których mowa w art. 2 ust. 4 ustawy z dnia 24 czerwca 1994 r. o własności lokali, które znajdują się w ofercie dewelopera i są wymagane do zakupu',
  'Wyszczególnienie rodzajów części nieruchomości oraz pomieszczeń, o których mowa w art. 2 ust. 4 ustawy z dnia 24 czerwca 1994 r. o własności lokali, które znajdują się w ofercie dewelopera i są opcjonalne do zakupu',
  'Grupa lokali',
  'Data od której obowiązuje oferta',
  'Data do której obowiązuje oferta',
]

// Statusy lokalu uznawane za "w ofercie" — tylko te trafiaja do raportu.
// SPRZEDANY/NIEDOSTEPNY znikaja z pliku (raportujemy ceny ofertowe, nie historie).
const OFFER_STATUSES = ['WOLNY', 'ZAREZERWOWANY']

const PLACEHOLDER = 'X'

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return PLACEHOLDER
  const s = String(value)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

// Liczba w formacie raportu — kropka dziesietna, bez separatora tysiecy.
function num(n: number): string {
  return Number(n).toString()
}

// Formatuje instant w strefie Europe/Warsaw jako "YYYY-MM-DD HH:mm:ss+02:00".
function fmtWarsaw(d: Date): string {
  const dtParts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => dtParts.find((p) => p.type === t)?.value || ''
  const stamp = `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
  const offName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw', timeZoneName: 'longOffset',
  }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00'
  const offset = offName.replace('GMT', '') || '+00:00'
  return `${stamp}${offset}`
}

type UnitRow = {
  number: string
  type: string
  area: number
  pricePerSqmGross: number
  priceGross: number
  building: string | null
  priceHistory: { changedAt: Date }[]
  updatedAt: Date
}

// Buduje jeden wiersz CSV dla lokalu. settings = mapa klucz->wartosc z tabeli Settings.
function buildRow(unit: UnitRow, settings: Record<string, string>, validUntil: string): string {
  const g = (key: string) => settings[key] || ''
  const validFrom = fmtWarsaw(unit.priceHistory[0]?.changedAt ?? unit.updatedAt)

  // Lokale mieszkalne — pelny opis ceny w kolumnach 35-39.
  // Parking/garaz/komorka — jako osobne wiersze opisane w kolumnach czesci
  // nieruchomosci (40-42) lub pomieszczen przynaleznych (43-45), kol. 35-39 = X.
  const isDwelling = unit.type === 'MIESZKALNY'
  const isParking = unit.type === 'PARKING' || unit.type === 'GARAZ'
  const isStorage = unit.type === 'KOMORKA'

  const partType = isParking
    ? (unit.type === 'GARAZ' ? 'Garaż' : 'Miejsce postojowe')
    : ''
  const storageType = isStorage ? 'Komórka lokatorska' : ''

  const cells = [
    g('companyName'),                                  // 1
    g('devLegalForm'),                                 // 2
    g('devKrs'),                                       // 3
    g('devCeidg'),                                     // 4
    g('devNip'),                                       // 5
    g('devRegon'),                                     // 6
    g('devPhone'),                                     // 7
    g('devEmail'),                                     // 8
    g('devWww'),                                       // 9
    g('devAddrWoj'),                                   // 10
    g('devAddrPowiat'),                                // 11
    g('devAddrGmina'),                                 // 12
    g('devAddrMiejscowosc'),                           // 13
    g('devAddrUlica'),                                 // 14
    g('devAddrNr'),                                    // 15
    g('devAddrLokal'),                                 // 16
    g('devAddrKod'),                                   // 17
    g('salesWoj'),                                     // 18
    g('salesPowiat'),                                  // 19
    g('salesGmina'),                                   // 20
    g('salesMiejscowosc'),                             // 21
    g('salesUlica'),                                   // 22
    g('salesNr'),                                      // 23
    g('salesLokal'),                                   // 24
    g('salesKod'),                                     // 25
    g('salesExtra'),                                   // 26
    g('salesContact'),                                 // 27
    g('invWoj'),                                       // 28
    g('invPowiat'),                                    // 29
    g('invGmina'),                                     // 30
    g('invMiejscowosc'),                               // 31
    g('invUlica'),                                     // 32
    g('invNr'),                                        // 33
    g('invKod'),                                       // 34
    isDwelling ? 'Lokal mieszkalny' : '',              // 35 Rodzaj nieruchomości
    unit.number,                                       // 36 Nr lokalu nadany przez dewelopera
    isDwelling ? num(unit.pricePerSqmGross) : '',      // 37 Cena m2 [zł]
    isDwelling ? num(round2(unit.pricePerSqmGross * unit.area)) : '', // 38 cena = m2 × powierzchnia
    isDwelling ? num(unit.priceGross) : '',            // 39 cena z innymi składowymi
    partType,                                          // 40 Rodzaj części nieruchomości
    isParking ? unit.number : '',                      // 41 Oznaczenie części nieruchomości
    isParking ? num(unit.priceGross) : '',             // 42 Cena części nieruchomości [zł]
    storageType,                                       // 43 Rodzaj pomieszczeń przynależnych
    isStorage ? unit.number : '',                      // 44 Oznaczenie pomieszczeń przynależnych
    isStorage ? num(unit.priceGross) : '',             // 45 Cena pomieszczeń przynależnych [zł]
    '',                                                // 46 Prawa niezbędne — wyszczególnienie
    '',                                                // 47 Prawa niezbędne — wartość
    '',                                                // 48 Inne świadczenia — wyszczególnienie
    '',                                                // 49 Inne świadczenia — wartość
    g('prospektUrl'),                                  // 50 URL prospektu
    g('requiredParts'),                                // 51 Części wymagane do zakupu
    g('optionalParts'),                                // 52 Części opcjonalne do zakupu
    unit.building || '',                               // 53 Grupa lokali
    validFrom,                                         // 54 Data od której obowiązuje oferta
    validUntil,                                        // 55 Data do której obowiązuje oferta
  ]
  return cells.map(csvCell).join(',')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type DaneGovCsvResult = { csv: string; md5: string; rowCount: number }

// Generuje pelny CSV raportu na podany dzien (YYYY-MM-DD wg strefy Europe/Warsaw).
// "Data do której obowiązuje oferta" = koniec tego dnia (23:59:59 czasu PL).
export async function generateDaneGovCsv(dateStr: string): Promise<DaneGovCsvResult> {
  const settingsRows = await prisma.settings.findMany()
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]))

  const units = await prisma.unit.findMany({
    where: { status: { in: OFFER_STATUSES }, type: { in: ['MIESZKALNY', 'PARKING', 'GARAZ', 'KOMORKA'] } },
    orderBy: { number: 'asc' },
    select: {
      number: true, type: true, area: true, pricePerSqmGross: true,
      priceGross: true, building: true, updatedAt: true,
      priceHistory: { orderBy: { changedAt: 'desc' }, take: 1, select: { changedAt: true } },
    },
  })

  // Koniec dnia raportowego w strefie PL — z offsetem tego dnia.
  const endOfDay = new Date(`${dateStr}T23:59:59`)
  const validUntil = fmtWarsaw(endOfDay)

  const lines = [CSV_HEADERS.join(','), ...units.map((u) => buildRow(u, settings, validUntil))]
  // CRLF + BOM — bezpieczne dla narzedzi czytajacych UTF-8 CSV po stronie urzedu.
  const csv = '﻿' + lines.join('\r\n') + '\r\n'
  const md5 = crypto.createHash('md5').update(csv, 'utf8').digest('hex')
  return { csv, md5, rowCount: units.length }
}

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Generuje katalog otwarte_dane XML (schema dane.gov.pl) listujacy wszystkie
// dzienne snapshoty jako zasoby. Ten URL rejestruje sie raz u ministerstwa —
// harvester sam dociaga nowe dzienne pliki. baseUrl bez koncowego slasha.
export async function generateCatalogXml(baseUrl: string): Promise<string> {
  const snapshots = await prisma.daneGovSnapshot.findMany({ orderBy: { date: 'asc' } })
  const settingsRows = await prisma.settings.findMany({ where: { key: { in: ['companyName', 'investmentName'] } } })
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]))
  const company = settings.companyName || 'Deweloper'
  const investment = settings.investmentName || 'Inwestycja'

  const resources = snapshots
    .map((s) => {
      const url = `${baseUrl}/api/public/dane-gov/file/${s.date}.csv`
      const title = `Ceny ofertowe mieszkań ${s.date}`
      return `    <resource status="published">
      <extIdent>maraf-ceny-${s.date}</extIdent>
      <url>${xmlEsc(url)}</url>
      <title>
        <polish>${xmlEsc(title)}</polish>
      </title>
      <description>
        <polish>${xmlEsc(`Wykaz cen ofertowych lokali inwestycji ${investment} na dzień ${s.date}.`)}</polish>
      </description>
      <availability>remote</availability>
      <dataDate>${s.date}</dataDate>
    </resource>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<datasets xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://www.dane.gov.pl/static/xml/otwarte_dane_latest.xsd">
  <dataset status="published">
    <extIdent>maraf-ceny-mieszkan</extIdent>
    <title>
      <polish>${xmlEsc(`Ceny ofertowe mieszkań dewelopera ${company}`)}</polish>
    </title>
    <description>
      <polish>${xmlEsc(`Codzienny wykaz cen ofertowych lokali mieszkalnych i przynależności inwestycji ${investment}, publikowany zgodnie z ustawą o jawności cen.`)}</polish>
    </description>
    <updateFrequency>daily</updateFrequency>
    <categories>
      <category>ECON</category>
    </categories>
    <resources>
${resources}
    </resources>
    <tags>
      <tag lang="pl">ceny mieszkań</tag>
      <tag lang="pl">deweloper</tag>
      <tag lang="pl">nieruchomości</tag>
    </tags>
    <hasDynamicData>true</hasDynamicData>
  </dataset>
</datasets>
`
}
