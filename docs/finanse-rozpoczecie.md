# Moduł Finanse — rozpoczęcie

🔴 **PRIORYTET WYSOKI** — zastępuje obecne prowadzenie płatności w Excelu (`PŁATNOŚCI 2026.xlsx`).

Dyskusja założycielska: 2026-05-17 (rozmowa user × Claude). Decyzje na dole sekcji „Decyzje już podjęte".

## Diagnoza obecnego stanu (Excel)

Plik `PŁATNOŚCI 2026.xlsx` — 9 zakładek, ~220 faktur za 2026, ~3 mln zł niezapłaconego, ~20 zaległych.

**Workflow w firmie:**
1. **Siostra** ręcznie wprowadza faktury do Excela (zakładka = kontrahent)
2. **Tata (Bohdan)** akceptuje płatności **zaznaczając kolorem** wiersz
3. Po wykonaniu przelewu siostra wpisuje datę w kolumnie `ZAPŁACONO`

**Kolory akceptacji** (zidentyfikowane w pliku):
- 🟥 `#E6B8AF` (jasny róż) = „do zapłaty / zaakceptowane / opłacone" (mix — używane też dla wymagalnych)
- 🟩 `#CCE6CC` (jasny zielony) = „termin w przyszłości, planowane"
- Brak koloru = stare/zamknięte pozycje (większość wierszy)

**Layout per zakładka** (z drobnymi wariantami):

| Kol | Pole |
|---|---|
| A (lub B) | FV (numer faktury) |
| B (lub C) | DATA WYST |
| C (lub D) | % VAT |
| D (lub E) | KWOTA BRUTTO |
| E (lub F) | TERMIN |
| H (lub I) | ZAPŁACONO (data) |
| I (lub J) | VAT |
| K (lub L) | KWOTA NETTO |

Warianty: PROMATBUD/BAUTER/SANTANDER/EFL mają FV w kolumnie A. STAFFA/MURARZ/STAŁE/INNE mają FV w B, a w A jest subkontrahent / inwestycja (np. „PATRIMEX" pod STAFFA, „AL-BUD" pod MURARZ). **MURARZ** ma dodatkowe kolumny: `N=kaucja`, `O=wc`, `P=Koszty budowy`, `Q=prąd`. **PODATKI** ma zupełnie inny układ — per miesiąc, dwie firmy (MARAF + MARAF DEV), kolumny VAT/CIT/zwrot/zapłata.

**Częściowe płatności** robione jako **subwiersze** pod fakturą (np. PROMATBUD R6-R8: faktura na 19 188 zł → R7 „zapłacono 8 865.04" → R8 „pozostało 10 322.96"). To **trzeba znormalizować** przy imporcie — 1 faktura = N płatności w osobnej tabeli.

**Lista 9 zakładek:**

| Zakładka | Typ | Faktur w 2026 | Niezapł. | Zaległe |
|---|---|---:|---:|---:|
| STAFFA | Dostawca (główny) | 154 | 38 | 12 |
| MURARZ | Dostawca (Banaszczyk + AL-BUD) | 8 | 5 | 4 |
| STAŁE | Koszty cykliczne (EURON itp.) | 36 | 7 | 4 |
| PROMATBUD | Dostawca | 9 | 6 | 0 |
| BAUTER | Dostawca | 3 | 1 | 0 |
| SANTANDER | Bank (raty/prowizje) | 4 | 2 | 0 |
| EFL | Leasing (AUDI) | 1 | 0 | 0 |
| INNE | Pozostałe | 6 | 2 | 0 |
| PODATKI | VAT/CIT per miesiąc | — | — | — |

## Problemy obecnego modelu

1. **Brak audit trail** — kolor można zmienić bez śladu, nie wiadomo *kto* i *kiedy* zaakceptował
2. **Brak alertów** — overdue znajduje się ręcznie skanując daty
3. **Brak widoku „co zapłacić w tym tygodniu"** — trzeba skanować 9 zakładek
4. **Częściowe płatności jako subwiersze** psują sumy i filtrowanie
5. **Zero powiązania z modułem Sprzedaż** — wpływy z umów rezerwacyjnych są w drugim świecie
6. **Skalowanie** — nowy dostawca = nowy arkusz ręcznie
7. **KSeF od 2026/2027** — Excel tego nie udźwignie (faktury zakupowe trzeba odbierać z systemu MF)
8. **Ryzyko utraty pliku** — Excel lokalny, brak wersjonowania

## Decyzje już podjęte (2026-05-17)

- ✅ **Zakres MVP: pełna Faza 1** — pełne zastąpienie Excela (nie półśrodki)
- ✅ **Księgowość: zewnętrzna** — biuro księgowe robi VAT/CIT/JPK. Biuro używa **Saldeo Smart** (BRAINSHARE) jako system OCR faktur + most do KSeF (wdrożone 2026 w związku z obowiązkiem KSeF). Patrz sekcja „Saldeo" niżej.
- ✅ **Import: cała historia z 2026 + co jest z lat poprzednich** — wszystkie 9 zakładek → baza, łącznie z wpisami z 2023-2025 z STAFFA/SANTANDER/EFL/BAUTER. Wymaga oczyszczenia (warianty layoutów, subwiersze).
- ✅ **Użytkownicy** istnieją w bazie:
  - **Bohdan Boruch** (`bogdan.boruch@maraf.pl`) → rola `APPROVER` (zatwierdza faktury)
  - **Marta** (`biuro@maraf.pl`) → rola `KSIEGOWY` (wprowadza faktury, robi przelewy)
  - **Rafał** → `ADMIN` (już ma)
- ✅ **Akceptacja przez web** — Bohdan loguje się do aplikacji i akceptuje w `/finanse/do-zatwierdzenia`. Nie robimy magic-link do akceptacji bez logowania.
- ✅ **Saldeo w MVP** — Faza 1 niezależna od Saldeo. Marta przez chwilę wpisuje podwójnie. Integracja Saldeo API → Faza 2 (po uzyskaniu klucza API od biura).
- ✅ **Częściowe płatności** — Bohdan akceptuje **całą fakturę raz**. `PurchaseInvoicePayment` to bookkeeping Marty (1 faktura = N płatności bez wymaganej osobnej akceptacji każdej).

## Saldeo — relacja z naszym modułem

Biuro księgowe używa **Saldeo Smart** (saldeosmart.pl) jako system OCR faktur i obiegu dokumentów. To zmienia obrazek dla naszego modułu Finanse w kilku punktach:

**Co to znaczy:**
- **KSeF nie jest naszym problemem** — Saldeo jest mostem do KSeF po stronie biura. Wycinamy KSeF z naszej Fazy 3.
- **Saldeo prawdopodobnie ma już faktury zakupowe** — bo biuro chce widzieć wszystkie faktury w Saldeo (do księgowania).
- **Marta dziś prawdopodobnie wprowadza podwójnie** — do Excela (dla rodziny / Bohdana do akceptacji) ORAZ do Saldeo (dla biura / KSeF). To jest **realny pain point** który nasz moduł powinien rozwiązać.

**Cele architektoniczne (kolejność do potwierdzenia z userem):**

1. **MVP** — Finanse jako niezależna aplikacja (importer xlsx, własna baza, workflow akceptacji). Marta nadal wpisuje równolegle do Saldeo. Decyzja: **akceptujemy chwilowe dublowanie**, żeby najpierw wyeliminować Excel.
2. **Faza 2** — integracja Saldeo API:
   - **Pull**: Saldeo → CodeCRM (faktury wprowadzone w Saldeo automatycznie pojawiają się w naszym inboksie Bohdana)
   - **Push**: CodeCRM → Saldeo (faktura wprowadzona u nas idzie automatycznie do Saldeo dla biura)
   - Decyzja kierunku zależy od tego co Marta woli wpisywać (gdzie ma OCR/UX lepsze)

**Bloker**: dostęp do Saldeo API — user musi zapytać biuro księgowe:
- Jaki plan Saldeo mają (czy zawiera API)?
- Czy mogą nam dać klucz API (lub założyć osobne konto API)?
- Czy są ograniczenia limitów per dzień/miesiąc?

**Wyjście awaryjne** — jeśli Saldeo API nie będzie dostępne, alternatywa to **eksport miesięczny z CodeCRM → CSV/XLSX w formacie który Saldeo importuje** (Saldeo wspiera import z xlsx).

## Plan implementacji — Faza 1 MVP

### 1. Schema Prisma (model danych)

```prisma
// status: AKTYWNY | NIEAKTYWNY
model Vendor {
  id          String   @id @default(cuid())
  name        String   @unique         // PROMATBUD, STAFFA, ZUS itd.
  shortCode   String?                   // skrót do UI (np. "PMB")
  nip         String?
  category    String   // DOSTAWCA | BANK | LEASING | URZAD | INNE
  notes       String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  invoices    PurchaseInvoice[]
}

// status: WPROWADZONA | DO_ZATWIERDZENIA | ZATWIERDZONA | ZAPLANOWANA | OPLACONA | CZESCIOWO_OPLACONA | ODRZUCONA | ANULOWANA
model PurchaseInvoice {
  id              String   @id @default(cuid())
  number          String                       // numer faktury od dostawcy (FV)
  vendorId        String
  vendor          Vendor   @relation(fields: [vendorId], references: [id])
  subVendor       String?                       // np. "PATRIMEX" pod STAFFA, "AL-BUD" pod MURARZ
  issueDate       DateTime                      // DATA WYST
  dueDate         DateTime?                     // TERMIN
  vatRate         Decimal  @db.Decimal(5,4)     // 0.23, 0.08, 0.05
  amountGross     Decimal  @db.Decimal(12,2)
  amountNet       Decimal  @db.Decimal(12,2)
  amountVat       Decimal  @db.Decimal(12,2)
  currency        String   @default("PLN")
  status          String   @default("WPROWADZONA")
  // metadane biznesowe
  investmentId    String?                       // przyszłość: powiązanie z inwestycją
  description     String?                       // np. "murowanie ścian I piętro" (z MURARZ.M)
  notes           String?                       // wolne pole
  // dodatkowe pola MURARZ (opcjonalne, dla większości puste)
  deposit         Decimal? @db.Decimal(12,2)   // kaucja
  buildingCosts   Decimal? @db.Decimal(12,2)   // koszty budowy
  electricity     Decimal? @db.Decimal(12,2)   // prąd
  // załączniki (PDF faktury)
  attachments     PurchaseInvoiceAttachment[]
  payments        PurchaseInvoicePayment[]
  approvals       PurchaseInvoiceApproval[]
  createdById     String
  createdBy       User     @relation("InvoiceCreator", fields: [createdById], references: [id])
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([vendorId, number])
  @@index([status, dueDate])
  @@index([vendorId, issueDate])
}

model PurchaseInvoicePayment {
  id          String   @id @default(cuid())
  invoiceId   String
  invoice     PurchaseInvoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  amount      Decimal  @db.Decimal(12,2)
  paidAt      DateTime
  bankAccount String?                  // skrót banku (ING, Santander, ...)
  reference   String?                  // tytuł przelewu
  notes       String?
  createdById String
  createdBy   User     @relation("PaymentCreator", fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
}

// action: SUBMITTED | APPROVED | REJECTED | RESET
model PurchaseInvoiceApproval {
  id          String   @id @default(cuid())
  invoiceId   String
  invoice     PurchaseInvoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  action      String
  comment     String?
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  createdAt   DateTime @default(now())
}

model PurchaseInvoiceAttachment {
  id          String   @id @default(cuid())
  invoiceId   String
  invoice     PurchaseInvoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  filename    String
  url         String                   // ścieżka pod /uploads/finanse/...
  mimeType    String
  uploadedAt  DateTime @default(now())
  uploadedById String
  uploadedBy  User     @relation(fields: [uploadedById], references: [id])
}
```

**Role / `User.role`** (extend istniejącego):
- `KSIEGOWY` — może wprowadzać/edytować faktury, **nie** może zatwierdzać. Widzi swój inbox i zaplanowane.
- `APPROVER` — widzi `/finanse/do-zatwierdzenia`, zatwierdza/odrzuca z komentarzem.
- `ADMIN` — wszystko (już istnieje).

### 2. Status workflow (zastępuje kolory)

```
[Siostra wprowadza]
WPROWADZONA → (siostra: "Wyślij do akceptacji") → DO_ZATWIERDZENIA
                                                            ↓
                                          [Bohdan w inboksie]
                                          ↙                              ↘
                                ZATWIERDZONA                    ODRZUCONA (z komentarzem)
                                       ↓                                    ↓
                            [siostra robi przelew]              (siostra poprawia → WPROWADZONA)
                                       ↓
                              OPLACONA (po dodaniu Payment z full kwotą)
                                       lub
                              CZESCIOWO_OPLACONA (Payment < brutto)
```

Status `ZAPLANOWANA` opcjonalny — gdy siostra zaznaczy „przelew zlecony na dzień X" bez wykonania.

### 3. Widoki (App Router pod `app/(app)/finanse/`)

1. **`/finanse`** — dashboard:
   - KPI: zaległe (kwota + liczba), do zapłaty w 7/30 dni, zapłacone w tym miesiącu, suma niezapłaconego
   - Wykres słupkowy: niezapłacone per kontrahent (TOP 10)
   - Wykres liniowy: zapłacone vs nowe faktury per miesiąc (12 mies. wstecz)
   - Sekcja „Wymagają Twojej uwagi" — overdue + do akceptacji (per rola)

2. **`/finanse/do-zatwierdzenia`** — **inbox Bohdana**:
   - Lista faktur w statusie `DO_ZATWIERDZENIA` posortowana po terminie ASC
   - Każda karta: vendor, FV, brutto, termin, „dni do terminu", załączniki (jeśli PDF)
   - Akcje: ✅ Zatwierdź (opcjonalny komentarz) / ❌ Odrzuć (komentarz wymagany)
   - Bulk: zaznacz wiele → „Zatwierdź wszystkie"

3. **`/finanse/kolejka-platnosci`** — siostra robi przelewy:
   - Faktury w statusie `ZATWIERDZONA` z terminem ≤ +7 dni
   - Akcje: „Oznacz jako opłacone" → modal z kwotą (domyślnie brutto, można częściowo), datą, bankiem, tytułem → tworzy `PurchaseInvoicePayment` + ustawia status
   - Eksport CSV (dla łatwego wgrywania do systemu bankowego — przyszłość)

4. **`/finanse/faktury`** — pełna lista:
   - Filtry: vendor (multi-select), status (multi), zakres dat (issue/due/paid), przedział kwot, „tylko overdue", „tylko niezapłacone"
   - Kolumny: vendor, FV, data wyst., termin, brutto, netto, VAT, status (badge z kolorem), zapłacono (data ostatniej płatności / „—")
   - Akcja masowa: zmiana statusu, eksport CSV (do biura księgowego)
   - **Eksport miesięczny dla biura** — przycisk „Eksportuj miesiąc XYZ" → CSV/XLSX z kolumnami które biuro wymaga (do uzgodnienia — zapytać siostrę jaki format chcą)

5. **`/finanse/faktury/[id]`** — szczegóły:
   - Wszystkie pola + historia akceptacji + lista płatności (z saldem)
   - Edycja (zależnie od roli i statusu — np. zatwierdzonej nie można edytować bez resetu)
   - Załączniki (upload PDF)
   - Przycisk „Wyślij do akceptacji" gdy `WPROWADZONA`

6. **`/finanse/nowa`** — formularz nowej faktury:
   - Vendor (combobox z istniejących + opcja „dodaj nowy")
   - FV, daty, kwoty (auto-przelicz brutto/netto/VAT przy podaniu 2 z 3 + stawki)
   - Upload PDF faktury → opcjonalnie

7. **`/finanse/kontrahenci`** — CRUD vendorów:
   - Lista + dodawanie/edycja + dezaktywacja
   - Per vendor: zestawienie roczne (liczba faktur, suma brutto, średni termin, % zapłaconych w terminie)

### 4. Importer xlsx (`/finanse/import`)

Wzorem `lib/units-import.ts` i `lib/przedmiar-konrad-import.ts`:

1. Upload `PŁATNOŚCI 2026.xlsx` (lub wcześniejszy plik dla historii)
2. **Tryb `preview`**: parsuje wszystkie zakładki, normalizuje warianty layoutu, agreguje subwiersze (faktura + płatności), zwraca diff (ile nowych vendorów, ile faktur, ile płatności, konflikty po `(vendor, number)`)
3. **Tryb `commit`**: zapisuje w `prisma.$transaction`

**Pułapki importera** (z analizy pliku):
- Layout A vs layout B (FV w kol A lub B) — autodetekcja po wierszu 2 (header)
- Subwiersze „zapłacono X / pozostało Y" pod fakturą — agregacja przez look-ahead do następnego wiersza z FV
- MURARZ ma dodatkowe kolumny — mapuj do `deposit/buildingCosts/electricity`
- STAFFA/MURARZ mają subkontrahenta w kol A — zapisuj do `subVendor` (string), **nie** twórz osobnego Vendora
- PODATKI ma inny układ — **pomiń w tym MVP** (osobny pod-moduł w Fazie 2)
- Stare wpisy z 2023/2024/2025 (SANTANDER/STAFFA/EFL/BAUTER) — wczytaj wszystkie, oznaczane datą wystawienia
- Kolory wierszy → mapowanie na status:
  - 🟥 + jest `ZAPŁACONO` data → `OPLACONA`
  - 🟥 + brak `ZAPŁACONO` → `ZATWIERDZONA` (Bohdan zaakceptował, czeka na przelew)
  - 🟩 → `ZATWIERDZONA` (przyszły termin, zaakceptowane)
  - brak koloru + jest `ZAPŁACONO` → `OPLACONA` (stare zamknięte)
  - brak koloru + brak `ZAPŁACONO` → `WPROWADZONA` (nieprzepracowane)

### 5. Sidebar i workspace

Dodać do workspace **„Finanse"** (już istnieje przełącznik workspace w Sidebar) link `/finanse` + pod-linki:
- Dashboard
- Do zatwierdzenia (badge z liczbą)
- Kolejka płatności (badge)
- Faktury
- Kontrahenci
- Import

### 6. Kolejność implementacji

1. **Schema Prisma** + `prisma generate` lokalnie + `prisma db push` na Coolify
2. **Seed minimalny** — utworzyć vendorów z zakładek + rolę `KSIEGOWY` i `APPROVER`
3. **Importer xlsx** (CLI najpierw — `scripts/import-finanse.js` żeby załadować dane z pliku w `tmp/`)
4. **`/finanse/faktury` (lista) + `/finanse/faktury/[id]`** — żeby zobaczyć zaimportowane dane
5. **Workflow akceptacji** — endpointy + UI inboxu Bohdana
6. **Kolejka płatności** + dodawanie `PurchaseInvoicePayment`
7. **Dashboard** + wykresy (recharts już używamy w innych modułach)
8. **Eksport CSV** dla biura księgowego (format do uzgodnienia z siostrą/biurem)
9. **Sidebar + workspace** integration
10. **Importer xlsx z UI** (`/finanse/import`) — przeniesienie CLI do endpointa

## Co poza zakresem Fazy 1 (Faza 2+)

- **Integracja Saldeo API** (pull/push faktur) — Faza 2, bloker: dostęp do API od biura
- **Alerty mailem** dla Bohdana / overdue
- **Import wyciągu bankowego** (CSV/MT940) → auto-match płatności
- **OCR faktur** (PDF → wyciągnięcie danych przez AI) — niski priorytet bo Saldeo to robi
- **PODATKI** — osobny pod-moduł (VAT/CIT per miesiąc, dwie firmy)
- **Powiązanie per inwestycja** — `investmentId` w schemie jest, ale UI/raport dopiero w Fazie 2
- **Cashflow forecast** — wykres salda z uwzględnieniem wpływów z modułu Sprzedaż (umowy rezerwacyjne)
- **Multi-currency** — pole `currency` w schemie jest, ale FX dopiero gdy się pojawi

**Wyjęte z roadmapy:** KSeF — robi to Saldeo po stronie biura księgowego.

## Pytania otwarte (do rozstrzygnięcia przed kodowaniem / w trakcie)

1. **Saldeo API** — jaki plan ma biuro księgowe, czy plan zawiera API, czy mogą nam dać klucz? (Bloker dla Fazy 2 — do zapytania biura.)
2. **Jak Marta dziś pracuje z Saldeo** — wpisuje ręcznie, OCR z PDF, czy import z mailbox? To wpływa na kierunek synchronizacji (pull vs push) w Fazie 2.
3. **Częściowe płatności** — czy Bohdan akceptuje całą fakturę raz, czy każdą ratę osobno? (Domyślnie: akceptuje fakturę raz, płatności są tylko bookkeepingiem siostry.)
4. **PDF faktury** — siostra będzie wgrywać każdy PDF do CodeCRM? Czy poleganie na Saldeo jako miejscu „prawdy" dla PDF, a u nas tylko metadane? (Wpływ: storage + UX.)
5. **Lata 2023-2025 z STAFFA/SANTANDER/EFL** — wczytujemy całość czy próg np. „od 2024"? (Do potwierdzenia że nie spowalniają UI listy.)
6. **PODATKI** — czy w MVP pomijamy całą zakładkę PODATKI z importu, czy chcemy mieć choć prosty widok terminów VAT/CIT? (Rekomendacja: pomijamy, osobny pod-moduł w Fazie 2.)

## Powiązania z istniejącymi modułami

- **Sprzedaż** (Contract): w Fazie 2 cashflow forecast łączy wpływy z `Contract.valueGross + reservationFee` z wydatkami z `PurchaseInvoice`
- **Lokale/Inwestycje**: pole `investmentId` w `PurchaseInvoice` (Faza 2) — koszty per inwestycja
- **Settings**: w `/settings` może admin konfiguruje banki (lista nazw do dropdownu w Payment) i format eksportu do biura
