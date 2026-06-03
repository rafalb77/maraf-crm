# Moduł Finanse — decyzje projektowe

Zastępuje obecne prowadzenie płatności w Excelu (`PŁATNOŚCI 2026.xlsx` — siostra Marta wprowadza, tata Bohdan akceptował kolorem). Wdrożony 2026-05-21 do 2026-05-31 (commity `4cdbaf5` → `b4ad516`).

**Pliki powiązane:**
- `docs/finanse-rozpoczecie.md` — pełna historia decyzji + feedback Marty (przeczytaj dla kontekstu „dlaczego tak")
- `docs/finanse-ksef-rozpoczecie.md` — research integracji KSeF

---

## Co JUŻ DZIAŁA

### Architektura nadrzędna

**Multi-firma (Maraf + Maraf Development) jako PEŁNA separacja.**
- Globalny przełącznik firmy w pasku górnym całego modułu (`/finanse/layout.tsx`)
- Aktywna firma w cookie `finanse_company` (MARAF / MARAF_DEVELOPMENT, default MARAF)
- **Wszystkie widoki** czytają `getActiveCompany()` i filtrują dane — dashboard, faktury kosztowe/przychodowe, podatki, kaucje, kolejka, kontrahenci
- **Nowe faktury** auto-przypisują się do aktywnej firmy
- MD ma fioletowy akcent w pasku (`#7c3aed` / `#faf5ff`) — żeby Marta zawsze widziała w kontekście której firmy pracuje
- NIP-y: Maraf `7322069952`, Maraf Development `7322202144`

### Schema danych (`prisma/schema.prisma`)

**Faktury kosztowe (zakupowe):**
```
Vendor                    — kontrahent (PROMATBUD, STAFFA, EURON...): name unique, category, nip, isActive
PurchaseInvoice           — faktura zakupowa
  company                 — MARAF | MARAF_DEVELOPMENT
  vendorId, number        — unique [vendorId, number]
  subVendor               — np. "Janpol", "PATRIMEX" pod STAFFA
  issueDate, dueDate
  vatRate, amountNet/Vat/Gross
  status                  — WPROWADZONA | DO_ZATWIERDZENIA (legacy) | ZATWIERDZONA |
                            ZAPLANOWANA | OPLACONA | CZESCIOWO_OPLACONA | ODRZUCONA | ANULOWANA
  deposit, depositPct     — kaucja gwarancyjna (zatrzymana, ZWRACANA)
  depositReturnDate       — termin zwrotu
  depositReturnedAt       — kiedy zwrócona
  buildingCosts, electricity — potracenia bezzwrotne (KB, prąd)
  description, notes
  ksefNumber              — unique, numer KSeF (dedup przy synchronizacji)
  sourceSalesInvoiceId    — gdy koszt utworzony z FV przychodowej innej firmy grupy (cross-company)
  importedFromColor/Sheet/Row — audit pochodzenia z xlsx
PurchaseInvoicePayment    — N płatności per faktura (wspiera częściowe)
PurchaseInvoiceApproval   — audit trail akcji SUBMIT/APPROVE/REJECT/RESET/EDITED
PurchaseInvoiceAttachment — PDF faktur pod /uploads/finanse/
```

**Faktury przychodowe (sprzedażowe):**
```
SalesInvoice
  company                 — wystawca (MARAF / MD)
  number, recipientName   — odbiorca (FIRMA z Excela Marty)
  recipientCompany        — gdy odbiorca to firma grupy (cross-company auto-koszt)
  issueDate, dueDate, vatRate, amountNet/Vat/Gross
  deposit, buildingCosts  — kaucja zatrzymana przez klienta, KB
  isAdvance               — faktura zaliczkowa (NIE wliczana do CIT/VAT do konwersji)
  status                  — WYSTAWIONA | CZESCIOWO_OPLACONA | OPLACONA | ANULOWANA
  ksefNumber              — unique
  linkedPurchaseInvoiceId — utworzony koszt u odbiorcy (cross-company)
SalesInvoicePayment       — wpłaty klienta
```

**KSeF:**
```
KsefConfig                — per firma (unique company): nip, token, environment (PROD/TEST/DEMO),
                            enabled, syncFromDate, lastSyncAt + status/error/count
```

### Widoki (`app/(app)/finanse/*`)

| URL | Co robi |
|---|---|
| `/finanse` | Dashboard — 3 KPI (zaległe, do zapłaty 7d, zapłacone w mc) + TOP 10 niezapłaconych vendorów + kafelek kaucji do zwrotu |
| `/finanse/faktury` | Lista faktur kosztowych: foldery (Staffa/Promatbud/Bauter/Stałe/Inne/Pozostali), filtry (vendor/status/szukaj/zakres dat/zaległe), 9 sortowalnych kolumn klikalnych, multi-select + przelew zbiorczy, edycja komentarza inline, podsumowanie netto/VAT/brutto całego filtra |
| `/finanse/faktury/[id]` | Szczegóły faktury + akcje workflow + kaucja/KB/prąd + płatności + historia akceptacji |
| `/finanse/kolejka-platnosci` | Faktury do zapłaty w 30 dni, **pogrupowane po kontrahencie**, sortowane po sumie do zapłaty |
| `/finanse/kaucje` | Lista zatrzymanych kaucji gwarancyjnych, termin zwrotu, przycisk „Zwrócona" |
| `/finanse/przychody` | Lista faktur przychodowych z kolumnami Marty (FIRMA/FV/wyst/termin/netto/VAT/brutto/wpłacono/pozostało/status) |
| `/finanse/przychody/[id]` | Szczegóły faktury przychodowej + wpłaty klienta + konwersja zaliczki + cross-company „Utwórz koszt u odbiorcy" |
| `/finanse/przychody/nowa` | Formularz nowej faktury przychodowej |
| `/finanse/podatki` | CIT 9% orientacyjny + VAT do zapłaty per firma/rok (bez faktur zaliczkowych) |
| `/finanse/kontrahenci` | Lista vendorów aktywnej firmy (z licznikiem faktur i sumą niezapłaconego) |
| `/finanse/nowa` | Formularz nowej faktury kosztowej |
| `/finanse/import` | UI importera xlsx (preview + commit) |
| `/finanse/ksef` | **Admin only** — konfiguracja KSeF per firma (NIP, token zamaskowany, środowisko, sync) |

### Endpointy API (`app/api/finanse/*`)

```
GET  /vendors
POST /vendors
POST /invoices                      — nowa faktura kosztowa (auto status ZATWIERDZONA)
PATCH /invoices/[id]                — edycja
DELETE /invoices/[id]               — admin only
PATCH /invoices/[id]/notes          — komentarz (każdy status)
PATCH /invoices/[id]/deposit        — kaucja + KB + prąd + markReturned
POST /invoices/[id]/transition      — APPROVE/REJECT/RESET/CANCEL (bez SUBMIT — workflow uproszczony)
POST /invoices/[id]/payments        — wpłata częściowa lub pełna
DELETE /invoices/[id]/payments/[paymentId]
POST /sales-invoices                — nowa faktura przychodowa
PATCH /sales-invoices/[id]          — edycja + konwersja zaliczki (isAdvance=false) + anulowanie
DELETE /sales-invoices/[id]         — admin only
POST /sales-invoices/[id]/payments  — wpłata klienta
DELETE /sales-invoices/[id]/payments/[paymentId]
POST /sales-invoices/[id]/create-cost — cross-company: utwórz fakturę kosztową u odbiorcy
POST /import?mode=preview|commit    — importer xlsx
POST /company                       — ustawia cookie aktywnej firmy
GET  /ksef/config                   — admin: lista konfiguracji obu firm
PATCH /ksef/config/[company]        — admin: zapis NIP/token/env/enabled/syncFromDate
POST /ksef/sync/[company]           — admin: ręczna synchronizacja
POST /ksef/auto-sync                — auto-sync przy wejściu (throttled 1h)
```

### Workflow akceptacji — UPROSZCZONY

**Decyzja 2026-05-31:** Marta sama zatwierdza faktury. Brak osobnej fazy „do zatwierdzenia" jako kolejki dla Bohdana.

- Faktury wpadają od razu jako **`ZATWIERDZONA`** (POST /invoices, KSeF sync, importer xlsx, scripts/import-finanse.js)
- Akcje w szczegółach faktury (`InvoiceActions`): Zatwierdź / Odrzuć / Cofnij do edycji / Anuluj — głównie do cofania pomyłek
- Permission `finanse.approve` istnieje w `lib/permissions.ts` ale **nie jest wymagany** w endpoincie `/transition` — każdy z `finanse` może zatwierdzać
- Strona `/finanse/do-zatwierdzenia` została **usunięta**; kafelek z dashboardu — także

### Integracje

**1. Importer xlsx (`lib/finanse-import.ts` + `scripts/import-finanse.js`)**
- 5 zakładek: PROMATBUD, BAUTER, STAFFA, STAŁE (sectionMode → rozbicie na sekcje-kontrahentów), INNE
- USUNIĘTE z importu (decyzje Marty 2026-05-21): MURARZ (dublował STAFFA), SANTANDER, EFL (stare leasingi 2023)
- Layout A (FV w kol A) vs Layout B (FV w kol B, subkontrahent w kol A)
- STAŁE = sectionMode: nagłówek sekcji (kol A wypełnione, FV puste) staje się osobnym Vendorem (EURON, PLAY, TOYA, POLISA, Jawne, Develogic, MD, Bogdan, Marta, Rafał)
- Subwiersze „zapłacono X / pozostało Y" agregowane w `PurchaseInvoicePayment`
- Dedup po (vendorName, number) zapobiega duplikatom
- **NIE czyta kolumn kaucji** (N/P/Q były tylko w MURARZ; w STAFFA to śmieci powodujące absurdalne kaucje, np. 2.9e25 zł — fix 2026-05-21)
- Pierwszy import 2026-05-21: **205 faktur, 13 vendorów, 148 płatności** z `PŁATNOŚCI 2026.xlsx`

**2. KSeF API 2.0 — pobieranie faktur (read-only, `lib/ksef-client.ts`)**
- Pełna implementacja własna (nie używamy `@ksef/client` — biblioteka skupia się na wysyłaniu, plus brak `dist/` po install z GitHub)
- Auth flow: `GET /security/public-key-certificates` → RSA-OAEP-SHA256 encrypt `token|timestamp` → `POST /auth/challenge` → `POST /auth/ksef-token` → polling → `POST /auth/token/redeem` → Bearer accessToken
- Pobieranie: `POST /invoices/query/metadata` (filtr `subjectType: Subject1` = wystawione / `Subject2` = otrzymane, `dateRange.dateType: Issue`) + `GET /invoices/ksef/{ksefNumber}` (plain XML)
- Parser FA(3): `fast-xml-parser`, mapuje P_1 (data), P_2 (numer), P_13_1..7 (netto wg stawek), P_14_1..7 (VAT), P_15 (brutto), Podmiot1/Podmiot2 (sprzedawca/nabywca + NIP)
- `syncCompanyFromKsef(company)` — pobiera Subject1 i Subject2 od `lastSyncAt`/`syncFromDate`, upsert SalesInvoice/PurchaseInvoice po `ksefNumber` (unique), vendor matching po NIP, auto cross-company gdy buyerNip = NIP firmy grupy
- Auto-sync przy wejściu (`AutoSyncOnMount` w layoucie) — throttle 1h, cichy fail
- **Status:** „best effort" — może wymagać 2-5 iteracji po pierwszych realnych syncach (różnice body/response względem dokumentacji)

**3. Saldeo (księgowość zewnętrzna)** — zostaje. CRM ciągnie z KSeF tylko READ-only dla wglądu/cashflow, nie wystawia faktur. KSeF nie jest naszą domeną fakturowania.

### Foldery główne i sortowanie listy faktur

**Pasek folderów u góry `/finanse/faktury`:**
```
[Wszystkie] [Staffa] [Promatbud] [Bauter] [Stałe] [Inne] [Pozostali]
```
Mapowanie nazwy vendora → folder w `lib/finanse-folders.ts` (hardcoded, bez schema). „Pozostali" = vendory nieprzypisani (np. auto-utworzeni z KSeF).

**9 sortowalnych kolumn** (klikalne nagłówki w `FakturyTable`):
- vendor (A-Z), number (Nr FV), issueDate, dueDate, amountNet, vatRate, amountVat, amountGross, status
- Klik raz = wstępny kierunek (asc dla tekstów, desc dla dat/kwot), drugi klik = toggle
- Strzałka ↕ szara (nieaktywna) / ↑/↓ niebieska (aktywna)
- Alternatywnie: dropdown w filtrach z 18 opcjami sortowania

### Auto-sync KSeF przy wejściu

Komponent `AutoSyncOnMount` w `/finanse/layout.tsx` — `useEffect` przy mount → `POST /api/finanse/ksef/auto-sync` dla aktywnej firmy:
- **Throttle 1h** — pomija jeśli `lastSyncAt < 1h temu` (nie odpala przy każdym kliknięciu)
- **Cichy skip** — gdy brak KSeF config / disabled / brak tokenu (Marta nie widzi nic)
- **Cichy fail** — błąd KSeF nie blokuje UI, zapisuje `lastSyncStatus=ERROR` + treść (widoczne w `/finanse/ksef`)
- Badge na górze: 🔵 „Synchronizuję KSeF…" → 🟢 „✓ N nowych faktur" (zanika po 5s) → router.refresh

### Permissions

`lib/permissions.ts`:
- `'finanse'` — sekcja modułu (lista, podgląd, dodawanie, edycja, akceptacja)
- `'finanse.approve'` — sub-permission, **istnieje ale nie wymagana** (uproszczenie 2026-05-31). Zostawiona w schemacie na wypadek przyszłego powrotu do workflow akceptacji wielopoziomowej.
- `/finanse/ksef` + `/api/finanse/ksef/*` — **admin only** (sprawdzane w stronie/endpoincie, nie przez middleware)

---

## Cross-company Maraf↔MD

Gdy faktura przychodowa ma odbiorcę = firma grupy (Maraf wystawia dla MD lub odwrotnie):

**Ręcznie** (przycisk w szczegółach FV przychodowej):
- `POST /sales-invoices/[id]/create-cost` → tworzy `PurchaseInvoice` u odbiorcy
- Vendor = nazwa firmy wystawcy („Maraf" / „Maraf Development"), auto-utworzony
- Status `WPROWADZONA` → Marta zatwierdza w drugiej firmie
- Link w obie strony: `sales.linkedPurchaseInvoiceId` ↔ `purchase.sourceSalesInvoiceId`
- Guard przed duplikatami (drugi klik nie tworzy ponownie)

**Automatycznie z KSeF:**
- KSeF widzi obie strony. Maraf zaciągnie ją jako Subject1, MD jako Subject2 — bez ręcznego klikania.
- `detectGroupCompany(nip)` w `lib/ksef-client.ts` ustawia `recipientCompany` jeśli buyerNip pasuje do firm grupy.

---

## Decyzje projektowe (chronologicznie)

**2026-05-17 (założycielskie):**
- Pełna Faza 1 MVP — zastępujemy Excel 100%
- Księgowość zewnętrzna (Saldeo) zostaje; CRM nie wystawia faktur
- Cała historia z xlsx importowana (217 faktur z PŁATNOŚCI 2026.xlsx)
- Akceptacja przez web (Bohdan loguje się do aplikacji, bez magic-link)
- Saldeo integracja API → Faza 2 (bloker: klucz API od biura)
- Częściowe płatności: faktura zatwierdzona raz, N płatności bez osobnej akceptacji

**2026-05-21 (feedback Marty 1 — pierwszy realny użytkownik):**
- Podkontrahent (Janpol/PATRIMEX) → główny tytuł, STAFFA (parasol) → mały szary
- Lista faktur: kolumny rozbite na netto/VAT%/kwotaVAT/brutto, czerwone niezapłacone, komentarz inline, podsumowanie filtra w stopce, multi-select + pasek sumy
- Kolejka płatności → grupowanie po kontrahencie
- Filtr firmy na liście
- Szczegóły faktury: nazwa kontrahenta `text-3xl`, FV pomocniczo

**2026-05-21 (feedback Marty 2 — restrukturyzacja):**
- USUŃ zakładki MURARZ (dubluje STAFFA) / SANTANDER / EFL (stare leasingi)
- STAŁE → rozbij na osobnych kontrahentów per sekcja
- Multi-firma od początku: pole `company` na fakturach + cross-company `recipientCompany`
- Skrypt `wipe-finanse.js` + reimport poprawionym importerem

**2026-05-21 (feedback Marty 3 — kaucje):**
- Kaucja jako % LUB kwota (oba)
- Data zwrotu wpisywana ręcznie per faktura
- Widok `/finanse/kaucje` + alert na dashboardzie (mail przypominający → Faza 2 cron)
- Płatności wg kwoty należnej (brutto − kaucja − KB − prąd), nie wg brutto

**2026-05-21 (feedback Marty 4 — faktury przychodowe + CIT/VAT):**
- Osobny rejestr `/finanse/przychody` z kolumnami Marty
- Faktury zaliczkowe (`isAdvance`) wykluczone z CIT/VAT do konwersji
- CIT 9% orientacyjny + VAT do zapłaty — adnotacja „oficjalne robi biuro/Saldeo"
- Cross-company: pole `recipientCompany` na SalesInvoice

**2026-05-21 (po teście importu):**
- Bug: importer czytał śmieci jako kaucje (kolumny N/P/Q w STAFFA dawały kwoty rzędu 2.9e25 zł)
- Fix: importer NIE czyta kaucji w ogóle (były tylko w usuniętym MURARZ); skrypt `fix-finanse-deposits.js` zerujący błędne kaucje w bazie

**2026-05-21 (separacja firm):**
- Globalny przełącznik firmy w layoutcie zamiast filtrów na każdej liście
- Cookie `finanse_company` + `getActiveCompany()` server-side
- Maraf Development = fioletowy akcent w UI

**2026-05-21 (cross-company):**
- Decyzja: przyciskiem (świadomie), nie automatycznie
- Status u odbiorcy `WPROWADZONA` (przejdzie workflow normalnie)
- Pola `linkedPurchaseInvoiceId` (sales) i `sourceSalesInvoiceId` (purchase) zapobiegają duplikatom

**2026-05-21 (KSeF szkielet):**
- Read-only z KSeF dla obu firm; Saldeo zostaje dla księgowości
- Sync od `2026-06-01`
- NIP Maraf `7322069952`, MD `7322202144`
- Akceptacja przez web

**2026-05-31 (implementacja KSeF + porządki):**
- Pełna implementacja `lib/ksef-client.ts` (auth flow z RSA-OAEP, query metadata, getInvoiceXml, parser FA(3))
- Auto-sync przy wejściu z throttle 1h
- USUŃ stronę „Do zatwierdzenia" — Marta sama zatwierdza, faktury wpadają od razu jako `ZATWIERDZONA`
- Foldery główne (Staffa/Promatbud/Bauter/Stałe/Inne/Pozostali) jako taby
- 9 klikalnych nagłówków kolumn (sortowanie z th)

**2026-06-02/03 (statystyki + finansowanie inwestycji):**
- Strona `/finanse/statystyki` — 6 widgetów (pulse KPI, cashflow 12mc, aging buckets, TOP10 kontrahentów, koncentracja ryzyka, heatmapa 90dni). Commit `0645fd5`.
- **Moduł Finansowanie inwestycji** (`/finanse/finansowanie`) — kredyty + escrow OMRP + zwroty VAT. Commit `334a0f6`. Patrz sekcja niżej.

---

## Moduł Finansowanie inwestycji (kredyty + escrow + zwroty VAT)

**Wdrożony 2026-06-03, commit `334a0f6`. Etap 1 MVP.** Widoczny TYLKO dla Maraf Development (deweloper). Maraf (generalny wykonawca) widzi placeholder — nie ma kredytów inwestycyjnych ani rachunków powierniczych.

### Po co to powstało

Marta zapytała jak kredyt obrotowy/inwestycyjny pod inwestycję ma się do wykresu cashflow. Okazało się że dotychczasowy cashflow pokazywał tylko **wynik operacyjny** (faktury vs faktury = P&L), a nie **rzeczywisty przepływ gotówki**. Dla dewelopera z kredytem na karku to dwie różne rzeczy. MD ma 4 strumienie gotówki, nie 2:

```
                   KONTO OPERACYJNE MD
                    ▲    ▲    ▲    ▲
       kredyt inwest.  escrow  zwroty VAT  FV sprzedaży
       (transze→MD,   (uwol-   (z US)      (po przeniesieniu
        spłata z MD)   nienia)              własności)
                    
       kredyt VAT (bank płaci VAT z FV kosztowych
                   BEZPOŚREDNIO do dostawcy, NIE przez MD;
                   spłacany ze zwrotów VAT)
```

### Decyzje (ustalenia z Rafałem 2026-06-02/03)

| Pytanie | Decyzja |
|---|---|
| Rachunek deweloperski | **OMRP** (otwarty mieszkaniowy) — bank uwalnia transze etapowo po milestone'ach |
| Odsetki kredytu | **Część raty bez FV** — bank pobiera kapitał+odsetki jednym przelewem. `LoanRepayment` ma `principal`+`interest`+`fees`. Odsetki NIE są wpisywane jako FV kosztowa → na cashflow operacyjnym ich nie ma, na gotówkowym doliczamy (bez podwajania) |
| Śledzenie wpłat lokatorów | **Tak, pełne** (deposit + release) — widać ile pieniędzy jest „uwięzionych" w escrow vs uwolnione |
| Kredyt inwest. vs VAT | **Dwie osobne umowy** (nie sublimity) — każdy to osobny `Loan` z innym `type` |
| Śledzenie która FV opłacona z kredytu VAT | **Nie** — wystarczą sumaryczne transze kredytu VAT (mniej klikania) |
| Wpłaty na escrow | **Etap 2: automat z modułu Sprzedaż.** Etap 1: ręcznie przez Martę (formularzem) |
| Ścieżka wdrożenia | **MVP w 2 etapach** — najpierw Finansowanie z ręcznym wpisywaniem, potem rozbudowa Sprzedaży + auto-trigger |

### Schema (6 nowych modeli, `prisma/schema.prisma`)

```
Loan                — kredyt bankowy
  company           — MARAF_DEVELOPMENT (default)
  type              — INWESTYCYJNY | VAT | OBROTOWY | INNE
  bank, contractNumber, limit, interestRate, signedAt, expiresAt
  status            — AKTYWNY | ZAMKNIETY
  ├ LoanTranche     — wypłata transzy (date, amount, note)
  └ LoanRepayment   — spłata (date, principal, interest, fees) — jeden przelew
VatRefund           — zwrot VAT z US (date, amount, periodLabel, appliedToLoanId?)
EscrowAccount       — rachunek powierniczy (type OMRP|ZMRP, investmentName, bank, accountNumber)
  ├ EscrowDeposit   — wpłata nabywcy (date, amount, buyerName?, contractNumber?, unitId? → Unit)
  └ EscrowRelease   — uwolnienie transzy (date, amount, milestone?)
```

Relacja `Unit.escrowDeposits` dodana (opcjonalny link wpłaty do lokalu).

### Agregaty (`lib/finanse-stats.ts`)

- `getLoansSummary(company)` — per type: limit, wykorzystane (drawn), do spłaty (outstanding = drawn − principalRepaid), dostępne
- `getEscrowSummary(company)` — w escrow (deposits − releases), uwolnione YTD, uwolnione łącznie
- `getVatRefundsSummary(company)` — totalYTD, totalAll, na spłatę kredytu VAT
- `getCashflowGotowkowy12m(company)` — per miesiąc: wpływy (salesPaid + escrowReleased + vatRefunded) − wypływy (costsPaid + loanPrincipal + loanInterest + loanFees) = cashNet. Transze osobno (info, bo zobowiązanie a nie zysk)
- `getDscr(company)` — **DSCR (Debt Service Coverage Ratio)** = (zysk operacyjny + escrow uwolnione + zwroty VAT) / (raty K+O+P) za 12mc. Progi: ≥1.25 safe, 1.0-1.25 warn, <1.0 risk. Wszystkie zwracają puste/null gdy company ≠ MD.

### UI

- **`/finanse/finansowanie`** — server component (`page.tsx`) serializuje dane, `FinansowanieView.tsx` (client) ma 3 zakładki:
  - **Kredyty** — pogrupowane po type, karta rozwijana z sekcjami Transze + Spłaty, pasek wykorzystania linii (kolor wg %)
  - **Rachunki powiernicze** — karta rozwijana z sekcjami Wpłaty + Uwolnienia, saldo „w escrow vs uwolnione"
  - **Zwroty VAT** — tabela + formularz z dropdownem „przeznaczenie" (na konto / spłata kredytu VAT)
- **`/finanse/statystyki`** rozbudowane (tylko MD):
  - `FinansowanieKpi.tsx` — 5 kafelków (kredyt inwest / kredyt VAT / escrow / zwroty VAT / DSCR)
  - `CashflowChart.tsx` — przełącznik **Operacyjny / Gotówkowy** (przełącznik widoczny tylko gdy są dane gotówkowe = MD)

### Endpointy (`app/api/finanse/`)

```
loans/                     GET (lista+agregaty) POST
loans/[id]/                GET (szczegóły+transze+spłaty) PATCH DELETE
loans/[id]/tranches/       POST
loans/[id]/repayments/     POST
loan-tranches/[id]/        DELETE
loan-repayments/[id]/      DELETE
escrow-accounts/           GET POST
escrow-accounts/[id]/      GET PATCH DELETE
escrow-accounts/[id]/deposits/   POST
escrow-accounts/[id]/releases/   POST
escrow-deposits/[id]/      DELETE
escrow-releases/[id]/      DELETE
vat-refunds/               GET POST
vat-refunds/[id]/          PATCH DELETE
```

Wszystkie z `getServerSession` + 401. GET/POST list-level filtrują przez `getActiveCompany()`.

### ETAP 2 (niezrobione) — auto-EscrowDeposit z modułu Sprzedaż

**Bloker:** moduł Sprzedaż (`Contract`) NIE MA modelu wpłat. Jest tylko `reservationFee` (jednorazowa opłata rezerwacyjna). Żeby auto-tworzyć EscrowDeposit przy wpłacie nabywcy, trzeba najpierw:
1. Dodać model `ContractPayment` (harmonogram + faktyczne wpłaty: zaliczka/raty/ostateczna)
2. UI w `/sales/[id]` — sekcja „Wpłaty" gdzie Marta dodaje przelew nabywcy
3. Trigger: zapis `ContractPayment` na umowie MD → auto `EscrowDeposit` (link `contractPaymentId`), usunięcie → kasuje powiązany deposit
4. Retroaktywne matchowanie istniejących ręcznych depositów po `contractNumber`

Patrz `docs/finanse-finansowanie-etap2-rozpoczecie.md`.

---

## Pułapki i uwagi

1. **`ksefNumber` jako unique** — przy synchronizacji KSeF dedup po tym polu. Jeśli kiedyś ręcznie wpisana faktura ma już ksefNumber wpisany, kolejny import KSeF dostanie 409. Wpisz `ksefNumber` ręcznie tylko gdy wiesz co robisz.

2. **Auto-sync nie odpali się jeśli token nie ustawiony / `enabled=false`** — to celowe (cichy skip). Wejdź na `/finanse/ksef` żeby skonfigurować.

3. **KSeF API to „best effort"** — implementacja oparta na publicznej dokumentacji + repo `lkow/ksef-client-ts` (typy InvoiceQueryFilters). Pierwsze syncy mogą rzucać błędami; wklejać błąd z `/finanse/ksef` lub Coolify logs, iterować.

4. **Wielkość liter w nazwach vendorów** — STAFFA ma subkontrahentów z niespójnymi nazwami: `bauma`/`Bauma`, `patrimex`/`PATRIMEX`/`Patrimex`, `janpol`/`Janpol`/`JANPOL`. Wpisywane jako string `subVendor` (case-sensitive), więc na liście pojawiają się jako osobne. **Drobiazg do zrobienia** — normalizacja przy imporcie/wpisywaniu.

5. **Workflow akceptacji uproszczony** — faktury wpadają od razu jako `ZATWIERDZONA`. Status `DO_ZATWIERDZENIA` zostaje w schemie jako legacy (stare faktury sprzed 2026-05-31). Nowe nigdy go nie osiągają.

6. **Foldery główne to hardcoded mapowanie** w `lib/finanse-folders.ts` (nie pole w schemie). Jeśli pojawi się nowa zakładka w Excelu w przyszłości — trzeba dopisać do `FOLDERS` const + mapping.

7. **Sub-permission `finanse.approve`** — istnieje w `ALL_PERMISSIONS`/`SUB_PERMISSIONS` ale endpointy go NIE wymagają (decyzja: Marta sama zatwierdza). Można nadać Bohdanowi/innym jeśli kiedyś wrócimy do workflow wielopoziomowego.

8. **Cross-company gdy obie strony mają KSeF** — jeśli oba podmioty (Maraf + MD) zaciągają z KSeF, ta sama faktura pojawi się w obu firmach automatycznie (Subject1 u wystawcy, Subject2 u odbiorcy). **Ręczny przycisk „Utwórz koszt u odbiorcy" zostaje** dla faktur spoza KSeF (np. wystawionych przed wdrożeniem, ręcznie wpisanych).

9. **Mail przypominający o zwrocie kaucji** — wymaga crona (Coolify hook lub osobny webhook). NIE zaimplementowane; widok `/finanse/kaucje` + alert dashboard wystarczają jako „passive reminder".

---

## Co zostaje do zrobienia (potencjalne kierunki)

1. **Saldeo API integration** — pull/push faktur między Saldeo a CRM (eliminacja podwójnego wpisywania, gdy biuro też ma faktury w Saldeo). Bloker: klucz API od biura.

2. **Mail przypominający o kaucji** — Coolify cron `0 8 * * *` → endpoint sprawdzający kaucje z `depositReturnDate` w ciągu 30 dni, mail do Marty + Bohdana.

3. **Normalizacja subkontrahentów STAFFA** — `bauma`/`Bauma` → `Bauma` (jednolite); migracja danych + walidacja przy wpisywaniu.

4. **PODATKI w Excelu — osobny pod-moduł** (z `PŁATNOŚCI 2026.xlsx` zakładka PODATKI). Inny układ (per miesiąc, VAT/CIT/zwrot). Na razie pomijane w importerze; w aplikacji są tylko orientacyjne CIT/VAT z faktur.

5. **Faktury kosztowe wystawiane przez CRM (push do KSeF)** — wymaga `@ksef/client` w trybie write lub własnej implementacji wysyłania (encrypt invoice + session). Aktualnie tylko read.

6. **Powiązanie z inwestycjami** — pole `investmentId` na PurchaseInvoice jest w schemie, ale brak UI i raportu „koszty per inwestycja Novastaffa B1/B2…".

7. **OCR faktur PDF** — wrzuć PDF → AI wyciąga FV/daty/kwoty → Marta tylko weryfikuje. Niskie priorytet bo Saldeo już to robi.

8. **Eksport miesięczny do biura księgowego** — CSV/XLSX w formacie który Saldeo importuje. Format do uzgodnienia z biurem.

9. **🟡 ETAP 2 Finansowanie: auto-EscrowDeposit z modułu Sprzedaż** — wymaga rozbudowy Sprzedaży o `ContractPayment` (harmonogram wpłat nabywców) + trigger. Patrz `docs/finanse-finansowanie-etap2-rozpoczecie.md`.

10. **Powiązanie escrow ↔ inwestycja jako encja** — `investmentName` jest teraz tekstem. W przyszłości model `Investment` (etap deweloperski) z przypisaniem kredytów/kosztów/sprzedaży → IRR, NPV, „etap 1: zysk X, kredyt spłacony za N mc". Wspomniane przez Rafała („2/3 inwestycji/etapów równolegle, ale nie teraz").

---

## Kluczowe pliki (mapa)

```
prisma/schema.prisma                                          — modele Vendor + PurchaseInvoice* + SalesInvoice* + KsefConfig
lib/types.ts                                                  — Company, statusy, CIT_RATE, labels
lib/permissions.ts                                            — 'finanse' + sub-permission 'finanse.approve'
lib/finanse-format.ts                                         — fmtMoney, fmtDate, isOverdue, payableAmount (brutto - potrącenia)
lib/finanse-company.ts                                        — getActiveCompany() (cookie)
lib/finanse-folders.ts                                        — FOLDERS, FOLDER_LABELS, vendorIdsForFolder
lib/finanse-import.ts                                         — parser xlsx + buildDiff + commitImport
lib/ksef-defaults.ts                                          — NIP + syncFromDate per firma + walidacja NIP
lib/ksef-client.ts                                            — KsefClient (auth + queryMetadata + getInvoiceXml + decrypt) + parseKsefInvoiceXml + syncCompanyFromKsef
scripts/import-finanse.js                                     — CLI importer xlsx (Coolify Terminal)
scripts/wipe-finanse.js                                       — czyszczenie tabel Finansów (re-import)
scripts/fix-finanse-deposits.js                               — jednorazowy zerowacz błędnych kaucji
app/(app)/finanse/layout.tsx                                  — pasek z przełącznikiem firmy + AutoSyncOnMount
app/(app)/finanse/page.tsx                                    — dashboard
app/(app)/finanse/faktury/page.tsx                            — lista faktur kosztowych (foldery, filtry, SORT_OPTIONS)
app/(app)/finanse/faktury/[id]/page.tsx                       — szczegóły
app/(app)/finanse/kolejka-platnosci/page.tsx
app/(app)/finanse/kaucje/page.tsx
app/(app)/finanse/przychody/page.tsx + nowa + [id]
app/(app)/finanse/podatki/page.tsx
app/(app)/finanse/kontrahenci/page.tsx
app/(app)/finanse/nowa/page.tsx
app/(app)/finanse/import/page.tsx
app/(app)/finanse/ksef/page.tsx                               — admin only
app/(app)/finanse/statystyki/page.tsx                         — 6 widgetów + (MD) FinansowanieKpi + cashflow gotówkowy
app/(app)/finanse/finansowanie/page.tsx                       — kredyty/escrow/VAT (server) → FinansowanieView (client)
app/api/finanse/*                                             — wszystkie endpointy (w tym loans/escrow-accounts/vat-refunds + sub-zasoby)
lib/finanse-stats.ts                                          — agregaty stat (pulse/cashflow/aging/top/risk/heatmap + loans/escrow/vat/dscr/cashflow-gotówkowy)
components/finanse/finansowanie/FinansowanieView.tsx          — 3 zakładki (kredyty/escrow/VAT) z formularzami
components/finanse/stats/*.tsx                                — PulseCards, CashflowChart (+ tryb gotówkowy), AgingBuckets, TopVendorsChart, RiskConcentration, ActivityHeatmap, FinansowanieKpi
components/finanse/FakturyTable.tsx                           — tabela z multi-select, sortable th, inline comment
components/finanse/CompanySwitcher.tsx
components/finanse/AutoSyncOnMount.tsx
components/finanse/InvoiceActions.tsx                         — workflow (APPROVE/REJECT/RESET/CANCEL)
components/finanse/DepositForm.tsx                            — kaucja % lub kwota + KB + prąd + data zwrotu
components/finanse/AddPaymentForm.tsx + DeletePaymentButton + MarkDepositReturnedButton
components/finanse/SalesInvoiceActions.tsx                    — konwersja zaliczki + anulowanie
components/finanse/AddSalesPaymentForm + DeleteSalesPaymentButton
components/finanse/CreateCostButton.tsx                       — cross-company
components/finanse/KsefConfigCard.tsx                         — konfiguracja KSeF per firma
components/finanse/NewInvoiceForm.tsx + NewSalesInvoiceForm + ImportFinanseForm
components/layout/Sidebar.tsx                                 — workspace 'fin' z linkami (admin widzi KSeF)
```
