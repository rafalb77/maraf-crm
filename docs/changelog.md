# Changelog — najważniejsze decyzje techniczne

Krótkie wpisy „co i **dlaczego**". Bez listy wszystkich commitów — od tego jest `git log`. Tu tylko **niebanalne** decyzje, które za pół roku ciężko zrozumieć z samego kodu.

---

## 2026-07-10

### Rezerwacje — automatyczne powiadomienia klienta przed wygaśnięciem miękkiej (e-mail/SMS + zadanie „Zadzwoń")
**Powód**: Rafał chciał, żeby na 48 h (konfigurowalne) przed końcem rezerwacji miękkiej klient dostał automatycznie e-mail i SMS, a na pulpicie pojawiło się powiadomienie „zadzwoń do klienta" — w tym samym momencie. Pełny kontekst: `docs/rezerwacje-powiadomienia-decyzje.md`.
**Implementacja**:
- **`lib/reservation-alerts.ts`** (`runReservationAlerts()`): selekcja `getExpiringSoftReservations(X)`, grupowanie per klient (1 wiadomość z listą lokali), szablony z Settings (placeholdery `{imie} {lokal} {data}…`), wysyłka e-mail (`lib/mailer`) + SMS + Task `RES_CALL:<unitId>:<yyyy-mm-dd>`; RES_CALL anuluje otwarte RES_EXPIRE tego samego lokalu/terminu i ma gałąź w `reconcileRuleTasks` (anti-zombie).
- **Idempotencja: nowy model `NotificationLog`** — `dedupeKey @unique` = `RES_ALERT:<unitId>:<kanał>:<expiresAt ISO>`, wpis tylko po UDANEJ wysyłce (błąd → retry następnym przebiegiem; przedłużenie rezerwacji = nowa data = nowy cykl). Skalary bez FK (wzorzec AuditLog).
- **`lib/sms.ts`** — pierwszy moduł SMS w systemie: SMSAPI.pl przez `fetch` (bez SDK), token/nadawca w Settings (`sms.apiToken`/`sms.from`), `normalizePhonePl()` (wolny tekst → E.164, stacjonarne odrzucane), mapa błędów bramki na polskie komunikaty. SMS-y tylko w oknie 8–20 czasu PL (konfigurowalne).
- **Cron**: `POST /api/public/reservations/alerts` (sekret `RESERVATIONS_CRON_SECRET` — reużyty), Coolify Scheduled Task **co 15 min**. Digest dzienny do handlowca (expiring-email) zostaje bez zmian.
- **UI**: `/settings` → sekcja „Powiadomienia o rezerwacjach" (`ReservationAlertsSection`) — próg godzin, przełączniki kanałów, szablony (licznik znaków SMS + ostrzeżenie o ogonkach → UCS-2), konfiguracja SMSAPI, wysyłka testowa (`POST /api/settings/reservation-alerts-test`).
- **Ślad**: Activity na karcie klienta (EMAIL / NOTATKA „SMS: …" — celowo bez nowego typu aktywności) + audit `NOTIFY_EMAIL`/`NOTIFY_SMS`.
- **WYMAGA na produkcji**: `prisma db push` (tabela `NotificationLog`) + nowy scheduled task w Coolify (`*/15 * * * *`). SMS czeka na konto SMSAPI + rejestrację nadawcy „MARAF" (1-3 dni) — kanał domyślnie OFF, e-mail i zadania ON.

## 2026-07-07

### Globalna wyszukiwarka ⌘K / Ctrl+K w topbarze
**Powód**: Rafał chciał szybki globalny skok do dowolnego rekordu (klient, lokal, oferta, umowa, sprawa, faktura) bez klikania po modułach — wzorzec „command palette" (Spotlight/⌘K).
**Implementacja**:
- **Endpoint `/api/search?q=`** (`app/api/search/route.ts`): równoległe zapytania (`Promise.all`) po encjach, każda `take: 6`, min. 2 znaki. **Respektuje permissions** — helper `can(perm) = isAdmin || permissions.includes(perm)`, przeszukuje TYLKO dozwolone moduły (ten sam model co middleware/Sidebar). Zwraca płaską listę `{group, groupLabel, title, subtitle, badge, url}`.
- **Zakres**: Klienci (imię/nazwisko/email/telefon), Lokale (numer/budynek/opis), Oferty (numer/tytuł), Sprzedaż=Contract (numer/inwestycja), Serwis (tytuł/opis), Sprawy (sygnatura/tytuł/counterparty), Finanse — faktury kosztowe (numer/opis + nazwa vendora) i przychodowe (numer/odbiorca). Badge = etykieta statusu z `lib/types.ts` (fallback = surowa wartość, np. seedowy status „KLIENT" spoza enuma).
- **Pułapka szyfrowania**: pola szyfrowane at-rest (pesel/nip/idNumber/adres — `lib/crypto.ts`) **nie są przeszukiwane** — `contains` po ciphertext nic nie znajdzie. Szukamy tylko po polach jawnych.
- **Komponent `components/layout/CommandPalette.tsx`** (client, samodzielny): trigger w topbarze + modal. Globalny skrót ⌘K/Ctrl+K (toggle), debounce 180ms + `AbortController` (anti-race), nawigacja ↑/↓/Enter/Esc z podświetleniem aktywnego wiersza i scroll-into-view, stany „min. 2 znaki"/loading/empty, grupowanie z zachowaniem kolejności z API. Detekcja Mac→⌘ / reszta→Ctrl. Motyw przez zmienne CSS (`--surface`/`--border`/`--accent-soft` itd.).
- **TopBar**: `justify-end` → `justify-between`, `<CommandPalette />` po lewej, kontrolki (ThemeToggle+avatar) opakowane po prawej.
- **Bez zmian schematu/env** — czysto odczytowe, działa od razu po deployu.
- **Poprawka (ten sam dzień)**: modal **renderowany przez `createPortal` do `document.body`**. Powód: `<header>` topbara ma `backdrop-filter: blur()`, co tworzy *containing block* dla `position: fixed` — przez to `fixed inset-0 z-50` był uwięziony w kontekście `z-20` topbara i sticky nagłówek modułu Finanse (`z-20`) przykrywał pole wyszukiwania. Portal wychodzi poza ten kontekst; z-index podniesiony do `z-[100]`.
- **Poprawka (ten sam dzień)**: wyszukiwanie kontrahentów. Dodano grupę **Kontrahenci** (Vendor po `name`/`shortCode`/`nip`, link do `/finanse/faktury?vendor=<id>`) **oraz** dopasowanie faktur kosztowych po **nazwie/skrócie vendora** (nested relation filter). Wcześniej szukanie po nazwie kontrahenta nie pokazywało jego faktur (m.in. ściągniętych z KSeF), bo `PurchaseInvoice` matchował tylko `number`/`description`.

## 2026-06-16

### KSeF — szczegóły faktury (dane podmiotów + pozycje), status płatności z FA, status faktur z KSeF
**Powód**: Po pobraniu z KSeF szczegóły faktury pokazywały tylko nagłówek + sumy + NIP/nazwę — brakowało pełnych danych nabywcy/sprzedawcy i **pozycji** faktury. Dodatkowo faktury opłacone w KSeF (np. Orlen) widniały jako „Zapłacono 0,00" ze statusem ZATWIERDZONA, bo sync **nie czytał** bloku `Płatność` z FA. Pełny kontekst: `docs/finanse-decyzje.md`.
**Implementacja**:
- **Parser FA(3) rozszerzony** (`lib/ksef-client.ts`): adres + kontakt obu podmiotów (`Adres` AdresL1/AdresL2 lub pola strukturalne, `DaneKontaktowe`), **pozycje** `FaWiersz` (P_7/P_8A/P_8B/P_9A/P_11/P_11A/P_12) i **blok `Płatność`** (`Zapłacono`, `DataZapłaty`, `TerminPłatności`, `FormaPłatności`, `ZapłataCzęściowa`). Snapshot → nowe pole `ksefData` (Json) na `PurchaseInvoice`/`SalesInvoice`. Kształt: `lib/types.ts → KsefInvoiceData`.
- **Status płatności z KSeF** (`ksefPaymentOutcome`): `Zapłacono=1` → `OPLACONA` + auto-utworzenie płatności na brutto (data = `DataZapłaty`); częściowe → `CZESCIOWO_OPLACONA`; brak znacznika → status bazowy. To naprawia „opłacone 0,00". **Uwaga**: KSeF zna „opłacona" tylko gdy sprzedawca tak oznaczył fakturę — dla odroczonych przelewów płatność rejestruje się ręcznie (lub z wyciągu — przyszłość).
- **Status faktur z KSeF**: zakupowe `ZATWIERDZONA` → **`WPROWADZONA`** (decyzja: nie wprowadzano nowego statusu „POBRANA" — WPROWADZONA jest w uproszczonym workflow nieużywany dla nowych faktur, więc staje się „skrzynką KSeF do przejrzenia"; zero zmian w filtrach/kolejce/kolorach). Pochodzenie z KSeF widoczne jako **plakietka „KSeF"** (lista + szczegóły). Opłacone wg FA → od razu `OPLACONA`.
- **UI**: `components/finanse/KsefInvoiceDetails.tsx` (server) — karty sprzedawca/nabywca + sekcja płatności wg KSeF + tabela pozycji; wpięte w `/finanse/faktury/[id]` i `/finanse/przychody/[id]`. Plakietka „KSeF" w `FakturyTable`.
- **Pełna synchronizacja** (`?full=1`, drugi przycisk w `/finanse/ksef`): re-skan od daty startu (ignoruje `lastSyncAt`) — backfill `ksefData` + statusu opłacenia dla **już pobranych** faktur (zwykły sync bierze tylko nowe). `fromDate` default = `KSEF_DEFAULTS[company].syncFromDate`; `toIso` = dziś+1 (bufor stref, dedup po `ksefNumber`).
- **Idempotentne uzgadnianie** (`reconcileExistingFromKsef`): dotwarza WYŁĄCZNIE brakującą deltę (`min(zapłacone wg KSeF, należna) − już zapłacone z KSeF`, tytuł `KSEF_PAYMENT_REF`), nigdy nie dubluje płatności przy powtórnym re-syncu; atomowo (`$transaction`). Auto-rozliczane są **tylko faktury z KSeF** (`createdById/importSheet/sourceSalesInvoiceId` puste + opis „Z KSeF") i bez płatności ręcznych — ręczne/importowane/zlinkowane przez dup oraz płatności Marty nietykane. Kwota ograniczona do **należnej** (brutto − kaucja/KB/prąd), nie brutto.
- **Hardening** (review wieloagentowy 2026-06-16): brutto = `P_15` lub `netto+VAT` gdy `P_15` brak (nie zostawia brutto<netto); data płatności częściowej z `ZapłataCzęściowa` (nie data wystawienia); `brutto<=0` → brak auto-płatności; status terminalny (OPLACONA/ANULOWANA) pomijany przy re-syncu.
- **Rate limit KSeF (16/min) + sync wznawialny** (2026-06-16): KSeF zwraca 429 „limit 16 żądań/min". Dodano throttling przesuwnym oknem **15/min per NIP** (`rateLimit`) + retry na 429 z backoffem wg `Retry-After`/komunikatu (`ksefFetch`). Sync ma **limit 40 pobrań XML na uruchomienie** (`MAX_XML_PER_RUN`) i jest **wznawialny**: `lastSyncAt` przesuwane tylko po pełnym ukończeniu (`completed`), inaczej `lastSyncStatus=PARTIAL` i kolejne uruchomienie kontynuuje (dedup po `ksefNumber`). **Wcześniejszy bug**: błąd/429 i tak ustawiał `lastSyncAt`, przez co nieprzetworzone faktury były pomijane przez sync inkrementalny — naprawione (status/błąd nie przesuwa `lastSyncAt`). `maxDuration=300` na route'ach.
- **WYMAGA na produkcji**: `prisma db push` (2 kolumny `ksefData` Json na PurchaseInvoice + SalesInvoice). Backfill danych dla już pobranych faktur → przycisk „Pełna synchronizacja" w `/finanse/ksef` (przy większej liczbie faktur klikaj aż status = OK, nie PARTIAL).

## 2026-06-09

### Moduł Sprawy — repozytorium spraw + korespondencja (reklamacje, sprawy urzędowe)
**Powód**: Rafał chciał repozytorium do prowadzenia historii spraw (reklamacje z tytułu rękojmi, sprawy urzędowe) z widoczną osią korespondencji (pisma wysłane/odebrane jako skany), pilnowaniem terminów ustawowych i **przeszukiwalnym** archiwum skanów. Pełny kontekst: `docs/sprawy-decyzje.md`.
**Implementacja** (3 fazy, jeden zrzut):
- **3 modele**: `Case` (sygnatura `REK/2026/0042`, type REKLAMACJA|URZEDOWA|INNE, status NOWA→W_TOKU→OCZEKUJE→ROZSTRZYGNIETA→ZAMKNIETA, receivedAt/deadline/reminderSentAt/closedAt, klient LUB `counterparty` dla strony zewn., `owner` = prowadzący) + `CaseEntry` (oś korespondencji: direction PRZYCHODZACA|WYCHODZACA|WEWNETRZNA, channel LIST|EMAIL|TELEFON|OSOBISCIE|EPUAP|INNE) + `CaseDocument` (skany, `ocrText`/`ocrStatus`). `createdById`/`uploadedById` jako skalary bez FK (wzorzec `AuditLog`).
- **Osobny moduł obok Serwisu** (decyzja Rafała) — `ServiceRequest`/usterki bez zmian, brak migracji. Wchłonięcie usterek możliwe później.
- **Sygnatura** liczona z najwyższego istniejącego numeru per (prefiks, rok) — odporna na usuwanie; `number @unique` + retry P2002 w POST.
- **Terminy rękojmi** — reklamacja z datą wpływu auto-ustawia `deadline = receivedAt + 14 dni` (brak odpowiedzi = domniemanie uznania; KC). `lib/case-deadlines.ts` koloruje OK/SOON/TODAY/OVERDUE. Sprawy urzędowe — termin ręczny.
- **Przypomnienia** — `/api/public/cases/reminders` (wzorzec dane-gov, sekret `CASES_CRON_SECRET`, Coolify scheduled task ~08:00). Grupuje per prowadzący (`owner.email`, fallback `CASES_REMINDER_TO`→`ADMIN_EMAIL`), zbiorczy mail przez `sendEmail()`, idempotencja dzienna przez `reminderSentAt`. **Kalendarz pominięty** (uniknięcie duplikatów eventów) — kierunek na później.
- **OCR natywny Tesseract** (decyzja Rafała) — Dockerfile runner: `tesseract-ocr tesseract-ocr-pol poppler-utils`. `lib/ocr.ts`: obraz→`tesseract -l pol`, PDF→`pdf-parse` (warstwa tekstu) z fallbackiem `pdftoppm`→OCR per strona (skany). Trigger fire-and-forget przy uploadzie + `/api/public/cases/ocr-sweep` (retry zaległych) + ręczny re-OCR dla FAILED. **Działa tylko na produkcji** (binaria w obrazie; lokalnie Windows → FAILED).
- **Wyszukiwanie** — `/api/cases?q=` ILIKE po sygnaturze/tytule/opisie/stronie + treści wpisów + `ocrText` skanów (Postgres `contains` insensitive). Upgrade do `tsvector` PL — poza MVP.
- **Poza MVP**: generowanie pism z szablonów, eksport „teczki" PDF, AI-streszczenia, inbox z maila, e-Doręczenia, dashboard SLA, usterka→podwykonawca→kaucja.
- **WYMAGA na produkcji**: `prisma db push` (3 tabele Case/CaseEntry/CaseDocument), **rebuild** obrazu (Dockerfile — tesseract), env `CASES_CRON_SECRET` (+ opcjonalnie `CASES_REMINDER_TO`), Coolify scheduled tasks na reminders i ocr-sweep, nadanie permission `cases` userom.

### Tworzenie rezerwacji miękkiej z 3 miejsc (lokal, oferta, klient)
**Powód**: rezerwację miękką można było utworzyć tylko z karty klienta (`AssignUnitModal` → `POST /api/clients/[id]/units`). User chciał też z poziomu lokalu i oferty (różne punkty wejścia w workflow sprzedażowym).
**Implementacja**:
- **Z lokalu** (`/units/[id]`): przycisk „Zarezerwuj dla klienta" gdy lokal WOLNY → modal `ReserveForClientModal` z wyszukiwarką klientów (po nazwisku/telefonie) → reuse `POST /api/clients/[clientId]/units {unitId}` (istniejący endpoint, MIEKKA +7 dni). Strona dociąga listę klientów tylko gdy status WOLNY.
- **Z oferty** (`/oferty/[id]`): przycisk „⏱ Zarezerwuj lokale (7 dni)" w `OfferActions` gdy oferta ma klienta + lokale i nie jest ANULOWANA. Nowy endpoint `POST /api/oferty/[id]/reserve` — rezerwuje WSZYSTKIE lokale oferty dla jej klienta w transakcji (MIEKKA +7), pomija sprzedane/twardo-zarezerwowane, ustawia klienta na status REZERWACJA, loguje aktywność. Zwraca `reservedCount` + `skipped[]`. To **wcześniejszy etap** niż „→ Umowa rezerwacyjna" (konwersja na twardą rezerwację) — oba przyciski współistnieją.
- **Z klienta**: bez zmian — już działało.
Wszystkie 3 ścieżki tworzą ten sam typ rekordu (MIEKKA, `ClientUnit` + flagi `Unit`), więc lokal od razu pojawia się w module `/rezerwacje` i podlega auto-expire / przedłużaniu / zamianie.

### Zamiana składnika rezerwacji miękkiej (parking↔garaż itd.)
**Powód**: klient zarezerwował mieszkanie + parking, ale chce zamienić parking na inny lub na garaż — przed podpisaniem umowy. Wcześniej trzeba było ręcznie odpiąć stary lokal i przypiąć nowy (2 kroki, ryzyko utraty daty wygaśnięcia/klienta).
**Model**: rezerwacja nie jest osobną encją — to zbiór lokali z tym samym `reservedById` (miękka, przez `ClientUnit`) lub w `ContractUnit` (twarda). Zamiana miękkiej = atomowa transakcja: stary lokal → WOLNY (+ usuń ClientUnit), nowy → ZAREZERWOWANY/MIEKKA z **zachowaniem klienta i daty wygaśnięcia**. Cross-type dozwolony (parking→garaż).
**Implementacja**: `lib/reservations.ts → swapSoftReservation(oldUnitId, newUnitId)` (walidacje: stary MIEKKA, nowy WOLNY, różne). Endpoint `POST /api/reservations/[unitId]/swap` body `{newUnitId}` (gate 'sales'). Komponent `SwapButton` (w `ReservationActions.tsx`) — dialog z listą wolnych lokali, domyślnie filtrowaną do tego samego typu + checkbox „pokaż inne typy" (dla parking→garaż), radio-wybór, potwierdzenie. Przycisk w **2 miejscach**: sekcja „Miękkie" na `/rezerwacje` (obok Przedłuż/Zwolnij) oraz na karcie klienta `/clients/[id]` przy lokalach z rezerwacją MIEKKA. **Zakres MVP: tylko miękkie** — twarde (w umowie) wymagałyby aneksu (walidacja limitów + przeliczenie wartości + regeneracja DOCX) → osobny temat.

### Moduł Rezerwacje (`/rezerwacje`) — 3 sekcje + email-alerty cron
**Powód**: brak skonsolidowanego widoku stanu rezerwacyjnego — handlowiec musiał ręcznie chodzić po lokalach żeby zobaczyć co kończy się i kiedy. Plus realne ryzyko, że rezerwacja miękka (auto-expire 7 dni) cicho wygasa, bo nikt nie zauważył.
**Implementacja**: nowa strona `/rezerwacje` (server component) z 3 sekcjami:
- **Miękkie (MIEKKA)** — tabela z kolorystyką kończącego się czasu (czerwone <24h, żółte <72h, niebieskie >72h). Banner u góry gdy `criticalCount > 0`. Akcje per wiersz: **Przedłuż** (dialog z polem „liczba dni" 1-90, default 7; nowa data liczona od TERAZ) + **Zwolnij** (z potwierdzeniem; → WOLNY + usuwa ClientUnit).
- **Twarde (REZERWACJA)** — lokale podpięte do umów ze statusem PODPISANA. Link do umowy. Zwalnianie tylko przez zmianę statusu umowy.
- **Wyłączone ze sprzedaży (NIEDOSTEPNY)** — akcja „Przywróć do sprzedaży" (PUT /api/units/[id] z status=WOLNY).

`lib/reservations.ts` rozbudowany: `extendSoftReservation`, `releaseSoftReservation`, `getExpiringSoftReservations`, helper `attachReservedByClient` (Unit nie ma Prisma-relacji na `reservedById` — osobne query zamiast modyfikacji schema). Auto-expire wywołany przy każdym wejściu na stronę.

**Endpointy**: `POST /api/reservations/[unitId]/extend` (body `{days}`), `DELETE /api/reservations/[unitId]/release`. Permission `sales` (rezerwacje to workflow sprzedażowy — handlowcy mają sales, podwykonawcy nie).

**Email-cron**: `POST /api/public/reservations/expiring-email` chroniony `RESERVATIONS_CRON_SECRET` (analogicznie do dane-gov snapshot). Pobiera rezerwacje wygasające w 48h, wysyła HTML mail z tabelą. Odbiorca: `Settings.reservationsAlertEmail` (nowe pole w `/settings` przy stopce mailowej), fallback `NEXT_PUBLIC_ADMIN_EMAIL`. Subject: `[CRM] N rezerwacji wygasa w ciągu 48h (M krytycznych)`. Idempotentny.

**Sidebar**: link „Rezerwacje" między Lokale i Oferty, ikona zegara.

**Co po deployu**: (1) `RESERVATIONS_CRON_SECRET` w Coolify env. (2) Admin wpisuje adres odbiorcy w `/settings`. (3) Coolify scheduled task: codzienne `curl -X POST "https://crm.maraf.pl/api/public/reservations/expiring-email?secret=$RESERVATIONS_CRON_SECRET"` (np. `0 8 * * *`).

---

## 2026-06-05

### Finansowanie etap 2 — harmonogram wpłat nabywcy + auto-EscrowDeposit
**Powód**: domknięcie pętli z etapu 1 — żeby wpłaty nabywców lokali (Maraf Development) nie były wpisywane dwa razy (raz w Sprzedaży, raz ręcznie na rachunku powierniczym). Pełny kontekst: `docs/finanse-decyzje.md` sekcja „ETAP 2".
**Implementacja**:
- **`ContractPayment`** — harmonogram wpłat na umowie (`Contract.payments`). Rata ma status `PLANOWANA`→`OPLACONA`, plannedDate/plannedAmount vs paidDate/paidAmount. Panel „Harmonogram wpłat" na `/sales/[id]` z podsumowaniem (planowane/zapłacone/pozostało/**zaległe** = planowane po terminie).
- **Auto-EscrowDeposit przy odhaczeniu** — przy oznaczeniu raty jako opłaconej (z `toEscrow=true`) tworzy się `EscrowDeposit` na rachunku powierniczym MD (`source=SALES`, link `contractPaymentId @unique` z onDelete Cascade). Cofnięcie odhaczenia / usunięcie raty → deposit kasowany.
- **Decyzje** (z Rafałem): escrow **tylko z umowy deweloperskiej** (`toEscrow` default true dla DEWELOPERSKA, false dla reszty — w OMRP rezerwacyjna idzie na zwykłe konto). Wybór rachunku: **auto gdy 1 aktywne konto MD, dropdown gdy >1** (`resolveEscrowAccount`). Gdy 0 kont → wpłata odhaczona, deposit pominięty z ostrzeżeniem. `Contract` nie ma pola company — sprzedaż lokali to z natury MD.
- **WYMAGA `prisma db push`** (tabela `ContractPayment` + kolumny `contractPaymentId`/`source` na `EscrowDeposit`).

---

## 2026-06-03

### Finanse — statystyki + moduł Finansowanie inwestycji (kredyty/escrow/VAT)
**Powód**: Marta zapytała jak kredyt pod inwestycję ma się do cashflow. Odkryliśmy że wykres cashflow pokazywał tylko **wynik operacyjny** (faktury vs faktury = P&L), a nie **rzeczywisty przepływ gotówki**. Dla dewelopera (Maraf Development) z kredytem, rachunkiem powierniczym i zwrotami VAT to 4 strumienie gotówki, nie 2. Pełny kontekst: `docs/finanse-decyzje.md` sekcja „Moduł Finansowanie inwestycji".
**Implementacja**:
- **Statystyki** (commit `0645fd5`) — `/finanse/statystyki`, 6 widgetów recharts (pulse KPI z sparkline, cashflow 12mc, aging buckets należności/zobowiązania, TOP10 kontrahentów, koncentracja ryzyka TOP3 donut, heatmapa 90dni GitHub-style). `lib/finanse-stats.ts` agreguje wszystko per active company.
- **Moduł Finansowanie** (commit `334a0f6`) — **tylko MD** (Maraf = generalny wykonawca widzi placeholder). 6 nowych modeli: `Loan` (type INWESTYCYJNY|VAT|OBROTOWY|INNE) + `LoanTranche` + `LoanRepayment`, `VatRefund`, `EscrowAccount` (OMRP|ZMRP) + `EscrowDeposit` + `EscrowRelease`. Strona `/finanse/finansowanie` z 3 zakładkami.
- **Decyzje** (z Rafałem 2026-06-02/03): kredyt inwest. i VAT to **dwie osobne umowy** (nie sublimity). Odsetki = **część raty bez FV** (`LoanRepayment.interest`, NIE wpisywane jako faktura kosztowa → cashflow operacyjny ich nie ma, gotówkowy dolicza bez podwajania). Rachunek **OMRP** (uwolnienia etapowe). Wpłaty na escrow: **etap 1 ręcznie**, etap 2 = auto z modułu Sprzedaż (bloker: `Contract` nie ma modelu wpłat — patrz `docs/finanse-finansowanie-etap2-rozpoczecie.md`).
- **Cashflow gotówkowy** — przełącznik Operacyjny/Gotówkowy na wykresie. Gotówkowy = (FV sprzedaży + uwolnienia escrow + zwroty VAT) − (FV kosztowe + raty K+O+P); transze kredytu jako osobna info-linia (zobowiązanie, nie zysk).
- **DSCR** (Debt Service Coverage Ratio) = (zysk operacyjny + escrow + VAT) / raty K+O+P za 12mc. Progi ≥1.25 safe / 1.0-1.25 warn / <1.0 risk.
- **WYMAGA `prisma db push`** na produkcji (6 nowych tabel).

---

## 2026-05-31

### Moduł Finanse — wdrożony (zastępuje `PŁATNOŚCI 2026.xlsx`)
**Powód**: Marta wpisywała faktury w Excelu, Bohdan akceptował kolorem wiersza. Brak audit trail, brak alertów, brak widoku per firma, ręczne dublowanie wpisów do Saldeo (KSeF). Pełen kontekst i historia decyzji w `docs/finanse-rozpoczecie.md`.
**Implementacja** (commity `4cdbaf5` → `b4ad516`, 2026-05-21 do 2026-05-31): patrz `docs/finanse-decyzje.md`. Kluczowe decyzje:
- **Multi-firma jako pełna separacja** — Maraf i Maraf Development jako osobne podmioty, globalny przełącznik w pasku layoutu (`/finanse/layout.tsx`), wszystkie widoki filtrowane po aktywnej firmie z cookie `finanse_company`. Cross-company `recipientCompany` na fakturach przychodowych + ręczny przycisk „Utwórz koszt u odbiorcy" + auto-rozpoznanie z KSeF.
- **Workflow uproszczony** — Marta sama zatwierdza, faktury wpadają od razu jako `ZATWIERDZONA`. Strona „Do zatwierdzenia" usunięta, sub-permission `finanse.approve` zostawiona ale nie wymagana w endpointach (na wypadek powrotu do workflow wielopoziomowego).
- **Importer xlsx** — 5 zakładek (PROMATBUD, BAUTER, STAFFA, STAŁE, INNE). USUNIĘTE: MURARZ (dublował STAFFA), SANTANDER, EFL (stare leasingi). STAŁE w trybie `sectionMode` (nagłówek sekcji = osobny vendor, np. EURON/PLAY/Develogic). **Bug fix**: importer NIE czyta kolumn N/P/Q jako kaucji (były tylko w MURARZ; w STAFFA to śmieci dające absurdalne kwoty rzędu 2.9e25 zł — fix `scripts/fix-finanse-deposits.js`). Pierwszy import: 205 faktur, 13 vendorów.
- **Klient KSeF API 2.0 (read-only)** — własna implementacja w `lib/ksef-client.ts` (auth flow z RSA-OAEP-SHA256 encrypt tokenu + KSeF public key z `/api/v2/security/public-key-certificates`, `query/metadata` z Subject1/Subject2 + dateRange, `getInvoiceXml` plain, parser FA(3) przez `fast-xml-parser`). NIE używamy `@ksef/client` (skupia się na wysyłaniu, plus brak `dist/` po install z GitHub). Sync per firma upsertuje SalesInvoice/PurchaseInvoice po `ksefNumber` (unique), vendor matching po NIP. **Status implementacji "best effort"** — pierwsze realne syncy mogą wymagać 2-5 iteracji (różnice body/response względem dokumentacji MF). Auto-sync `AutoSyncOnMount` w layoucie z throttle 1h i cichym failem.
- **Sortowanie listy faktur** — 9 klikalnych nagłówków kolumn (vendor/number/issueDate/dueDate/amountNet/vatRate/amountVat/amountGross/status), klik raz = wstępny kierunek (asc dla tekstów, desc dla liczb/dat), drugi klik = toggle. Strzałka ↕ szara/↑↓ niebieska. Alternatywnie dropdown z 18 opcjami w filtrach.
- **Foldery główne** (Staffa/Promatbud/Bauter/Stałe/Inne/Pozostali) jako taby u góry listy — hardcoded mapping nazwy vendora → folder w `lib/finanse-folders.ts` (bez schema change). „Pozostali" = vendory nieprzypisani (np. auto-utworzeni z KSeF).
- **Kaucje gwarancyjne** — kaucja jako % LUB kwota, KB, prąd jako potrącenia. Płatności liczone wg `payableAmount = brutto − kaucja − KB − prąd`, status OPLACONA gdy `sumPaid >= payable`. Widok `/finanse/kaucje` + kafelek dashboard. Mail przypominający → cron, niewdrożony.
- **Faktury przychodowe + CIT/VAT** — osobny rejestr `SalesInvoice` z `isAdvance` (wykluczone z CIT/VAT do konwersji). `/finanse/podatki` per firma/rok z adnotacją „orientacyjne, oficjalne robi biuro/Saldeo".
- **Saldeo zostaje dla księgowości** — CRM tylko READ z KSeF, nie wystawia faktur. KSeF nie jest naszą domeną fakturowania, jest źródłem wglądu dla cashflow.

**Saldeo integracja API** — Faza 2 (bloker: klucz API od biura księgowego). **Pełna dokumentacja stanu modułu**: `docs/finanse-decyzje.md`.

---

## 2026-05-21

### Zamiana składnika rezerwacji miękkiej (parking↔garaż itd.)
**Powód**: klient zarezerwował mieszkanie + parking, ale chce zamienić parking na inny lub na garaż — przed podpisaniem umowy. Wcześniej trzeba było ręcznie odpiąć stary lokal i przypiąć nowy (2 kroki, ryzyko utraty daty wygaśnięcia/klienta).
**Model**: rezerwacja nie jest osobną encją — to zbiór lokali z tym samym `reservedById` (miękka, przez `ClientUnit`) lub w `ContractUnit` (twarda). Zamiana miękkiej = atomowa transakcja: stary lokal → WOLNY (+ usuń ClientUnit), nowy → ZAREZERWOWANY/MIEKKA z **zachowaniem klienta i daty wygaśnięcia**. Cross-type dozwolony (parking→garaż).
**Implementacja**: `lib/reservations.ts → swapSoftReservation(oldUnitId, newUnitId)` (walidacje: stary MIEKKA, nowy WOLNY, różne). Endpoint `POST /api/reservations/[unitId]/swap` body `{newUnitId}` (gate 'sales'). Komponent `SwapButton` (w `ReservationActions.tsx`) — dialog z listą wolnych lokali, domyślnie filtrowaną do tego samego typu + checkbox „pokaż inne typy" (dla parking→garaż), radio-wybór, potwierdzenie. Przycisk w **2 miejscach**: sekcja „Miękkie" na `/rezerwacje` (obok Przedłuż/Zwolnij) oraz na karcie klienta `/clients/[id]` przy lokalach z rezerwacją MIEKKA. **Zakres MVP: tylko miękkie** — twarde (w umowie) wymagałyby aneksu (walidacja limitów + przeliczenie wartości + regeneracja DOCX) → osobny temat.

### Moduł Rezerwacje (`/rezerwacje`) — 3 sekcje + email-alerty cron
**Powód**: brak skonsolidowanego widoku stanu rezerwacyjnego — handlowiec musiał ręcznie chodzić po lokalach żeby zobaczyć co kończy się i kiedy. Plus realne ryzyko, że rezerwacja miękka (auto-expire 7 dni) cicho wygasa, bo nikt nie zauważył.
**Implementacja**: nowa strona `/rezerwacje` (server component) z 3 sekcjami:
- **Miękkie (MIEKKA)** — tabela z kolorystyką kończącego się czasu (czerwone <24h, żółte <72h, niebieskie >72h). Banner u góry gdy `criticalCount > 0`. Akcje per wiersz: **Przedłuż** (dialog z polem „liczba dni" 1-90, default 7; nowa data liczona od TERAZ) + **Zwolnij** (z potwierdzeniem; → WOLNY + usuwa ClientUnit).
- **Twarde (REZERWACJA)** — lokale podpięte do umów ze statusem PODPISANA. Link do umowy. Zwalnianie tylko przez zmianę statusu umowy.
- **Wyłączone ze sprzedaży (NIEDOSTEPNY)** — akcja „Przywróć do sprzedaży" (PUT /api/units/[id] z status=WOLNY).

`lib/reservations.ts` rozbudowany: `extendSoftReservation`, `releaseSoftReservation`, `getExpiringSoftReservations`, helper `attachReservedByClient` (Unit nie ma Prisma-relacji na `reservedById` — osobne query zamiast modyfikacji schema). Auto-expire wywołany przy każdym wejściu na stronę.

**Endpointy**: `POST /api/reservations/[unitId]/extend` (body `{days}`), `DELETE /api/reservations/[unitId]/release`. Permission `sales` (rezerwacje to workflow sprzedażowy — handlowcy mają sales, podwykonawcy nie).

**Email-cron**: `POST /api/public/reservations/expiring-email` chroniony `RESERVATIONS_CRON_SECRET` (analogicznie do dane-gov snapshot). Pobiera rezerwacje wygasające w 48h, wysyła HTML mail z tabelą. Odbiorca: `Settings.reservationsAlertEmail` (nowe pole w `/settings` przy stopce mailowej), fallback `NEXT_PUBLIC_ADMIN_EMAIL`. Subject: `[CRM] N rezerwacji wygasa w ciągu 48h (M krytycznych)`. Idempotentny.

**Sidebar**: link „Rezerwacje" między Lokale i Oferty, ikona zegara.

**Co po deployu**: (1) `RESERVATIONS_CRON_SECRET` w Coolify env. (2) Admin wpisuje adres odbiorcy w `/settings`. (3) Coolify scheduled task: codzienne `curl -X POST "https://crm.maraf.pl/api/public/reservations/expiring-email?secret=$RESERVATIONS_CRON_SECRET"` (np. `0 8 * * *`).

### Raportowanie cen na dane.gov.pl — dokończenie wdrożenia
**Powód**: funkcja była zaczęta jako WIP (panel admina, generator CSV, endpointy harvester, hook price-history) ale **nie była zacommitowana** — pliki istniały tylko w roboczym katalogu głównym, a brakujące w schemacie modele `PriceHistory` + `DaneGovSnapshot` blokowały lokalny `npm run build` (TS2339). Wykryte przy testowym buildzie podczas pracy nad podglądem umów. Obowiązek ustawowy (Dz.U.2025.758, kara do 10% obrotu) → priorytet przed startem systemu.
**Implementacja**: dodane modele Prisma w `schema.prisma` — `PriceHistory` (unitId, ceny, status, changedAt @default(now), index na [unitId, changedAt]) + back-relation `Unit.priceHistory` + `DaneGovSnapshot` (date @unique, csv, md5, rowCount). Wciągnięte do worktree pliki WIP: `lib/dane-gov-export.ts` (generator CSV 55 kolumn + katalog XML), `lib/dane-gov-fields.ts` (~35 pól Settings dewelopera/biura/inwestycji), `lib/price-history.ts`, `components/settings/DaneGovPanel.tsx`, strona `/settings/dane-gov`, endpointy `/api/settings/dane-gov` (panel) + `/api/public/dane-gov/{catalog,file/[name],snapshot}` (harvester). **Hook wired** w `app/api/units/route.ts` (POST → `recordPriceHistory` przy create) i `[id]/route.ts` (PUT → `recordPriceHistoryIfChanged` z odczytem `before` przed update'em) — doc twierdził że są, w rzeczywistości brakowało. Link do `/settings/dane-gov` dodany w nagłówku `/settings`. ENV `DANEGOV_CRON_SECRET` udokumentowany w CLAUDE.md.
**Po deployu**: (1) `prisma db push --skip-generate` w Coolify Terminal (utworzy tabele `PriceHistory` + `DaneGovSnapshot`). (2) `ENCRYPTION_KEY` już ustawiony, dodatkowo `DANEGOV_CRON_SECRET` w env Coolify. (3) Admin wchodzi w `/settings/dane-gov`, wypełnia ~35 pól dewelopera (KRS, REGON, adresy itd.). (4) Klika „Generuj snapshot" raz, weryfikuje CSV. (5) Coolify scheduled task: codzienne `POST /api/public/dane-gov/snapshot?secret=$DANEGOV_CRON_SECRET`. (6) Rejestracja u ministerstwa: mail na `kontakt@dane.gov.pl` z URL-em `https://crm.maraf.pl/api/public/dane-gov/catalog` (XML katalog). **Otwarte z doc-a**: logowanie cen w `lib/units-import.ts` (xlsx reimport) — nadal nie pisze do PriceHistory (przy reimporcie „Data od" spadnie do `Unit.updatedAt`); weryfikacja nagłówków po pierwszym harveście; tryb rejestracji.

### Podgląd umowy w UI (`/sales/[id]/preview`)
**Powód**: handlowiec chce zobaczyć treść wygenerowanej umowy przed pobraniem .docx (z sprzedaz-decyzje.md pkt „Preview w UI"). Wcześniej endpoint zwracał plik bezpośrednio.
**Implementacja**: dodano dep **`mammoth`** (docx→html). `lib/contract-generator.ts` → `generateContractHtml(contract)`: generuje DOCX z szablonu (jedno źródło prawdy) i konwertuje przez mammoth na HTML → wierne odwzorowanie treści (akapity, tabele, pogrubienia). Strona `/sales/[id]/preview` (server component, force-dynamic dziedziczone z `(app)`) renderuje HTML w stylizowanym kontenerze + przycisk „Pobierz .docx". Tylko dla REZERWACYJNEJ (jedyny szablon) — inne typy pokazują komunikat. Przycisk „Podgląd" na `/sales/[id]` obok „Generuj .docx". Pola bez danych pokazują się jako „…" (jak w DOCX). **Uwaga build**: `npm install mammoth --package-lock-only` w worktree (node_modules współdzielone z głównym repo przez junction) — package.json + lock spójne, Docker `npm ci` podchwyci.

### Wysyłka umowy mailem (`POST /api/contracts/[id]/email`)
**Powód**: analogicznie do ofert — handlowiec chce wysłać umowę do klienta z aplikacji, bez ręcznego pobierania i załączania. Z generatora umów (sprzedaz-decyzje.md, pkt „Wysyłka mailem").
**Implementacja**: endpoint reuse `lib/mailer.ts` (`sendEmail` + `toFriendlyMailError`) i `generateContractDocx`. DOCX dołączany **tylko dla REZERWACYJNEJ** (jedyny szablon) — dla DEWELOPERSKIEJ/PRZENIESIENIA mail leci bez załącznika (non-blocking, dialog informuje). Body minimalne + opcjonalna stopka z `Settings.emailSignature` (jak oferty). Obsługa błędów SMTP (rejected/accepted:[]), audyt: `Activity` typu EMAIL na kliencie + wpis `ContractHistory` (`WYSLANO_MAILEM`). NIE logujemy adresów (PII). `components/sales/ContractEmailButton.tsx` (przycisk + dialog to/temat/treść) na `/sales/[id]` obok „Generuj .docx". Domyślny odbiorca = email klienta umowy. Gate 'sales' przez middleware. tsc czysty.

### Powiązanie lokali z umowami i klientami (`/sales/link-units`)
**Powód**: po imporcie umów (link po emailu do klienta) brakowało powiązań lokal↔umowa (`ContractUnit`) — plik umów nie miał lokali, a plik lokali miał pustą kolumnę „Umowa". Próba wyprowadzenia lokal→klient→umowa była niemożliwa (15/20 klientów ma wiele lokali I wiele umów — np. Marcin Zieliński: 5 lokali × 4 umowy, iloczyn kartezjański). Rozwiązanie: user wyeksportował lokale z **wypełnioną kolumną „Umowa"** (numer umowy per lokal) — jednoznaczne źródło.
**Implementacja**: `lib/contract-units-link.ts` (header-based: Numer/Umowa/Klient), endpoint `POST /api/sales/link-units` (preview|commit, gate 'sales'), `components/sales/UnitsLinker.tsx`, strona `/sales/link-units`, przycisk „Powiąż lokale" na `/sales`. **Reguła dopasowania umowy**: numer z pliku → **numer bazowy** (bez końcówki `/R÷/D÷/P`) → lokal łączony z WSZYSTKIMI umowami tego numeru bazowego (rezerwacyjna + deweloperska tej samej transakcji — lokal przechodzi przez obie). Dodatkowo `ClientUnit` z kolumny „Klient" (match po imię+nazwisko, niejednoznaczne → pominięte z ostrzeżeniem). Upsert (idempotentne), NIE tworzy lokali/umów — tylko powiązania istniejących; brakujące raportuje (unitNotFound/contractNotFound/clientNotFound).
**Zweryfikowane** (symulacja na realnych plikach): 53 lokale z numerem umowy → **99 powiązań ContractUnit** (46 lokali do pary R+D, 7 do jednej), 0 numerów bez dopasowania, 53 ClientUnit. tsc czysty. **Kolejność**: lokale muszą już być w bazie (import `/units/import`), umowy zaimportowane, klienci wyczyszczeni — wtedy ten linker domyka graf.

### Import umów: mapowanie po nagłówkach + linkowanie klienta po emailu
**Powód**: realny eksport „Umowa sprzedaży" ma inny układ kolumn niż zakładał pozycyjny parser `lib/contracts-import.ts` (kolumny: `Nazwa`=nr umowy, `Nazwa spółki`, `Inwestycja`, `Typ umowy`, `Data wprowadzenia`, `Planowana data podpisania`, `Data podpisania`, `Status umowy`, `Status procesu`, `Klienci`, `Email` — brak lokali/wartości/telefonu). Stały mapping by go rozjechał. Plus: linkowanie klient↔umowa po samym nazwisku jest zawodne.
**Analiza pokrycia** (41 umów vs 27 klientów z importu): po **emailu 18/19**, po nazwisku 19/20, po numerze z kolumny „Umowy" w pliku klientów tylko 30/40 (część numerów to 2025/bazowe bez sufiksu `/R`÷`/D`). → linkowanie **po emailu** najpewniejsze i robione w jednym przejściu przy imporcie umów (plik umów ma email przy każdej umowie). Kolumna „Umowy" w pliku klientów NIE używana.
**Implementacja**: `parseSheet` przepisany na **mapowanie po nazwach nagłówków** (`HEADER_ALIASES` + `resolveColumns` z dwupoziomowym priorytetem — `nazwa`→number tylko gdy brak `nr umowy`; wspiera stary i nowy format). `blankrows:false` (eksport miał used-range ~1M pustych wierszy). Dodane pole `plannedSignDate` (parsowane + zapisywane na Contract). `resolveClientId(fullName, d, useEmail)` — **email ma pierwszeństwo**, ale tylko dla głównego klienta umowy (współkupujący po nazwisku; nowo tworzonym współkupującym NIE przypisujemy emaila głównego). Diff (preview) też uwzględnia email w `clientResolution`. Zweryfikowane na realnym pliku: 41 umów, 23 REZERWACYJNA + 18 DEWELOPERSKA, statusy 37/3/1 (w tym Rozwiązana→ROZWIAZANA), tsc czysty. API `/api/sales/import` + UI `ContractsImporter` bez zmian (kształt diff zachowany).
**Kolejność importu**: 1) klienci (`/clients/import`, dedup po PESEL), 2) umowy (`/sales/import`) — wtedy email-match podpina istniejących, tworzy tylko ~1 brakującego. **Caveat**: ten plik umów nie ma lokali ani wartości netto/brutto → umowy powstaną bez podpiętych lokali i kwot (do uzupełnienia z importu lokali / ręcznie).

### Import klientów z xlsx (`/clients/import`) — create-only, dedup po PESEL
**Powód**: migracja istniejącej bazy klientów (eksport z poprzedniego CRM) — wcześniej brak importu klientów (był tylko dla lokali/przerobów). Plik eksportu: kolumny `Nazwa | Imiona | Nazwisko | Miasto | Ulica | E-mail | Numer telefonu | PESEL | Umowy | Data utworzenia | Data modyfikacji`.
**Implementacja**: wzorzec jak import lokali (preview/commit). `lib/clients-import.ts` — parser mapuje kolumny **po nazwach nagłówków** (case-insensitive aliasy: Imiona/Imię→firstName, Nazwisko→lastName, Miasto→city, Ulica/Adres→address, E-mail/Email→email, Numer telefonu/Telefon→phone, PESEL→pesel; reszta ignorowana) — odporne na kolejność kolumn. `buildClientDiff` / `commitClientImport`, endpoint `POST /api/clients/import` (preview|commit, gate 'clients'), `components/clients/ClientsImporter.tsx`, strona `/clients/import`, przycisk „Importuj z Excela" na liście klientów.
**Dedup po PESEL** (wybór usera): istniejący klienci wczytywani przez `prisma.client.findMany` — PESEL **odszyfrowany automatycznie** przez extension, więc porównanie plaintext↔plaintext działa wprost (gdyby trzymać tylko ciphertext, dedup byłby niemożliwy — losowy IV). Tryb **tylko dodawanie nowych** — istniejący PESEL = skip, duplikat PESEL w pliku = skip. Wiersze **bez PESEL** dodawane jako nowi z flagą (brak deduplikacji przy reimporcie) — w pliku testowym 9/27 bez PESEL. Nowi dostają `status: 'ZAPYTANIE'`, `source: 'import'`. Tworzenie w `$transaction` → `tx.client.create` przez extension → PESEL/adres szyfrowane przy zapisie.
**Pułapka**: `ENCRYPTION_KEY` MUSI być ustawiony **przed** importem — inaczej PESEL-e zapiszą się plaintext (z ostrzeżeniem w logu). Kolumny `Umowy` i daty z pliku na razie ignorowane (linkowanie do umów to osobny temat). Plik eksportu z PESEL-ami trzymać poza repo (nie commitować).

### Bezpieczeństwo danych klientów — szyfrowanie at-rest + załatana luka authz
**Kontekst**: przed importem prawdziwej bazy klientów (z PESEL-ami) user poprosił o audyt bezpieczeństwa. Ustalenia: anonimowy dostęp dobrze chroniony (HTTPS, wszystkie endpointy z `getServerSession`, repo private, hasła bcrypt, brak PII w logach/repo), ale **2 realne luki**.

**Luka 1 — authz (naprawiona, commit `ed116da`)**: `getRequiredPermission` (lib/permissions.ts) mapowała `/api/sales` → 'sales', ale realny endpoint umów to `/api/contracts/*`. Brak go w mapie → każdy **zalogowany** user (np. podwykonawca z dostępem tylko 'przeroby') mógł `GET /api/contracts/[id]` (pełny klient: PESEL, dowód, rodzice, adres) i `/generate` (DOCX z PESEL). Analogicznie `/api/activities` (notatki klienta). Fix: `/api/contracts` → 'sales', `/api/activities` → 'clients'. Plus usunięto adres e-mail odbiorcy z `console.log` w `oferty/[id]/email`.

**Luka 2 — brak szyfrowania at-rest (naprawiona)**: pola wrażliwe `Client` były plaintextem → dump bazy / wyciek `DATABASE_URL` = czytelny PESEL. Wdrożone szyfrowanie AES-256-GCM:
- `lib/crypto.ts` — `encryptField`/`decryptField` (format `enc::v1::base64(iv[12]|tag[16]|ct)`), `deepDecrypt` (rekurencyjny walk wyniku — odszyfrowuje stringi z prefiksem, bezpieczny dla całego grafu). Klucz: `ENCRYPTION_KEY` (64 hex). Idempotentny + no-op dla legacy plaintext.
- `lib/prisma.ts` — `$extends`: write na modelu `client` szyfruje podzbiór pól, `$allModels.$allOperations` deszyfruje KAŻDY wynik (w tym **nested includes** — `contract.client.pesel`, `contractClients[].client`). **Przezroczyste — zero zmian w endpointach** (zapis auto-szyfruje, odczyt auto-deszyfruje). Pominięcie ścieżki odczytu niemożliwe (wszystko idzie przez Prisma).
- **Szyfrowane pola**: `pesel`, `nip`, `idNumber`, `fatherName`, `motherName`, `address`. **NIE szyfrowane** (świadomie): `firstName`/`lastName`/`email`/`phone` (używane w wyszukiwaniu `/api/clients`), `city`/`zipCode` (filtry). Kompromis funkcjonalność↔ochrona — najwrażliwsze (kradzież tożsamości) zaszyfrowane.
- `scripts/encrypt-existing-clients.js` — migracja istniejących rekordów (self-contained CommonJS, ten sam format, idempotentny, używa bazowego PrismaClient bez extension).
- Test: `lib/crypto.ts` zweryfikowany lokalnie (21 asercji — round-trip, idempotencja, unikalny IV, legacy passthrough, deep nested decrypt, wykrywanie manipulacji auth-tagiem, rezylientność bez klucza). Bez bazy (czysta krypto).

**Schema NIE zmieniona** — pola zostają `String?`, zmienia się tylko zawartość → `prisma db push` NIEpotrzebny. **Po deployu**: (1) wygeneruj `ENCRYPTION_KEY`, dodaj w Coolify env, **restart** (nie rebuild — to nie `NEXT_PUBLIC_`). (2) Uruchom `node scripts/encrypt-existing-clients.js` w Coolify Terminal. (3) Klucz do password managera. **Pułapka**: zmiana klucza po zaszyfrowaniu = nieodczytywalne dane (brak rotacji). Bez klucza aplikacja działa, ale pisze plaintext (ostrzeżenie w logu).

**Pozostałe rekomendacje (infra, NIE kod — do zrobienia przez admina)**: Coolify panel na czystym HTTP (`:8000`) — za HTTPS/VPN; brak backupów bazy (infrastruktura.md: „TODO"); brak rate-limit na logowaniu; brak 2FA. Patrz audyt w tej sesji.

---

## 2026-05-19

### Integracja z 3D Estate (matryca 3D) — MVP endpoint (Faza 1)
**Powód**: 3DE pulluje co 15-30 min nasz endpoint i odświeża ceny + statusy lokali na matrycy 3D na novastaffa.pl. Bez tego matryca byłaby aktualizowana ręcznie po stronie 3DE → desynchronizacja z CRM. Wymagane przed faktycznym odpaleniem systemu.
**Architektura**: PULL z naszej strony (3DE odpytuje), nie push — tak deklarują w specyfikacji „Wymagania integracji z CRM — 3DEstate" (kod zgłoszenia `86c9vnnau`). Endpoint `GET /api/integrations/3destate/units` POZA route group `(app)` — nie podlega session check NextAuth (3DE to zewnętrzny system). Autoryzacja: header `X-API-Key` (klucz w `Settings.threeDEstateApiKey`, generowany w `/settings` button "Wygeneruj klucz" → `randomBytes(32).toString('hex')` z prefiksem `3de_`). Opcjonalny IP whitelist (`Settings.threeDEstateAllowedIp`, 3DE deklaruje stałe IP `213.189.56.203`) — czyta `x-forwarded-for` za Coolify reverse proxy.
**Mapowanie**: `lib/3destate.ts` — `STATUS_MAP` (`WOLNY→Dostępny`, `ZAREZERWOWANY→Zarezerwowany`, `SPRZEDANY→Sprzedany`, `NIEDOSTEPNY→Niedostępny w sprzedaży`), `TYPE_MAP` (`MIESZKALNY→Mieszkanie` itd.). `serializeUnit()` zwraca kształt dopasowany do spec 3DE: id = `Unit.number` (czytelne, nie cuid — `B1.1.M3`), `kartaUrl` z `Unit.floorPlanUrl` (absolutny URL, 3DE pobiera plik), `prospektUrl` z `Settings.prospektInformacyjnyUrl` (jeden PDF dla całej inwestycji — user wgra do `public/uploads/` i wklei path w UI), `visibleOnMatrix` (nowe pole, ukrywa lokal niezależnie od statusu), pola promo (`pricePromo/PerSqm`, `promoActive`).
**Pułapka Omnibus**: dyrektywa unijna wymaga pokazania najniższej ceny z 30 dni przed promocją. 3DE deklaruje że obsłuży historię cen po swojej stronie (z odczytów naszego endpointu) — my **nie wysyłamy** `priceHistory` ani `omnibus*` w response. Konsekwencja: jeśli włączymy pierwszą promocję świeżo po starcie integracji, 3DE może nie mieć jeszcze 30 dni historii odczytów → Omnibus może wyświetlić się błędnie. UI w `/units/[id]/edit` ma ostrzeżenie pod checkboxem "Promocja aktywna". `PriceHistory` po naszej stronie będzie potrzebny **dla dane.gov.pl** (obowiązek ustawowy) — projektowany osobno (`docs/raportowanie-dane-gov-rozpoczecie.md`).
**Schema (`prisma db push` wymagane)**: nowe pola `Unit.visibleOnMatrix` (Bool @default true), `Unit.promoActive` (Bool @default false), `Unit.promoPriceNet/Gross`, `Unit.promoPricePerSqmNet/Gross` (Float? — nullable, zapisywane zawsze niezależnie od `promoActive`, żeby zachować wpisane wartości po odznaczeniu checkboxa). Klucze Settings: `threeDEstateApiKey`, `threeDEstateAllowedIp`, `prospektInformacyjnyUrl`.
**UI**: `components/settings/IntegrationsSection.tsx` — sekcja w `/settings` z URL endpointu (copy-paste do przekazania 3DE), API key (pokaż/ukryj/kopiuj/zrotuj z confirm), IP allowlist, URL prospektu. `components/units/UnitForm.tsx` — nowa sekcja "Matryca 3D (3D Estate)" z checkboxami `visibleOnMatrix` + `promoActive` i polami ceny promo (mirror logiki cen bazowych: per-sqm vs ryczałt, auto-przeliczanie netto↔brutto przez VAT).
**Co robić po deployu**: (1) `prisma db push` w Coolify Terminal. (2) Admin wchodzi w `/settings` sekcja "Integracja z 3D Estate", klika "Wygeneruj klucz", kopiuje URL endpointu + klucz. (3) Przekazuje bezpiecznie do 3DE (support@3destate.pl, kod zgłoszenia `86c9vnnau`). (4) Opcjonalnie wkleja IP 3DE `213.189.56.203` do allowlist. (5) 3DE testuje pull i daje znać że dane są ok. Patrz `docs/integracja-3destate-decyzje.md`.

### WordPress cleanup na hostingu home.pl + diagnoza SSL maraf.pl (operacyjne, nie kod)
**Powód**: Kontynuacja incydentu z 2026-05-18 (hack SMTP bogdan.boruch@maraf.pl). Drugi kanał spamu (`[text your-subject]`) prowadził do **zapomnianego WordPressa** w `/autoinstalator/wordpress` na hostingu home.pl. Plus odkryto że konto home.pl ma 4 instalacje WP, w tym 2 zombie z 2013/2014 bez przypisanej domeny + 1 zapomniana fotografia-lodz.pl.
**Wykonane (po stronie usera w panelu home.pl)**: skasowane 3 zombie WP (oba `/autoinstalator/wordpress` 2013-07-27 + 2014-04-02 + `/autoinstalator/wordpress1` fotografia-lodz.pl). Zostawione: novastaffa.pl (żywa firmowa). Ticket do home.pl o skasowanie `/do-usuniecia/` (FileZilla nie kasuje, UID 31189 = admin home.pl).
**Diagnoza SSL maraf.pl — fałszywy alarm**: cert wygląda na zepsuty z komputera Rafała, ale to **Avast Antivirus MITM-uje HTTPS** lokalnie (issuer `CN=Avast Web/Mail Shield Root`). Prawdziwy cert serwera (z crt.sh + bezpośredniego fetch) jest OK — wystawca home.pl S.A., SAN obejmuje maraf.pl, ważny do 2027-03-12. Chrome (własny store certów) mówi „Połączenie jest bezpieczne".
**Otwarte (do następnej sesji)**: audyt wp-admin maraf.pl (motyw envision z ~2013, prawdopodobnie nieaudytowany — analogiczne ryzyko jak rafalboruch.com miała przed marcowym hackiem 2026-03), sprawdzenie czemu rafalboruch.com modyfikowane 18.05 mimo „nic nie robiłem od miesiąca", prewencyjna lista + zmiana haseł wszystkich skrzynek @maraf.pl. Pełna lista TODO + odkrycia (marcowy hack rafalboruch.com, inwentaryzacja WP) → `docs/incident-bogdan-mail-status.md` sekcja „Update 2026-05-19".

---

## 2026-05-15

### Sprzedaż: wycięte 5 martwych pól z `Contract` (cleanup)
**Powód**: Sekcja „Warunki finansowe" w `/sales/[id]` pokazywała 8 wierszy z `—` (puste), bo pola `maxReservationFee`, `maxDiscount`, `salesChance`, `landSharePrice`, `caretaker` istniały w schemacie i formularzu, ale **żadne nie wpływało na nic** poza wyświetlaniem — nie były czytane w decyzjach systemowych, nie były w szablonie DOCX (poza `landSharePrice` przez `buildContractContext`, ale nowy szablon umowy z 2026-05-12 ma cenę udziału w gruncie wpisaną na sztywno, więc placeholder `{{landSharePrice}}` nie istnieje). Konwersja oferty → umowa ustawia tylko `valueNet/Gross`, reszta zawsze `null`.
**Implementacja**: usunięte z `Contract`: `maxReservationFee`, `maxDiscount`, `salesChance`, `landSharePrice`, `caretaker`. Zostają: `reservationFee` (używany w `{{reservationFee}}` w szablonie), `discount`, `valueNet`, `valueGross` (auto-set przy konwersji oferty). Czyszczenie objęło: `prisma/schema.prisma`, `components/sales/ContractForm.tsx` (state + 5 inputów), `app/(app)/sales/[id]/page.tsx` (5 wierszy + sekcja zmniejszona z 8 do 4 pól), `app/api/contracts/route.ts` (POST destructuring + zapis), `app/api/contracts/[id]/route.ts` (PATCH `editableStringFields` / `numberFields` / blok `salesChance`), `lib/contract-generator.ts` (`landSharePrice` + `landSharePriceWords` z `buildContractContext`). `scripts/prepare-template.js` zostawiony — to archiwum (nowy szablon otagowany ręcznie). **WYMAGANE po deployu**: `prisma db push --skip-generate` w Coolify Terminal (5 kolumn DROP w tabeli `Contract` — dane w nich i tak nie były używane). **Pułapka reverse**: gdyby kiedyś wracać do tych pól (np. `salesChance` dla CRM-owego forecastingu, `maxDiscount` jako gate „handlowiec ≤ X%"), commit jest reversible w gicie — schema + endpointy + formularz + widok do odtworzenia naraz.

---

## 2026-05-13

### `% kontraktu` liczony wg umownej wartości (`SubContract.agreedValueNet`)
**Powód**: Wskaźnik „% kontraktu" w widoku protokołu pokazywał **96,5%** mimo że fizycznie wybudowano ~60% budynku (3 z 5 pięter). Diagnoza (replikacja logiki importera na pliku xlsx): mianownik `contract.valueNet` jest wyliczany przez `import-protokoly.js` jako `Σ(plannedQty × unitPrice)` wszystkich `ContractWorkItem` — ale pozycje umowne to **unia z dotychczasowych protokołów**. Arkusze obejmują tylko sekcje FUNDAMENTY + PARTER + I Piętro (1 726 900 zł), bo prace na wyższych kondygnacjach nie weszły jeszcze do faktur. Czyli `valueNet` = wartość **zafakturowanego zakresu**, nie całej umowy → `%` zawyżony i niestabilny (rośnie gdy w nowym protokole pojawią się pozycje nowych kondygnacji, a wtedy `%` przy starych protokołach spada).
**Rozwiązanie** (wariant uzgodniony z userem): nowe pole `SubContract.agreedValueNet Float?` — umowna wartość netto **całego** zakresu robót, wpisywana **ręcznie** w UI. Importer jej NIE dotyka (przeżywa pełny reimport). Endpoint `PATCH /api/przeroby/contracts/[id]` (akceptuje `"1 234,56"` — spacje + przecinek). Komponent `KontraktStat` (client) — edytowalny kafelek: `% = cumulativeTotal / agreedValueNet`; gdy `agreedValueNet` puste → kafelek pokazuje „—" + zachętę „Ustaw wartość umowy" + podpowiedź ile wynosi suma zafakturowanych pozycji (`valueNet`). Dashboard `/przeroby` — pasek postępu umowy: mianownik `agreedValueNet ?? valueNet`. `valueNet` (wyliczana) zostaje — to teraz semantycznie „suma zafakturowanych pozycji", nadal liczona przez importer. **Wymaga `prisma db push`.**

### Kolumna porównawcza „Maraf (obmiar)" w widoku protokołu — edytowalna
**Powód**: User chce porównać rozliczenie wykonawcy (pozycje protokołu przerobowego) z obmiarem inżynierskim Maraf — żeby widzieć czy wykonawca nie rozlicza więcej niż wynika z projektu. Istniejące `/przeroby/porownanie` porównuje per kondygnacja (agregaty Konrad↔Maraf), nie per pozycja protokołu.
**Implementacja**: `lib/protokol-maraf-match.ts` — `matchProtocolItemToMaraf()` mapuje pozycję protokołu (opisowa nazwa + sekcja + jednostka) na `WorkItem` obmiaru Maraf. Reguły keyword-based: sekcja → kondygnacja + `level` (FUNDAMENTY/PARTER obie = Kondygnacja 0, ale różne kategorie), nazwa → kategoria + `elementType`. **Konserwatywne** — mapuje tylko pewne dopasowania, reszta → `MANUAL` z powodem. Wykluczenia sprawdzane przed regułami: stal (T/kg — Maraf nie mierzy zbrojenia), chudy beton, roboty ziemne, izolacje, murowanie, dźwig, łączniki, daszki, jednostki mb/stopni/kpl. Konwersja m³→m² dla ścian (÷ 0,18 m grubości, jak moduł Konrada). Statusy: `AUTO`/`CONVERTED`/`APPROX`/`MANUAL`.
**Iteracja po feedbacku usera** (ten sam dzień): (1) kolory były nieczytelne (amber tekst na amber tle, źle w dark mode) → `MarafCell` (server) zastąpiony przez `MarafCompareCell` (client) z badge'ami `bg-X-50/text-X-700` (pattern jak `StatusBadge`, działa w dark), kolumna wyróżniona lewą ramką zamiast amber tła. (2) brak możliwości ręcznej korekty → schema `ProtocolItem.marafManualValue` + `marafManualNote`, endpoint `PATCH /api/przeroby/protocols/items/[id]`, klik w komórkę otwiera edycję inline (input + komentarz). **marafManualValue nadpisuje auto-match.** Czyli kolumna NIE jest już pure read-only — wymaga `prisma db push` na produkcji. **Pułapka**: pozycje protokołu mają opisowe nazwy które mogą się zmienić między miesiącami — reguły matchują po słowach kluczowych (`['ław']`, `['strop']`...), nie po pełnej nazwie, więc tolerują warianty. Patrz `docs/przeroby-decyzje.md` sekcja 10.

### Fix: `Unit.rooms` w schema.prisma (broken build z Meta Ads 1b)
**Powód**: Commit `abf8848` (Meta Ads 1b, równoległa sesja) wprowadził kod używający `Unit.rooms` (`UnitForm.tsx`, `units/[id]/page.tsx`, `api/units/route.ts` + `[id]/route.ts`, `ad-creative/route.ts`) ale **nie dodał pola do `schema.prisma`** → origin/main miał broken build (4 błędy TS2339 „Property 'rooms' does not exist").
**Implementacja**: dodane `rooms Int?` do modelu `Unit` (typ wydedukowany z użycia — `parseInt(body.rooms)` + `null` fallback w `api/units`). Naprawione przy okazji commitu o kolumnie Maraf bo blokowało wspólny build. **Wymaga `prisma db push`.**

### `import-protokoly.js` — pełny reimport idempotentny (pułapka `onDelete: Restrict`)
**Powód**: Protokoły przerobowe (7 sztuk, wrzesień 2025 → kwiecień 2026) zniknęły z bazy po zmianie środowiska — trzeba było reimport. Stara wersja skryptu przy istniejącej umowie robiła tylko `contractWorkItem.deleteMany` — co **padłoby na foreign key**, gdyby w bazie były już protokoły: `ProtocolItem.contractWorkItem` ma `onDelete: Restrict`, więc nie można skasować `ContractWorkItem` póki wskazuje na niego żywy `ProtocolItem`. Skrypt działał tylko na czystej bazie, drugi odpał = crash.
**Implementacja**: w bloku „istniejąca umowa" kasujemy w prawidłowej kolejności: najpierw `protocol.deleteMany` (kaskada na `ProtocolItem` przez `onDelete: Cascade`), dopiero potem `contractWorkItem.deleteMany`. Skrypt jest teraz w pełni idempotentny — można odpalać wielokrotnie, zawsze wychodzi deterministyczny stan (7 protokołów z xlsx). `DEFAULT_FILE` zmieniony na ścieżkę produkcyjną `/app/data/protokoly/protokoly-staffa-fbr.xlsx` (plik commitowany do repo → w obrazie przez `COPY data/`). **Pułapka w danych**: arkusz „30-11-2025" ma `periodFrom` = 01.10.2025 (nakłada się z protokołem październikowym) — artefakt źródłowego xlsx, nie błąd parsera; `periodTo` jest OK więc sortowanie/miesiąc działa. Suma reimportu: 1 666 588,39 zł netto, 54 pozycje umowne.

### `app/uploads/[...path]/route.ts` — fix 404 dla plików z volume
**Powód**: Po imporcie 59 kart mieszkań URL `/uploads/floorplans/*.pdf` zwracał 404. Diagnoza w Coolify Terminal pokazała że pliki SĄ na volume (`/dev/sda1 mounted on /app/public/uploads`, uprawnienia `nextjs:nodejs -rw-r--r--`), ale Next.js w trybie `output: 'standalone'` (next.config.js) **trace'uje listę plików w `public/` w buildtime** — runtime additions (przez Coolify persistent volume / nasze skrypty importowe) są niewidoczne dla wbudowanego static handlera.
**Implementacja**: catch-all API route `app/uploads/[...path]/route.ts`. Czyta plik z `path.join(process.cwd(), 'public', 'uploads', ...params.path)` przez `fs.readFile`, streamuje z `Content-Type` na podstawie rozszerzenia (MIME table: pdf/jpg/png/webp/gif/svg/dxf/docx/xlsx). Wymaga `getServerSession` (401 bez), sanityzuje segmenty (`..`, `\0`, `/`, `\` blokowane) + `path.resolve` check że nie wychodzimy z `UPLOADS_DIR`. **Middleware matcher** (`'/((?!auth|api/auth|_next|favicon|.*\\.).*)'`) wyklucza URL-e z kropką, więc gate permission przez middleware tu nie zadziała — sami sprawdzamy session. Cache `private, max-age=3600` (per-user, żeby zmiana `floorPlanUrl` po reupload natychmiast się złapała).
**Konsekwencja**: każdy nowy katalog w `public/uploads/*` (rysunki, oferty PDF, przyszłe uploady) automatycznie działa — endpoint jest catch-all. **NIE TRZEBA** rebuildu Next.js po dodaniu nowych plików w runtime. **Pułapka**: jeśli ktoś w przyszłości doda nowy MIME type — uzupełnić `MIME` w route.ts.

### Bulk import 59 kart mieszkań PDF (deterministyczne mapowanie)
**Powód**: Maraf dostarczył 59 PDF-ów (karty lokali) w folderach `Pietro 1/`..`Pietro 4/` z nazwami `Nova Staffa_karta lokalu_nr1.pdf`..`nr59.pdf`. Trzeba je hurtem podpiąć do `Unit.floorPlanUrl` żeby były dostępne w `/lokale/<id>`. Ręczne wgrywanie przez UI dla 59 lokali odpada.
**Implementacja**: `scripts/import-floorplans.js`. Najpierw próbowałem **pdf-parse** (wyciągnięcie metrażu i piętra z tekstu PDF) — wynik: 0/59, bo fonty osadzone bez CMap, tekst nieczytelny. Pivot na **deterministyczne mapowanie po nazwach**: folder → numer piętra (`/Pi[ęe]tro\s*(\d+)/`), filename → globalny numer pliku (`/nr(\d+)/`), w bazie `SELECT Unit WHERE type='MIESZKALNY'` + sort numeryczny po końcowym numerze z `unit.number` (`extractTrailingNumber`), N-ty plik → N-ty Unit. **Pułapka**: Prisma `orderBy: { number: 'asc' }` sortuje stringami — `M1, M10, M11, ..., M2, M3` zamiast `M1, M2, M3...`. Na piętrach 2-4 problemu nie było (wszystkie 2-cyfrowe), tylko piętro 1 (mieszane 1-cyfrowe + 2-cyfrowe) miało źle. Fix przez sortowanie w JS: `units.sort((a,b) => extractTrailingNumber(a.number) - extractTrailingNumber(b.number))`. Weryfikacja: filename floor === unit.floor → warning gdy nie pasuje (znaleziono 2 literówki w `Unit.floor` z importu xlsx: `B1.2.M18` floor=3 zamiast 2, `B1.4.M59` floor=5 zamiast 4 — do poprawienia w UI). Pliki kopiowane do `/app/public/uploads/floorplans/<number>-<ts>.pdf` (Coolify persistent volume), `Unit.floorPlanUrl` ustawiane przez `UPDATE`. Tryb `--dry-run` dla preview bez zapisu. **Source** w repo: `data/karty/` (18MB, COPY w Dockerfile) — po imporcie do produkcji można usunąć (`git rm -r data/karty`). Patrz [docs/karty-mieszkan-status.md](karty-mieszkan-status.md).

### Akceptacja Inwestora (`investorApproved`) + ręczne dodawanie pozycji obmiaru
**Powód**: (1) Brakowało finalnej decyzji „Inwestor zatwierdza pozycję do protokołu" — stary mechanizm `accepted` był akceptacją różnicy przez kierownika, nie wystarczał semantycznie do podstawy faktury. (2) Brakowało możliwości dodania pozycji spoza listy `buildPositionsForFloor` (np. „Słupy maszynowni dachu" — element specjalny nieprzewidziany w mapowaniu Maraf↔Konrad).
**Implementacja**:
- Schema: 5 nowych pól w `FloorSummaryItem` — `investorApproved`, `investorApprovedBy/At/Note/Value` (snapshot wartości kierownika w momencie akceptacji). `accepted/At/Note` zostawione w schemie jako DEPRECATED (nie używane w UI, niekasowane żeby nie tracić historii). Nowy `matchMode = 'MANUAL_ADDED'` (komentarz).
- API: PATCH `floor-summaries/items/[id]` — akceptacja tylko dla admina (403 dla innych). Zmiana `konradManualValue` **auto-cofa** akceptację (`INVESTOR_UNAPPROVE` w historii) + ustawia `approvalStale` w UI. POST `floor-summaries/[summaryId]/items` (NOWY) — dodawanie pozycji manualnej. DELETE `items/[id]` — tylko dla `matchMode === 'MANUAL_ADDED'`.
- UI: nowa kolumna „AKCEPTACJA INWESTORA" w tabeli (badge ✓ / ⚠ Nieaktualna / Czeka). Komponent `InvestorApproval` w panelu szczegółów (zielony banner gdy ok, żółty gdy stale, formularz dla admina). Button „➕ Dodaj pozycję" nad tabelą + modal `AddItemModal` (name, unit dropdown, opc. wartości Marafu + kierownika + uzasadnienie). Delete button widoczny tylko dla `MANUAL_ADDED` w panelu szczegółów. Nagłówek tabeli „Pozycja kierownika" → „Pozycja obmiaru".
- Reimport (`przedmiar-konrad-import.ts`): `manualAddedByFloor` map zachowuje pozycje `MANUAL_ADDED` osobno (poza `preserveMap` po nazwie). Doklejone na końcu pętli po standardowych `buildPositionsForFloor`. Pełna preservacja: name, unit, wszystkie wartości manual, akceptacja inwestora, historia.
- Semantyka `totalReady` zmieniona: tylko `investorApproved === true` zalicza pozycję jako gotową do protokołu (poprzednio: `accepted || manualValue != null || AUTO_OK w tolerancji`).
- Historia: nowe akcje `INVESTOR_APPROVE`, `INVESTOR_UNAPPROVE`, `ITEM_ADDED`. Stary `ACCEPT/UNACCEPT` oznaczony jako legacy w `ACTION_LABEL`.
- **WYMAGANE po deployu**: `prisma db push --skip-generate` w Coolify Terminal — doda 5 nowych kolumn. Istniejące zaakceptowane pozycje (z `accepted=true`) **nie są** migrowane na `investorApproved` (różna semantyka — accepted był robiony przez kierownika, nie inwestora). Admin musi przejść i zaakceptować ręcznie. Stary `accepted` zostaje w bazie dla auditingu.

### Personalizacja per-user: `/profil`, preferredName, interests + TopWidget dla wszystkich
**Powód**: Hardcoded `ADMIN_DISPLAY_NAME = 'Rafał'` w `greeting.ts` + `isAdmin` gate w `/api/dashboard/widget` blokowały sensowne UX dla nie-adminów. User chciał:
1) każdy user dostaje swoje powitanie po imieniu które sobie ustawia,
2) news dnia per-user (zamiast hardcoded rotacji po dniach tygodnia) wg jego zainteresowań,
3) zarządzanie dostępem do dashboardu już jest (per-user permission `dashboard` od 2026-05-12) — nie trzeba osobnego gate.
**Implementacja**: Schema — `User.preferredName String?`, `User.interests String[] @default([])`, `User.customInterests String[] @default([])`. Predefiniowane tematy (`PREDEFINED_TOPIC_IDS` w [lib/news-feed.ts](lib/news-feed.ts)): `tech, world, business, motivation, biohacking, architecture, real-estate`. Custom tematy = free-form stringi (limit `MAX_CUSTOM_INTERESTS=5`, `MAX_CUSTOM_INTEREST_LENGTH=50`) — fetchowane przez **Google News RSS search** (`news.google.com/rss/search?q=&hl=pl&gl=PL`). Predefiniowane `business/architecture/real-estate` też używają Google News fallback (brak stabilnych dedykowanych RSS), `tech/world` mają dedykowane FEEDS (Spider's Web, TVN24 itd.). Wybór tematu/itemu deterministyczny per user-dzień: `hash(userId + YYYYMMDD)` % count. Default gdy puste interests: `['world', 'business', 'architecture', 'real-estate']`. `lib/greeting.ts` — usunięte hardcoded `ADMIN_DISPLAY_NAME`, priorytet imienia: `preferredName → firstWord(name) → emailLocalPart`. `/api/dashboard/widget` — drop `isAdmin` gate (permission `dashboard` w middleware to teraz jedyny gate); **czyta interests/preferredName z DB po `session.user.id` (nie z JWT)** — zmiany w `/profil` działają natychmiast bez relogu. Nowy endpoint **`PATCH /api/users/me`** z whitelisted fields (preferredName/interests/customInterests) + sanityzacja custom (strip kontrolnych chars, dedup case-insensitive). Nowa strona `/profil` (każdy user; permission map w `lib/permissions.ts` zwraca `null` dla `/profil` i `/api/users/me` PRZED check'iem `/api/users` → admin). Komponent `Avatar` — initials z hash maila (paleta 8 kolorów), zero infrastruktury (decyzja: bez uploadu w MVP). `TopBar` — dropdown z avatarem → "Mój profil" + "Wyloguj" (click-outside + ESC close). `TopWidget` — usunięte rozróżnienie admin/non-admin: pełen widget gdy news+weather są; `SimpleGreeting` gdy oba padły. **Pominięte w MVP** (osobne sesje): avatar upload, theme w DB (zostaje per-przeglądarka), stopki maili per-user, pogoda per-user (zostaje globalna Zgierz — `WEATHER_LAT/LON` env, bo inwestycja jest tam i wszyscy pracują przy niej), `/settings` UX cleanup. **WYMAGANE po deployu**: `prisma db push --skip-generate` w Coolify Terminal (3 nowe kolumny). Admin musi w `/settings → użytkownicy` zaznaczyć Konradowi (i innym non-admin) permission `dashboard` żeby zobaczyli widget — sam fakt rozszerzenia widget na nie-admina to niewystarczające bo middleware nadal wymaga permission `dashboard` dla `/api/dashboard/*`.

---

## 2026-05-12

### Nowy szablon umowy rezerwacyjnej (`templates/umowa-rezerwacyjna.docx`)
**Powód**: User wgrał odświeżony szablon DOCX (treść umowy zaktualizowana, nowy layout). Stary `-original.docx` z surowymi `_______` + skrypt `scripts/prepare-template.js` (regex-podmiana XML) zostawiamy nietknięte jako archiwum, ale nowy szablon jest już **otagowany ręcznie** w Wordzie — placeholdery `{{nazwa}}` wpisane bezpośrednio w treści, bez prepare-template.
**Implementacja**: 45 placeholderów (poprzedni szablon miał 43 — user dodał `{{contractNumber}}` w nagłówku i `{{bankAccount}}` w §3 zamiast podkreśleń). Wszystkie nazwy zgodne z `buildContractContext` w [lib/contract-generator.ts](lib/contract-generator.ts). Pominięte celowo: `{{landSharePrice}}` / `{{landSharePriceWords}}` — cena udziału w gruncie wpisana **na sztywno** w nowym szablonie (generator i tak je buduje w ctx, po prostu nieużywane). `scripts/prepare-template.js` nie jest już potrzebny do tego szablonu (był dla starego workflow z podkreśleniami) — zostawiamy dla referencji jak przerabiać surowe DOCX.
**Walidacja**: dry-render z fake danymi → 0 leftover `{{...}}`, 2 podkreślenia w outputie = miejsca na fizyczne podpisy stron (OK). **Pułapka Worda**: jeśli następnym razem przy edycji szablonu Word podzieli placeholder na kilka run-ów XML (np. po zmianie koloru w środku), docxtemplater go nie znajdzie — wpisywać placeholdery jednym ciągiem bez zmian formatu w środku.

### Per-user permissions w `/settings` (zastępuje `NEXT_PUBLIC_CONTRACTOR_EMAIL`)
**Powód**: Hardcoded `CONTRACTOR_EMAIL` w env był MVP — działa dla jednego usera, nie skaluje się, wymaga rebuildu przy każdej zmianie + nie pokazuje aktualnego stanu w UI. User chciał zarządzania dostępem per-user w `/settings`.
**Implementacja**: Schema — `User.permissions String[] @default([])`. NextAuth `jwt()`/`session()` callbacks (`lib/auth.ts`) propagują permissions z DB do tokenu/sesji (snapshot przy logowaniu; `trigger === 'update'` refresh). `lib/permissions.ts` — `ALL_PERMISSIONS` (9 sekcji: dashboard, clients, units, oferty, sales, service, mailing, calendar, przeroby), `getRequiredPermission(path)` mapuje URL → permission, `getFirstAvailableUrl()` redirect po loginie. **Middleware** (`middleware.ts`) — czyta `token.permissions`, admin (env) override, brak permission → 403 dla `/api/*` / redirect na pierwszą dostępną dla stron. **Sidebar** filtruje sekcje per-permission (item-level: ukrywa Settings dla non-admin). **Settings UI** (`UsersSection.tsx`) — przebudowane karty per-user z checkboxami sekcji, „Zaznacz/Odznacz wszystkie", lokalny dirty-state, PATCH `/api/users/[id]/permissions`. Admin (env) ma wszystko zawsze (override), jego karta pokazuje komunikat zamiast checkboxów. **Wyrzucone**: `isContractor`, `contractorCanAccess`, `NEXT_PUBLIC_CONTRACTOR_EMAIL`, props `canEditMaraf`/`canEditKonrad` w ComparisonTable (wszyscy z `przeroby` permission edytują obie wartości). **Pułapka**: permissions w JWT to snapshot; po zmianie w `/settings` user musi się wylogować i zalogować ponownie (komunikat w UI). **Po deployu wymagane**: `prisma db push --skip-generate` w Coolify Terminal (kolumna `permissions` w `User`). Istniejący userzy dostaną `[]` — admin musi w `/settings` nadać im permissions; admin sam (z env) nie traci dostępu.

### Ręczna wartość Konrada (`konradManualValue`) + uzasadnienie różnicy >5%
**Powód**: Dla pozycji `MANUAL_NOT_FOUND` (Konrad nie ma detalu w xlsx) kierownik musi wpisać wartość ręcznie — wcześniej UI pozwalał tylko nadpisać Marafu (`manualValue`), co było niespójne semantycznie (kolumna „Kierownik" pokazywała 0,00 a edytowało się Marafu). Plus chcemy audytować duże rozjazdy Konrad↔Maraf — jeśli |Δ| > 5%, kierownik musi napisać „z czego wynika".
**Implementacja**: Schema — dwa nowe pola w `FloorSummaryItem`: `konradManualValue Float?` + `konradManualReason String?`. Endpoint PATCH `/api/przeroby/floor-summaries/items/[id]` przyjmuje nowe pola + auth-aware: contractor (Konrad) ma 403 przy próbie edycji `manualValue` (Maraf). Historia: nowe akcje `SET_KONRAD_VALUE` / `CLEAR_KONRAD_VALUE` w `FloorSummaryItemHistory.action`. Reimport (`lib/przedmiar-konrad-import.ts`) zachowuje oba pola w `PreservedItem`. UI `ComparisonTable` — nowy komponent `KonradEditor` (indigo) z live Δ%, walidacją `reasonMissing` (disable submit), próg `KONRAD_DIFF_THRESHOLD = 0.05`. `refValue()` i `referenceValue()` traktują `konradManualValue` jako pierwszorzędną wartość kierownika (nad `laborQty`/`concreteVol`). `totalReady` zalicza pozycję z `konradManualValue` jako gotową gdy Δ ≤ 5% lub wpisane jest uzasadnienie. **WYMAGANE po deployu**: `prisma db push --skip-generate` w Coolify Terminal (schema zmieniona).

### Rola `CONTRACTOR` — Konrad widzi tylko sekcję Przeroby
**Powód**: Konrad (kierownik podwykonawcy) ma uzupełniać wartości w `/przeroby/porownanie/[floor]` — ale nie powinien widzieć reszty CRM-u (klienci, oferty, sprzedaż, settings). Potrzebny gate per-rola.
**Implementacja**: Hardcoded email w env `NEXT_PUBLIC_CONTRACTOR_EMAIL` (analogicznie do `NEXT_PUBLIC_ADMIN_EMAIL`) — bez zmiany schema, bez `User.role` enum. Funkcja `isContractor()` + biała lista `contractorCanAccess()` w `lib/auth-utils.ts`. **Middleware** `middleware.ts` (server-side, NextAuth JWT) blokuje server-side: redirect na `/przeroby` dla stron, 403 JSON dla API. **Sidebar** (client-side) filtruje sekcje — contractor widzi tylko grupę „Przeroby". **Po zmianie env wymagany REBUILD** (nie tylko restart) — `NEXT_PUBLIC_` jest inline'owane w buildtime, inaczej Sidebar client-side nie zauważy roli.

### Maraf wyznacznikiem także dla pozycji `MANUAL_NOT_FOUND`
**Powód**: W `/przeroby/porownanie/[floor]` kolumna „Maraf (wyznacznik)" była pusta (`—`) dla pozycji typu „Strop nad I piętro", „Belki nad I piętro", „Biegi schodowe" — mimo że xlsx obmiaru Marafu zawiera komplet danych (Stropy nadziemia A=1013,90 m² na Kondygnacji 1 itd.). Bug: kod liczył `autoValue` tylko dla `matchMode === 'AUTO_OK'`, ignorując pozycje `MANUAL_NOT_FOUND` mimo że mają `mappingRule`. Semantyka `MANUAL_NOT_FOUND` to „brak detalu u **Konrada**", nie u Marafu — Maraf jest wyznacznikiem zawsze.
**Implementacja**: [page.tsx:66-103](app/(app)/przeroby/porownanie/[floor]/page.tsx) — `autoValue` liczony dla każdej pozycji z `mappingRule`. Dodatkowo: jeśli reguła nie dopasowała żadnego `WorkItem` → `autoValue = null` (zamiast wprowadzającego w błąd `0,00`); breakdown per `elementType` w panelu szczegółów (np. dla belek/wieńców/nadproży nad I piętrem); label `MANUAL_NOT_FOUND` zmieniony z „brak w obmiarze" na „brak u kierownika".

### PDF oferty + wysyłka mailem — działa na produkcji
**Powód**: Po deployu `b00ed31` (HOME dir dla user nextjs) + `d0ed015` (Google Chrome zamiast Debian chromium) Chrome odpala się czysto, `/api/oferty/[id]/pdf` zwraca PDF, mail z attachmentem dociera. Wcześniejsze raporty „crashpad fail po b00ed31" były z czasu zanim deploy realnie wszedł w kontener — diagnostyka `diag` z `5fb4a73` potwierdziła stan kontenera dopiero teraz: `homeExists: true`, `chromeBinExists: true`, `whoami: nextjs`, `HOME=/home/nextjs`, Chrome odpala się i wypluwa pusty DOM bez crashpad errora (D-Bus errory to niegroźny szum w headless kontenerze).
**Implementacja**: Bez nowych zmian w kodzie — `b00ed31` + `d0ed015` były właściwymi fixami. Usunięto tymczasową diagnostykę `diag` z endpointu `/pdf`. `docs/pdf-generator-status.md` skasowany.

### Treść maila z ofertą — minimalna (PDF wystarczy)
**Powód**: Skoro PDF z ofertą jest załącznikiem (z brandingiem + tabelą + sumą + USP Nova Staffa), powielanie tabeli i podsumowania w HTML body było redundantne. Klient i tak otwiera PDF.
**Implementacja**: `app/api/oferty/[id]/email/route.ts` — usunięto sekcję info oferty + tabelę items + summary + notes. Body to teraz `<p>{messageHtml}</p>` + opcjonalnie `emailSignature` z Settings. Default message w `EmailDialog` zakończony stopką „Pozdrawiam / Rafał Boruch / t. 501 629 619" (user-edytowalna przed wysłaniem). Query `offer` w endpointcie zwężone do potrzebnych pól (number/clientId/status/totalGross).

---

## 2026-05-09

### Google Chrome stable zamiast Debian chromium
**Powód**: Chromium 137+ na Debian bookworm ma bug — `chrome_crashpad_handler: --database is required` przy spawnie subprocesa. Nie da się wyłączyć flagami (`--disable-crash-reporter`, `--disable-breakpad`, `--disable-features=Crashpad` nie pomogły). Google Chrome stable ma poprawnie skonfigurowany crashpad.
**Implementacja**: Dockerfile w runner stage — `wget` Google signing key + dodanie repo + `apt install google-chrome-stable`. `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable`.

### Docker user `nextjs` MUSI mieć katalog home
**Powód**: Chrome próbuje pisać do `/home/nextjs/.local/share/applications/mimeapps.list`. Jeśli HOME nie istnieje (`useradd --system` bez `-m`) → cascade błędów łącznie z crashpad. Wszystkie poprzednie pomysły naprawy crashpad były ofiarami tego *root cause*.
**Implementacja**: `useradd -m -d /home/nextjs -s /bin/sh` + pre-create `~/.config`, `~/.local/share/applications`, `/tmp/chrome-crashes`, `/tmp/chrome-user-data` z chown.

### Rabat w „zł" → semantyka BRUTTO (breaking change semantyki)
**Powód**: Klient widzi kwotę brutto („20 000 zł rabatu" = 20 000 mniej do zapłaty na fakturze). Wcześniej wpisana kwota była netto, brutto wyliczana przez VAT — mylące dla użytkownika.
**Implementacja**: `computeDiscount()` w OfferCalculator + 2 endpointy API. Typ `'AMOUNT_NET'` zostawiony w bazie jako legacy nazwa (semantyka to brutto). Stare oferty w bazie reinterpretowane.

### Subject email + headers transactional (anti-spam WP)
**Powód**: WP.pl wrzucał maile z ofertami do folderu „Oferty" (auto-klasyfikacja jako handlowe) zamiast Odebranych. Triggery: słowo „Oferta" w temacie + tabela cenowa.
**Implementacja**: Default subject `Wiadomość od MARAF Development — {nr}` (bez słowa „Oferta"). Plus headers: `X-Auto-Response-Suppress: All`, `Auto-Submitted: auto-generated`, `X-Mailer: MARAF CRM`. Po deployu mail trafia do Odebranych.

### PDF oferty jako załącznik (Puppeteer)
**Powód**: Klient woli mieć PDF z ładnym brandingiem niż HTML w treści maila — łatwiej wydrukować/zapisać.
**Implementacja**: `lib/offer-pdf-html.ts` (HTML string z base64-embedded obrazków z public/) + `lib/pdf-generator.ts` (puppeteer-core launch + setContent + page.pdf). Non-blocking — jeśli Chrome padnie, mail leci bez PDF.

### Tylko admin widzi `/settings`
**Powód**: Aplikacja będzie używana przez wielu pracowników. Ustawienia (SMTP, użytkownicy) tylko dla rafal.boruch@maraf.pl.
**Implementacja**: `lib/auth-utils.ts` → `isAdmin(email)` używa `NEXT_PUBLIC_ADMIN_EMAIL`. Sidebar hide link, `/settings/layout.tsx` redirect non-admin do `/dashboard`. Fallback bez env: wszyscy admini (przejście).

### TopWidget na dashboardzie + news polskie + Zgierz
**Powód**: User chciał codzienne urozmaicenie pulpitu — komunikat tematyczny + pogoda lokalna.
**Implementacja**: 3-kolumnowy banner (powitanie + news + weather). RSS polskie + fallback do lokalnej bazy cytatów. Open-Meteo dla Zgierza. Tylko admin widzi news/weather.

### Ikona pogody 56px SVG z animacją
**Powód**: Emoji ☁ wyglądały słabo przy temperaturze tekstowej. User chciał coś bardziej wyraziste.
**Implementacja**: `WeatherIcon` używa lucide-react SVG, mapowanie WMO weather code → komponent + animacja (`spin`, `float`, `pulse`, `flash`) zdefiniowane w `globals.css`. Respect `prefers-reduced-motion`.

### Druk oferty pionowy A4 z brandingiem Maraf + Nova Staffa
**Powód**: Poprzedni druk był landscape, prosty B&W, bez logo. User chciał profesjonalną ofertę handlową.
**Implementacja**: A4 portrait, dwie logo w headerze (`/logo-icon-light.png` Maraf + `/logo-novastaffa.png`), navy+gold brand, sekcja marketingowa Nova Staffa z 8 USP, tabela 7 kolumn (uproszczona z 11), karta „DO ZAPŁATY" jako flagship. Podpisy klient/sprzedawca usunięte.

### Dark mode: opacity warianty wymagają osobnych overrides
**Powód**: `bg-gray-50/30` (Tailwind opacity modifier) generuje INNĄ klasę CSS niż `bg-gray-50` — dark mode overrides w globals.css łapały tylko bez opacity. Skutek: jasne kolumny tabel w dark mode (np. „Po rabacie netto" w widoku oferty).
**Implementacja**: Dodane osobne reguły `.dark .bg-gray-50\/30 { ... }`, `.dark .bg-blue-50\/50 { ... }` itp.

### Audit trail przy reimporcie Konrada — zachowanie historii
**Powód**: Cascade delete na `FloorSummary` → `FloorSummaryItem` → `FloorSummaryItemHistory` kasował historię ręcznych zmian. Po reimporcie wiedza „kto wpisał X i dlaczego" znikała.
**Implementacja**: `commitImport()` przed delete pobiera historię + manualValue/accepted z istniejących itemów, po recreate odtwarza historię z oryginalnymi `createdAt`. Plus nowy wpis `REIMPORT` z poprzednią → nową wartością Konrada.

---

## 2026-05-08

### Maraf vs Konrad — porównanie w m³, nie m²
**Powód**: Wartości się rozjeżdżały o +1563% (Maraf 35.91 m² ścian I piętra vs Konrad 597.32 m²). Maraf `areaM2` to footprint (rzut), Konrad m² to powierzchnia szalunku — różne metryki. Volumes się zgadzają.
**Implementacja**: Konrad m² × grubość (0.18m z xlsx kol „gr") = m³ → porównujemy z Maraf `volumeM3`. Różnica spadła do 2.5%.

### Pełna struktura 6 kondygnacji × 5-7 pozycji
**Powód**: Pierwsza iteracja Konrada importera tworzyła tylko 2 pozycje per kondygnacja (ściany + słupy). User chciał WSZYSTKIE kategorie Marafu (stropy, belki, fundamenty, biegi, szyby, atyki).
**Implementacja**: `lib/przedmiar-konrad-import.ts` → `buildPositionsForFloor()` zwraca per kondygnację 5-7 pozycji z mapowaniem na kategorie Marafu. Pozycje bez detalu Konrada → `MANUAL_NOT_FOUND`, kierownik wpisuje ręcznie.

### Konrad przez UI upload (powtarzalne), Maraf przez git (jednorazowo)
**Powód**: Konrad dostarcza nowy przedmiar co miesiąc (~5 plików w roku), Maraf jest stały. Plus Konrad ma ceny ofertowe — nie powinno być w repo (publiczny GitHub na początku, potem prywatny).
**Implementacja**: Endpoint `POST /api/przeroby/przedmiary/upload` z FormData. UI w `/przeroby/porownanie`. Maraf: `data/przedmiary/maraf.xlsx` + Dockerfile `COPY data /app/data/`.

### `force-dynamic` w (app)/layout
**Powód**: `next build` próbował SSG dla stron robiących Prisma queries → OOM w buildtime Coolify.
**Implementacja**: `export const dynamic = 'force-dynamic'` w `app/(app)/layout.tsx` dziedziczy się na wszystkie podstrony. Plus `NODE_OPTIONS=--max-old-space-size=4096` w builder stage Dockerfile.

### prefetch=false na sidebar links
**Powód**: Intermittent client-side errors („Cannot read properties of undefined") przy nawigacji w menu po deployu. Next.js prefetch'uje strony w tle, czasem mismatch między starym JS w cache a nowym serwerem.
**Implementacja**: `prefetch={false}` na wszystkich `<Link>` w Sidebar. Pierwsza nawigacja nieco wolniejsza, ale bez race condition.

### Reset hasła + force update klienta Prisma
**Powód**: Po dodaniu pól `resetToken` + `resetTokenExpiry` w schema, lokalny TS check pokazywał 8 błędów (Prisma client nie wiedział o nowych polach).
**Implementacja**: `npx prisma generate` regeneruje typy (musi być po każdej zmianie schema). Plus dla produkcji: `npx prisma db push --skip-generate` w Coolify Terminal (projekt nie używa migracji).

### SMTP konfigurowany przez UI, nie env
**Powód**: Wcześniej dwie konfiguracje (env + UI) myliły. User chciał jedno miejsce — Settings page.
**Implementacja**: `lib/mailer.ts` → `getSmtpConfig()` czyta z tabeli `Settings` (klucze: smtpHost, smtpPort, ...) najpierw, env vars jako fallback. Tabela Settings jest key/value, edytowalna w UI.

### Zarządzanie użytkownikami (Settings)
**Implementacja**: Sekcja w Settings — lista userów, dodawanie (z mailem aktywacyjnym 1h), reset hasła, usuwanie (z walidacjami: nie usuwaj siebie, nie usuwaj ostatniego konta). Placeholder password to losowe 32 bytes hex (user musi przejść przez link aktywacyjny — random hash nie do zalogowania).

---

## Konwencje commitów

Krótko, po polsku, prefix modułowy:
- `Oferty: ...`
- `Przeroby: ...`
- `Dashboard: ...`
- `Dark mode: ...`
- `Settings: ...`

Body opisuje **dlaczego**, nie co. Co-Authored-By Claude jeśli pomagał.
