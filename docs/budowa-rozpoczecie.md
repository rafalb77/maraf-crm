# Moduł Budowa (Project Manager) — rozpoczęcie

🟢 **KONCEPCJA ZAAKCEPTOWANA 2026-07-09** — Rafał podjął wszystkie 9 decyzji (sekcja „Decyzje podjęte"). Realizacja rozpoczęta od Etapu 0. Dyskusja założycielska: 2026-07-08 (brief user × Claude). Wersja 2 (2026-07-09) — po adwersaryjnym przeglądzie 4 niezależnych krytyk (zgodność z kodem / anty-przerost dla małej firmy / pokrycie briefu / ryzyko techniczne); istotne zmiany vs v1 wypisane na końcu.

Trzeci filar systemu obok CRM/Sprzedaż i Finansów: zarządzanie inwestycją od strony wykonawczej — harmonogram (Gantt), etapy, zadania, kamienie milowe, wykonawcy, postęp, opóźnienia, raporty z budowy, zdjęcia, odbiory częściowe, problemy/blokery, decyzje + podgląd kosztów per etap/wykonawca.

**Naczelna zasada integracji:** Budowa pokazuje kontekst harmonogramu i decyzji. **Finanse pozostają źródłem prawdy dla faktur, KSeF i płatności** — moduł niczego z finansów nie dubluje, tylko czyta i linkuje. Analogicznie nie dubluje CRM/Sprzedaży ani Przerobów.

**Zasada anty-biurokracji:** każde pole, którego nikt w 4-osobowej firmie nie będzie wypełniał, wycinamy. Lepiej dodać za rok, niż utrzymywać martwy rejestr.

## Użytkownicy i ich widoki (sedno projektu)

| Kto | Rola | Główny widok | Potrzebuje |
|---|---|---|---|
| **Rafał** (rafal.boruch@, admin) | koordynator / PM / decyzje | `/budowa` (dashboard) + `/budowa/harmonogram` (Gantt) | pełny obraz: co się dzieje, co opóźnione, co zagraża terminowi końcowemu, co wymaga decyzji, co zgłosił kierownik, koszty vs założenia |
| **Marta** (biuro@, `finanse`+`budowa`) | faktury, płatności | zostaje w Finansach; `/budowa/koszty` jako most | przypisanie FV do inwestycji/etapu/wykonawcy/(zadania), budżet etapu, status zakresu przed płatnością, filtry, eksport |
| **Tata / Bohdan** (bogdan.boruch@, ~70 lat, mało techniczny, **często w rozjazdach → telefon/tablet**) | prezes, nadzór podwykonawców | **`/budowa/przeglad` — „Widok Prezesa" (mobile-first!)** | duże kafle, zdjęcia, statusy „na czas / opóźnione / wymaga decyzji / do odbioru", przycisk „Do wyjaśnienia", prosta oś czasu |
| **Kierownik budowy** (osoba rotacyjna, permission `checkin`) | obmiary, jakość, raportowanie | **`/checkin` — mobilny raport, cel: 2 minuty** | co zrobiono, postęp, problem?, decyzja?, reakcja wykonawcy?, zdjęcia. **Zero finansów, zero sprzedaży, zero desktopowych widoków** |

## Diagnoza stanu obecnego (co repo już ma, a czego nie)

Zmapowane 2026-07-08/09 (7 audytów kodu + 4 krytyki). Stack faktyczny: Next.js 14.2.35 + React 18.3.1 + Prisma 5.22 + NextAuth (JWT 8h) + Tailwind v4.

**Jest do reużycia:**
- ✅ **Rejestr wykonawców**: `Subcontractor` + `SubContract` (wartości umów, daty, retencja) + `Protocol`/`ProtocolItem` (finansowe rozliczenie robót) — moduł Przeroby. **Nie tworzymy drugiego rejestru.**
- ✅ **Silnik zadań-przypomnień** `lib/tasks.ts` (`Task`, reguły idempotentne po `ruleKey`, reconcile, cron `TASKS_CRON_SECRET`) — Budowa dokłada reguły. **Uwaga:** `reconcileRuleTasks` ma gałęzie tylko dla `PAYMENT_DUE`/`RES_EXPIRE` — nowe reguły wymagają nowych gałęzi + include'ów, inaczej powstaną zadania-zombie (nigdy auto-domykane).
- ✅ **Kompresja zdjęć client-side**: `lib/compress-image.ts` (canvas, jpeg/png/webp). **Świadomie NIE obsługuje HEIC** — i żadna przeglądarka nie zdekoduje HEIC w canvas; patrz „Zdjęcia z telefonu" niżej.
- ✅ **Wzorzec uploadów server-side** `lib/case-uploads.ts` + catch-all `app/uploads/[...path]/route.ts` (MIME jpg/png/webp już serwowane; `.heic` NIE).
- ✅ **Sprawy (`Case`)** jako korespondencja urzędowa budowy (PINB, nadzór) — używać `type=URZEDOWA`.
- ✅ Wzorce: audit-history per rekord, cron-z-sekretem, statusy-stringi + labele w `lib/types.ts`, permission per sekcja.

**Nie istnieje (moduł buduje od zera):**
- ❌ Encja **Inwestycja** — dziś tylko teksty: `Contract.investmentName`, `EscrowAccount.investmentName` i **nieużywane** `PurchaseInvoice.investmentId` (zaczep w schemie od MVP Finansów, wartości NULL).
- ❌ **Harmonogram/Gantt** — żadnego modelu ani widoku (kalendarz to czysty proxy Google Calendar).
- ❌ **Raporty z budowy / zdjęcia z budowy** — infra uploadów jest, modelu brak.
- ❌ **Zadania budowlane z zależnościami** — obecny `Task` to lekkie to-do; zadania harmonogramu to osobna encja (zgodnie z ostrzeżeniem w `docs/zadania-decyzje.md`).
- ❌ **Most Przeroby↔Finanse**: `Subcontractor` (przeroby) i `Vendor` (finanse) bez relacji — Staffa/Banaszczyk istnieją podwójnie. Bez mostka nie ma „nieopłacona FV przy wykonawcy".
- ❌ **Mobile**: aplikacja desktop-first (sidebar fixed 256px, brak breakpointów) — check-in kierownika **i Widok Prezesa** wymagają osobnego lekkiego layoutu.

## Architektura informacji

Nowy **workspace „Budowa"** w sidebarze (obok CRM / Przeroby / Finanse). Nawigacja celowo płytka — 6 pozycji zamiast 10 (uwaga krytyki: jedna aktywna inwestycja nie potrzebuje 10 podstron):

```
/budowa               — dashboard inwestycji (Rafał): KPI, alerty, mini-oś czasu, feed
/budowa/harmonogram   — Gantt (etapy zwijane, zadania, kamienie, zależności, dziś-linia)
                        + przełącznik trybu „Lista" (tabela zadań z filtrami) — jedna strona, dwa widoki
/budowa/dziennik      — dziennik budowy: feed raportów kierownika + zakładka „Galeria"
                        (zdjęcia z filtrami: data / zadanie / etap / wykonawca — etap i wykonawca
                        wyprowadzane Z ZADANIA, nie osobno tagowane)
/budowa/wykonawcy     — wykonawcy Z KONTEKSTEM: zadania, opóźnienia, umowy, protokoły, nieopłacone FV
/budowa/koszty        — most finansowy: FV per etap/wykonawca/(zadanie), budżety etapów,
                        inbox „do przypisania", eksport xlsx
/budowa/przeglad      — WIDOK PREZESA (mobile-first, duże kafle, bez sidebara)
/checkin              — mobilny raport kierownika (osobna route group, bez AppShell)
```

Decyzje i problemy NIE mają osobnych podstron — żyją jako sekcje dashboardu + kafle u prezesa + Taski u Rafała (patrz „Decyzje i problemy"). Przeroby zostają osobnym workspace; Budowa linkuje (wykonawca → jego protokoły).

## Model danych (nowe modele Prisma)

Konwencje repo: `cuid()`, pola po angielsku, statusy jako String z komentarzem + labele/kolory w `lib/types.ts`, `db push` (nie migracje). Prefiks `Construction*`/`Site*` — goła nazwa `Contract` zajęta (umowa sprzedaży), `SubContract` też (umowa podwykonawcza).

**Uwaga fazowa:** listy relacji w `Investment` dochodzą przyrostowo z każdym etapem (w Etapie 0 model bez relacji do jeszcze nieistniejących tabel — inaczej `db push` padnie).

```prisma
// status: PRZYGOTOWANIE | W_BUDOWIE | ODBIORY | ZAKONCZONA
model Investment {
  id             String    @id @default(cuid())
  name           String    @unique            // "Nova Staffa"
  slug           String    @unique            // "nova-staffa"
  address        String?
  status         String    @default("W_BUDOWIE")
  startDate      DateTime?
  plannedEndDate DateTime?                     // termin końcowy — odniesienie dla alertu "zagrożony koniec"
  actualEndDate  DateTime?
  budgetNet      Float?
  notes          String?
  active         Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  // relacje dochodzą przyrostowo per etap:
  // E1: reports SiteReport[]; photos SitePhoto[]; comments ConstructionComment[]
  // E2: stages ConstructionStage[]; tasks ConstructionTask[]
  // E3: invoices PurchaseInvoice[]
}
// UWAGA: istniejący model InvestmentImage (wizualizacje marketingowe, /settings) NIE jest
// i nie będzie relacją do Investment — dopisać taki komentarz w schemie przy obu modelach.

// status: PLANOWANY | W_TOKU | ZAKONCZONY | WSTRZYMANY
model ConstructionStage {
  id           String    @id @default(cuid())
  investmentId String
  name         String                          // "Stan surowy", "Instalacje", "Elewacja"
  order        Int       @default(0)
  status       String    @default("PLANOWANY")
  plannedStart DateTime?
  plannedEnd   DateTime?
  budgetNet    Float?                          // budżet etapu — mianownik alertów kosztowych
  color        String?                         // kolor pasków na Gancie
  notes        String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  investment Investment         @relation(fields: [investmentId], references: [id], onDelete: Cascade)
  tasks      ConstructionTask[]
  invoices   PurchaseInvoice[]                 // E3
  @@unique([investmentId, name])
}

// status: PLANOWANE | W_TOKU | WSTRZYMANE | DO_ODBIORU | ZAKONCZONE | ANULOWANE
// acceptanceResult: PRZYJETY | PRZYJETY_Z_UWAGAMI | ODRZUCONY
model ConstructionTask {
  id              String    @id @default(cuid())
  investmentId    String
  stageId         String?
  name            String
  description     String?
  isMilestone     Boolean   @default(false)    // kamień milowy: plannedStart == plannedEnd
  status          String    @default("PLANOWANE")
  progress        Int       @default(0)        // 0–100; ręcznie lub z check-inów
  plannedStart    DateTime
  plannedEnd      DateTime
  actualStart     DateTime?
  actualEnd       DateTime?
  subcontractorId String?                      // kto robi (rejestr z Przerobów)
  subContractId   String?                      // którą umową rozliczane (→ protokoły)
  delayReason     String?                      // przyczyna opóźnienia
  // ODBIÓR CZĘŚCIOWY — jawny akt, nie tylko status:
  acceptedAt       DateTime?
  acceptedByEmail  String?                     // snapshot (wzorzec AuditLog)
  acceptanceResult String?                     // PRZYJETY | PRZYJETY_Z_UWAGAMI | ODRZUCONY
  acceptanceNote   String?                     // uwagi/usterki z odbioru
  orderIndex      Int       @default(0)
  notes           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  investment    Investment         @relation(fields: [investmentId], references: [id], onDelete: Cascade)
  stage         ConstructionStage? @relation(fields: [stageId], references: [id], onDelete: SetNull)
  subcontractor Subcontractor?     @relation(fields: [subcontractorId], references: [id], onDelete: SetNull)
  subContract   SubContract?       @relation(fields: [subContractId], references: [id], onDelete: SetNull)
  predecessors  TaskDependency[]   @relation("DepSuccessor")
  successors    TaskDependency[]   @relation("DepPredecessor")
  reportUpdates SiteReportTaskUpdate[]
  photos        SitePhoto[]
  comments      ConstructionComment[]
  invoices      PurchaseInvoice[]              // E3
  reminderTasks Task[]                         // E2 (back-relacja zaczepu Task.constructionTaskId)
  @@index([investmentId, status])
  @@index([stageId])
  @@index([subcontractorId])
}
```

Odbiór: przejście `DO_ODBIORU → ZAKONCZONE` (PRZYJETY / PRZYJETY_Z_UWAGAMI) albo `DO_ODBIORU → W_TOKU` (ODRZUCONY, z `acceptanceNote`) — jawna akcja Rafała (przycisk w szczegółach zadania + z kafla dashboardu/prezesa). Powiązanie odbioru z `Protocol` (przeroby) — Etap 4.

```prisma
// type: FS (koniec→początek) — jedyny typ; zależności służą do RYSOWANIA strzałek na Gancie,
// nie do automatycznego przeliczania harmonogramu (patrz "Opóźnienia" niżej)
model TaskDependency {
  id            String @id @default(cuid())
  predecessorId String
  successorId   String
  type          String @default("FS")
  predecessor ConstructionTask @relation("DepPredecessor", fields: [predecessorId], references: [id], onDelete: Cascade)
  successor   ConstructionTask @relation("DepSuccessor", fields: [successorId], references: [id], onDelete: Cascade)
  @@unique([predecessorId, successorId])
}
// POST /api/budowa/dependencies MUSI walidować cykle (prosty DFS po grafie inwestycji) —
// @@unique blokuje tylko duplikat pary, nie cykl A→B→A; cykl = pętla nieskończona w każdym
// przyszłym algorytmie i bałagan na wykresie.

// Check-in kierownika — celowo płaski (2 minuty na telefonie)
model SiteReport {
  id            String   @id @default(cuid())
  investmentId  String
  reportDate    DateTime @default(now())
  authorId      String?
  authorEmail   String?                        // snapshot
  workDone      String                         // "co zrobiono" — krótki tekst
  hasIssue      Boolean  @default(false)       // → reguła BUDOWA_PROBLEM (Task dla Rafała)
  issueNote     String?
  needsDecision Boolean  @default(false)       // → reguła BUDOWA_RAPORT_DECYZJA (Task dla Rafała)
  decisionNote  String?
  needsContractorAction Boolean @default(false) // "wykonawca musi zareagować" → reguła BUDOWA_WYKONAWCA
  contractorActionNote  String?
  contractorActionSubcontractorId String?       // którego wykonawcy dotyczy (skalar, opcjonalny)
  createdAt     DateTime @default(now())
  investment  Investment             @relation(fields: [investmentId], references: [id], onDelete: Cascade)
  author      User?                  @relation("SiteReportAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  taskUpdates SiteReportTaskUpdate[]
  photos      SitePhoto[]
  comments    ConstructionComment[]
  @@index([investmentId, reportDate])
}

// Aktualizacja zadania z check-inu (sekcja pojawia się dopiero, gdy istnieje harmonogram — E2)
model SiteReportTaskUpdate {
  id                 String  @id @default(cuid())
  reportId           String
  taskId             String
  progress           Int?                      // przyciski 25/50/75/100, nie suwak
  readyForAcceptance Boolean @default(false)   // → status zadania DO_ODBIORU
  note               String?                   // wolny tekst: uwaga jakościowa / obmiar / cokolwiek
  report SiteReport       @relation(fields: [reportId], references: [id], onDelete: Cascade)
  task   ConstructionTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  @@index([taskId])
}
// Świadomie BEZ pól measuredQty/measuredUnit/qualityNote — strukturalne obmiary żyją w Przerobach
// (Protocol/FloorSummary); drugie, konkurencyjne źródło obmiarów to prosta droga do sprzeczności.
// Obmiar w check-inie = wolny tekst w note. Jeśli praktyka pokaże potrzebę pól — decyzja nr 9.

model SitePhoto {
  id           String   @id @default(cuid())
  investmentId String
  reportId     String?
  taskId       String?                         // etap i wykonawca WYNIKAJĄ z zadania (join),
                                               // nie ma osobnego tagowania stage/subcontractor
  url          String                          // /uploads/budowa/<investmentId>/<ts>-<safeName>
  caption      String?
  takenAt      DateTime @default(now())
  uploadedById String?                         // skalar bez FK (wzorzec CaseDocument)
  createdAt    DateTime @default(now())
  investment Investment        @relation(fields: [investmentId], references: [id], onDelete: Cascade)
  report     SiteReport?       @relation(fields: [reportId], references: [id], onDelete: SetNull)
  task       ConstructionTask? @relation(fields: [taskId], references: [id], onDelete: SetNull)
  @@index([investmentId, takenAt])
  @@index([taskId])
}

// Komentarze/flagi prezesa. onDelete: SetNull (NIE Cascade) — porządki w harmonogramie
// nie mogą skasować komentarzy taty; komentarz zawsze zostaje przy inwestycji.
model ConstructionComment {
  id                 String    @id @default(cuid())
  investmentId       String
  taskId             String?
  reportId           String?
  photoId            String?
  body               String    @default("")    // może być puste — sama flaga "do wyjaśnienia"
  needsClarification Boolean   @default(false) // → reguła BUDOWA_WYJASNIENIE (Task dla Rafała)
  resolvedAt         DateTime?
  authorId           String?                   // skalar bez FK
  authorEmail        String?
  createdAt          DateTime  @default(now())
  investment Investment        @relation(fields: [investmentId], references: [id], onDelete: Cascade)
  task       ConstructionTask? @relation(fields: [taskId], references: [id], onDelete: SetNull)
  report     SiteReport?       @relation(fields: [reportId], references: [id], onDelete: SetNull)
  photo      SitePhoto?        @relation(fields: [photoId], references: [id], onDelete: SetNull)
  @@index([investmentId, createdAt])
}
```

**Wycięte z v1 (świadomie, po krytyce):** `ConstructionRisk` (korporacyjny rejestr ryzyk — realne problemy wchodzą przez `hasIssue` z check-inu; wrócimy TYLKO jeśli praktyka pokaże potrzebę — decyzja nr 7), `ConstructionDecision` (rejestr decyzji z dueDate/outcome — decyzje sygnalizuje flaga → Task; zapadają telefonicznie), `baselineStart/End` + „Zapisz plan bazowy" (potrzeba z drugiego roku używania; planned vs actual wystarczy), `ConstructionTask.budgetNet` (nikt nie budżetuje 50 zadań osobno), `TaskDependency.lagDays`, `SitePhoto.stageId/subcontractorId` (martwe osie tagowania).

### Zmiany w modelach ISTNIEJĄCYCH (addytywne; komplet back-relacji — bez nich `db push` padnie na P1012)

```prisma
// E1:
model User {
  // ... bez zmian ...
  siteReports SiteReport[] @relation("SiteReportAuthor")
}

// E2 — zaczepy Task jako PEŁNE relacje (wzorzec Task dla encji to relacje z onDelete,
// "skalar bez FK" dotyczy tylko userów) + rozszerzenie reconcileRuleTasks o nowe gałęzie:
model Task {
  // ... bez zmian ...
  investmentId       String?
  constructionTaskId String?
  investment       Investment?       @relation(fields: [investmentId], references: [id], onDelete: Cascade)
  constructionTask  ConstructionTask? @relation(fields: [constructionTaskId], references: [id], onDelete: Cascade)
}
// (+ back-relacje: Investment.reminderTasks Task[], ConstructionTask.reminderTasks Task[])

// E3 — most finansowy:
model Subcontractor {
  // ... bez zmian ...
  vendorId String? @unique      // → Vendor (finanse); ręczne dopasowanie w UI + podpowiedź po NIP
  vendor   Vendor? @relation(fields: [vendorId], references: [id], onDelete: SetNull)
  constructionTasks ConstructionTask[]
}
model Vendor {
  // ... bez zmian ...
  subcontractor Subcontractor?
}
model SubContract {
  // ... bez zmian ...
  constructionTasks ConstructionTask[]
}
model PurchaseInvoice {
  // ... bez zmian; investmentId JUŻ ISTNIEJE jako luźny String? (wartości NULL) ...
  investmentId        String?   // było — teraz z relacją
  constructionStageId String?
  constructionTaskId  String?   // opcjonalne (brief Marty: "…albo zadania"); podstawa = inwestycja+etap
  protocolId          String?   // opcjonalny link FV↔protokół przerobowy (podpowiedź: protokoły
                                // tej samej umowy/wykonawcy) — odpowiada na "status protokołu przy FV"
  investment        Investment?        @relation(fields: [investmentId], references: [id], onDelete: SetNull)
  constructionStage ConstructionStage? @relation(fields: [constructionStageId], references: [id], onDelete: SetNull)
  constructionTask  ConstructionTask?  @relation(fields: [constructionTaskId], references: [id], onDelete: SetNull)
  protocol          Protocol?          @relation(fields: [protocolId], references: [id], onDelete: SetNull)
}
// (+ back-relacja Protocol.invoices PurchaseInvoice[])
```

Procedura `db push` Etapu 3 (FK na żywej tabeli faktur): przed pushem `pg_dump` bazy + zamiast samego `count(*)` sprawdzić sieroty: `SELECT id, "investmentId" FROM "PurchaseInvoice" WHERE "investmentId" IS NOT NULL AND "investmentId" NOT IN (SELECT id FROM "Investment")` (wyczyścić przed założeniem constraintu). `db push` nie jest transakcyjny — robić w oknie, gdy Marta nie pracuje.

## Decyzje i problemy — bez rejestrów, na Taskach

Zamiast dwóch nowych rejestrów (decyzje, ryzyka) — istniejące centrum zadań + flagi:

- Kierownik: „potrzebna decyzja Rafała" → `ruleKey BUDOWA_RAPORT_DECYZJA:<reportId>` → Task.
- Kierownik: „problem na budowie" → `BUDOWA_PROBLEM:<reportId>` → Task.
- Kierownik: „wykonawca musi zareagować" → `BUDOWA_WYKONAWCA:<reportId>` → Task + badge na karcie wykonawcy.
- Tata: „Do wyjaśnienia" → `BUDOWA_WYJASNIENIE:<commentId>` → Task.
- System: `BUDOWA_OPOZNIENIE:<taskId>:<tydzień>` (raz na tydzień, nie spam), `BUDOWA_ODBIOR:<taskId>` (DO_ODBIORU czeka >3 dni; auto-domknięcie po odbiorze), `BUDOWA_UMOWA_KONIEC:<subContractId>` (endDate <14 dni, zadania niedokończone).

Kafelek „decyzje czekają" (dashboard, Widok Prezesa) = otwarte Taski po prefiksach `BUDOWA_RAPORT_DECYZJA`/`BUDOWA_WYJASNIENIE`. **Wymóg techniczny:** rozszerzyć `reconcileRuleTasks` w `lib/tasks.ts` o gałęzie nowych prefiksów (+ include nowych relacji) — inaczej Taski nigdy się nie auto-domkną; prefiksy rozdzielone per typ źródła (żaden prefiks nie miesza dwóch typów id).

## Integracja z Finansami (most, nie duplikat)

| Zasada z briefu | Realizacja |
|---|---|
| FV widoczna jako koszt przy wykonawcy/etapie/zadaniu | `PurchaseInvoice.investmentId/StageId/TaskId` + mostek `Subcontractor.vendorId`. `/budowa/koszty` i karta wykonawcy **czytają** faktury z Finansów |
| FV nieopłacona → ostrzeżenie przy wykonawcy/etapie | computed: `dueDate < today` **i** `status NOT IN (OPLACONA, ANULOWANA, ODRZUCONA)`; CZESCIOWO_OPLACONA po saldzie płatności (wzorzec `lib/finanse-stats.ts`) → badge 🔴 |
| Umowa/protokoły > budżet etapu → alert | computed: **wyłącznie** `Σ FV netto przypisanych do etapu` vs `ConstructionStage.budgetNet` (progi 90% ⚠️ / 100% 🔴). Wartości umów (`SubContract.agreedValueNet`) porównujemy TYLKO na poziomie inwestycji/wykonawcy z deduplikacją po `subContractId` — umowa obejmuje wiele etapów i nie ma danych do alokacji per etap (dublowałaby się w mianownikach) |
| Zadanie ZAKONCZONE bez protokołu/FV → „do sprawdzenia" | computed: zadanie z `subContractId`, status ZAKONCZONE, brak protokołu umowy ze `status IN (ZATWIERDZONY, ZAFAKTUROWANY)` i `periodTo ≥ actualEnd` zadania **lub** brak przypisanej FV → kafelek „Do sprawdzenia". (Granulacja per-umowa, nie per-zadanie — świadome przybliżenie, patrz Pułapki) |
| **Kierunek Marty**: „czy mogę bezpiecznie zapłacić tę FV?" | blok „Budowa" przy FV + wiersz w `/budowa/koszty` pokazują **status zakresu**: ✅ zadanie zakończone/odebrane · ⚠️ w toku · ➖ brak przypisania · 📄 protokół podpięty (`protocolId`) |
| FV istnieje w Finansach → nie tworzymy drugiej | Budowa **nie ma** formularza faktury. Jedyny zapis = przypisanie (FK) — w szczegółach FV (Finanse) albo hurtowo w `/budowa/koszty` |

**Multi-firma:** widoki Budowy **ignorują** cookie `finanse_company` — koszty inwestycji sumują OBIE firmy (MARAF + MARAF_DEVELOPMENT) z badge'em firmy przy każdej FV. Inaczej sumy zależałyby od tego, w której firmie Marta ostatnio pracowała.

**`/budowa/koszty` — specyfikacja filtrów** (komplet z briefu Marty): inwestycja / wykonawca / etap / **status płatności** / zakres dat + sumy przy aktywnym filtrze + eksport xlsx. Dwa inboxy: „FV do przypisania" (przypisana firma-budowa, brak etapu) i „FV od dostawcy bez powiązanego wykonawcy" (przypisana do budowy, ale `Vendor` niezmostkowany → podpowiedź „zmostkuj w karcie podwykonawcy").

**Kontrakt wydajnościowy:** `lib/budowa-alerts.ts` = czyste funkcje bez `prisma` w środku; dane ładuje JEDNA funkcja `loadBudowaAlertData(investmentId)` o stałej liczbie zapytań (zadania+zależności jedną listą, `groupBy` FV po vendorId, jedna lista protokołów). Reuse przez dashboard, kartę wykonawcy, Widok Prezesa i cron — bez N+1.

## Opóźnienia i zagrożenie terminu (świadomie bez własnego CPM)

- **Zadanie opóźnione** = `plannedEnd < today` i status ∉ {ZAKONCZONE, ANULOWANE} (+ `delayDays`).
- **Zagrożony termin końcowy** = opóźniony kamień milowy **lub** `max(plannedEnd)` otwartych zadań > `Investment.plannedEndDate`. Prosta, uczciwa heurystyka.
- **Czego celowo NIE robimy w MVP:** longest-path/critical-path po grafie zależności. Algorytm jest poprawny tylko przy kompletnym, pielęgnowanym grafie — a Rafał, wpisując pierwszy harmonogram w życiu firmy, narysuje zależności szczątkowo; brak krawędzi = brak flagi = fałszywy spokój. `TaskDependency` służy do rysowania strzałek. Mini-CPM (~50 linii, z detekcją cykli i propagacją prognozy) — Etap 4, wdrażany dopiero gdy `count(TaskDependency)` pokaże realne użycie zależności.
- **Status wykonawcy 🟢/🟡/🔴** (karty, Widok Prezesa): 🔴 = ma zadanie opóźnione; 🟡 = zadanie kończy się w ≤7 dni z postępem <50% **lub** nierozwiązany problem (`hasIssue`) na jego zadaniu; 🟢 = reszta.

## Gantt — wybór biblioteki (research 2026-07)

Przebadane: SVAR React Gantt, DHTMLX, Frappe Gantt, gantt-task-react (+forki), vis-timeline, react-calendar-timeline, planby, mermaid, Bryntum, Kibo UI.

**Rekomendacja: `@svar-ui/react-gantt` (SVAR React Gantt, MIT)** — jedyna aktywnie utrzymywana (release 2026-06), natywnie reactowa, darmowa biblioteka z kompletem: zależności FS z rysowaniem, progress %, kamienie milowe, **zwijalne etapy (summary tasks)**, drag move/resize, zoom dzień/tydzień/miesiąc, markery (linia „dziś"), readonly mode, lokalizacja (polski = prosty JSON). Wymaga React ≥18 — repo ma 18.3.1 ✅.

- **Czego nie ma w MIT:** baseline, critical path, auto-scheduling — żadnego z nich nie używamy w MVP (patrz wyżej), więc wersja darmowa wystarcza. Gdyby kiedyś zabrakło: SVAR PRO $749 jednorazowo.
- **Fallback:** `dhtmlx-gantt` Standard v10 (MIT od v10) — dojrzalszy, lepszy touch, wbudowany polski; koszt: imperatywne API + cięższy bundle.
- **Spike (pierwszy krok etapu Gantta, 1 dzień, go/no-go)** — twarde kryteria zaliczenia: 20 zadań + 2 etapy + zależności + drag działa; **przełączenie dark/light runtime bez remountu** (repo przełącza klasą `.dark` — GanttView musi nasłuchiwać np. MutationObserverem i przełączać motyw SVAR w locie); import CSS SVAR w App Routerze bez konfliktu z Tailwind v4 preflight; readonly mode; mapowanie motywu (złoty akcent) przez zmienne `--wx-*`. Cokolwiek zgrzyta → DHTMLX, zanim wsiąkniemy.

Implementacja: `components/budowa/GanttView.tsx` (`'use client'` + `next/dynamic` `ssr:false` — bundle tylko na `/budowa/harmonogram`), adapter ConstructionTask↔SVAR, zapis po drag `PATCH /api/budowa/tasks/[id]`, zoom w localStorage.

## Widok Prezesa (`/budowa/przeglad`) — mobile-first

**Wymóg twardy:** działa na telefonie taty. Strona żyje w route group **`(mobile)`** (własny layout bez sidebara, duża typografia, session-check + `force-dynamic` własne) — tak samo jak `/checkin`. Na desktopie ten sam widok po prostu jest szerszy. Kryterium odbioru Etapu 1: „tata otwiera z telefonu w trasie i wszystko widzi".

Sekcje od góry:

1. **Pasek statusu** — jedna linia XL: „Nova Staffa — 62% • na czas" / „🔴 14 dni opóźnienia".
2. **Kafle alertów** (tylko gdy są): „⚠️ 2 zadania opóźnione", „🟡 1 decyzja czeka", „📋 1 odbiór do zrobienia" — klik = prosta lista.
3. **Ostatnie zdjęcia** — duża siatka, pełny ekran po kliku, podpis „co i kto"; przy zdjęciu przycisk **„Do wyjaśnienia"** (+ opcjonalne krótkie pole tekstowe) → Task dla Rafała.
4. **Wykonawcy na budowie** — karty: nazwa, co robi, 🟢/🟡/🔴 (reguła wyżej) + dyskretna flaga „nieopłacona FV" (tata historycznie akceptował płatności — to dla niego naturalna informacja).
5. **Prosta oś czasu etapów** — własny lekki komponent (poziome paski + znacznik „dziś"), **nie** Gantt.
6. **Raporty kierownika** — ostatni w całości + lista 5–7 poprzednich (data + pierwsze zdanie), klik = pełny raport w tym samym dużym stylu; przy raporcie przycisk „Do wyjaśnienia".

Zero edycji danych. Interakcje = czytanie + „Do wyjaśnienia" + jedno ogólne pole „Napisz do Rafała" na dole (bez sześciu pól komentarzy — 70-latek i tak zadzwoni; flagi mają być szybsze niż telefon, nie wolniejsze).

Wejście: w `/profil` przełącznik „Domyślny widok Budowy: pełny / uproszczony" — tata po kliknięciu „Budowa" ląduje na `/budowa/przeglad`.

## Kierownik budowy — mobilny check-in (`/checkin`)

Osobna route group `app/(mobile)/` (layout bez AppShell, session-check, własny `force-dynamic`). Kierownik dostaje link/ikonę na ekran główny — **manifest PWA jest częścią tego etapu, nie nice-to-have** (ikona na home screen = połowa adopcji).

**Sesja (decyzja nr 3):** kierownik ma **własne imienne konto** (e-mail+hasło). JWT 8h zabiłoby adopcję (logowanie hasłem codziennie na budowie), więc konta z samym permission `checkin` dostają **wydłużoną sesję 30 dni** (per-konto `maxAge` w callbacku JWT; ekspozycja minimalna — konto nie widzi kwot, CRM ani finansów). Strona logowania musi być używalna na telefonie (dziś desktop-first — poprawka w zakresie etapu). Szkic formularza trzymany w localStorage — wygaśnięcie sesji w połowie pisania NIE traci treści.

Formularz — jedna pionowa strona:

1. **Co zrobiono dziś?** (textarea, 1–3 zdania)
2. **Zadania** *(sekcja istnieje dopiero od etapu harmonogramu)* — zadania W_TOKU/DO_ODBIORU aktywnej inwestycji, sortowane po `plannedEnd`, max 7 (reszta pod „pokaż wszystkie"); per zadanie: tap „pracowano dziś" → przyciski postępu **25/50/75/100** (nie suwak), przełącznik „gotowe do odbioru", opcjonalna notatka (uwaga jakościowa / obmiar tekstem)
3. **Problem?** (przełącznik → pole tekstowe + przyczyna opóźnienia jeśli dotyczy)
4. **Potrzebna decyzja Rafała?** (przełącznik → pole)
5. **Wykonawca musi zareagować?** (przełącznik → pole + wybór wykonawcy)
6. **Zdjęcia** — patrz pipeline niżej; tapnięciem można przypiąć zdjęcie do zadania
7. **Wyślij**

**Pipeline wysyłki (odporny na słaby LTE — warunek adopcji):** tekst raportu idzie **pierwszy, osobnym szybkim requestem** → natychmiast zielone potwierdzenie; zdjęcia dosyłane **pojedynczo** w tle z paskiem postępu i retry; padnięte zdjęcie NIE unieważnia raportu (można doładować później z listy „niedosłane").

**Zdjęcia z telefonu — fakty i decyzje:** `lib/compress-image.ts` kompresuje jpeg/png/webp canvasem, ale **jawnie pomija HEIC** i żadna przeglądarka nie zdekoduje HEIC w canvas (fałszywa teza v1 — poprawiona). Rozwiązanie: `<input accept="image/jpeg,image/png" capture="environment">` — iOS Safari przy takim accept **sam transkoduje** HEIC→JPEG przy wyborze z rolki, a zdjęcia z `capture` i tak przychodzą jako JPEG; walidacja uploadu **odrzuca** `image/heic` jako backstop (z komunikatem PL); `heic2any` (WASM ~1 MB) tylko jako opcjonalny przyszły fallback. Po stronie klienta kompresja `compressImage` przed wysyłką (12MP+ → rozsądny rozmiar), limit 25 MB, katalog `public/uploads/budowa/<investmentId>/`.

**Dostępy:** osobne **zwykłe** permission **`checkin`** („Budowa — raport kierownika") mapowane TYLKO na `/checkin` + `/api/budowa/checkin`. Kierownik = samo `checkin` — nie widzi żadnej desktopowej trasy `/budowa`, więc **nie potrzebujemy** sub-permission `budowa.koszty`, nowego UI sub-permissions ani warunkowego ukrywania kwot (cała rodzina widzi kwoty — v1 miała tu przerost). Rotacja kierownika = nowe konto + dezaktywacja starego (procedura w `/settings`).

## Dashboard Rafała (`/budowa`)

- **Nagłówek**: inwestycja, % postępu (prosta średnia % zadań — decyzja nr 5), dni do `plannedEndDate`, na-czas/opóźnienie.
- **Alerty** (z `lib/budowa-alerts.ts`, w kolejności): zagrożony termin końcowy → zadania opóźnione → decyzje czekają (Taski `BUDOWA_RAPORT_DECYZJA`/`BUDOWA_WYJASNIENIE`) → problemy z budowy nierozwiązane (`BUDOWA_PROBLEM`) → odbiory czekające → budżety etapów >90% → „do sprawdzenia" (zakończone bez rozliczenia) → nieopłacone FV wykonawców.
- **Najbliższe kamienie milowe** (3 + dni).
- **Feed**: ostatnie raporty kierownika + flagi taty („do wyjaśnienia" na górze).
- **Mini-oś czasu etapów** (ten sam komponent co u prezesa) + link do Gantta.

## Dostępy (permissions) — komplet zmian

`lib/permissions.ts`:
- `ALL_PERMISSIONS` += **`budowa`**, **`checkin`**; `PERMISSION_LABELS` += „Budowa", „Budowa — raport kierownika".
- `getRequiredPermission()`: `/budowa*`, `/api/budowa*` → `budowa`; `/checkin`, `/api/budowa/checkin*` → `checkin`.
- **`PREFERRED_LANDING_ORDER` += `budowa` i `checkin`** — bez tego user z samym `budowa`/`checkin` po zalogowaniu dostaje `/auth/signin?error=NoAccess` (pułapka z `app/page.tsx` → `getFirstAvailableUrl`). Dla `checkin` lądowanie = `/checkin` (special-case w `getFirstAvailableUrl` — funkcja buduje URL jako `/${permission}`, tu akurat się zgadza).
- Przydział: Rafał = admin; Marta = `finanse`+`budowa` (+dotychczasowe); Tata = `budowa` (+dotychczasowe, domyślny widok uproszczony); Kierownik = **tylko `checkin`**.
- Pułapka: permissions są snapshotem w JWT — po nadaniu wymagany re-login (max 8h).

## Fazowanie (komunikacja przed Ganttem — patrz decyzja nr 1)

**Etap 0 — Fundament** — ✅ **WDROŻONY NA PRODUKCJI 2026-07-09** (commit `dbb4891`): `Investment` + seed „Nova Staffa" (na prod przez `node -e` w Coolify Terminal) + permissions `budowa`/`checkin` + `PREFERRED_LANDING_ORDER` + workspace „Budowa" + szkielet dashboardu `/budowa`. Zweryfikowany e2e (test-user z samym `budowa` → login → ląduje na `/budowa`, sidebar odfiltrowany). Pozostało operacyjnie: nadanie uprawnień Marcie/tacie w `/settings`.

**Etap 1 — Komunikacja z budowy** — ✅ **ZAIMPLEMENTOWANY 2026-07-09** (zweryfikowany e2e lokalnie: check-in z flagami + zdjęciem → Taski + dziennik + Widok Prezesa na 375px; czeka na deploy): `SiteReport` + `SitePhoto` + `ConstructionComment` + route group `(mobile)` + **`/checkin`** (co zrobiono / problem / decyzja / reakcja wykonawcy / zdjęcia; szkic w localStorage; tekst osobno, zdjęcia pojedynczo z retry) + pipeline zdjęć (accept jpeg/png, kompresja `lib/compress-image.ts`, HEIC odrzucany z komunikatem, `public/uploads/budowa/`) + PWA manifest + sesja 30 dni dla kont checkin-only (globalny maxAge 30d + egzekwowanie 8h/30d w middleware po `token.authAt`) + `/budowa/dziennik` (feed+galeria) + **Widok Prezesa** `/budowa/przeglad` (mobile-first) + reguły `BUDOWA_PROBLEM`/`BUDOWA_RAPORT_DECYZJA`/`BUDOWA_WYKONAWCA`/`BUDOWA_WYJASNIENIE` (event-driven w `lib/budowa-tasks.ts`; WYJASNIENIE auto-domykane przy resolve) + alerty i feed na pulpicie `/budowa`. **Pozostało z zakresu E1**: konto kierownika (operacyjnie w /settings), przełącznik domyślnego widoku w `/profil` (tata → przeglad; obejście: link w sidebarze), audyt mobilny strony logowania.

**Etap 2 — Harmonogram** (2–3 sesje): `ConstructionStage/Task/TaskDependency` + CRUD + **spike SVAR (1 dzień, twarde kryteria, go/no-go → DHTMLX)** + Gantt + tryb „Lista" + walidacja cykli + alerty opóźnień + heurystyka „zagrożony termin" + **flow odbiorów** (DO_ODBIORU → akt odbioru z wynikiem) + sekcja zadań w check-inie (`SiteReportTaskUpdate`) + zaczepy `Task.investmentId/constructionTaskId` + reguły `BUDOWA_OPOZNIENIE`/`BUDOWA_ODBIOR`/`BUDOWA_UMOWA_KONIEC` + **importer harmonogramu z Excela** (decyzja nr 6: plik istnieje; wzorzec preview/commit; Rafał dostarczy plik na start etapu; mapowanie kolumn do ustalenia po obejrzeniu pliku) + edycja ręczna w UI.

**Etap 3 — Most finansowy** (1–2 sesje): mostek `Subcontractor.vendorId` (UI + podpowiedź po NIP) + FK na `PurchaseInvoice` (procedura: pg_dump + sieroty) + blok „Budowa" przy FV + `/budowa/koszty` (filtry: inwestycja/wykonawca/etap/status płatności/daty; 2 inboxy; badge statusu zakresu; eksport xlsx) + budżety etapów + alerty kosztowe + karta wykonawcy z FV/protokołami + multi-firma (obie firmy + badge).

**Etap 4 — Dojrzałość**: dwa punkty POTWIERDZONE decyzjami Rafała: **digest mailowy raz w tygodniu do wszystkich** (wzorzec `reservations/expiring-email` + `BUDOWA_CRON_SECRET`, Coolify scheduled task raz w tygodniu; treść: postęp tygodnia, raporty, alerty, zdjęcia-linki) oraz **mały rejestr ryzyk** — model minimalny: `ConstructionRisk` (investmentId, taskId?, title, severity NISKIE|SREDNIE|WYSOKIE, status OTWARTE|ZAMKNIETE, note, createdAt/updatedAt), karta na dashboardzie + w Widoku Prezesa, **bez osobnej podstrony**; szybka konwersja problemu z check-inu → ryzyko jednym klikiem. Pozostałe tylko na realne żądanie: mini-CPM (gdy zależności używane), odbiory↔`Protocol`, AI-podsumowanie tygodnia (wzorzec `lib/ad-copy.ts`), rejestr decyzji (jeśli Taski nie wystarczą), heic2any, strukturalne obmiary w check-inie.

Kolejność 1↔2 można odwrócić, jeśli Rafał woli najpierw Gantt (brief nazywa go sercem modułu) — etapy są niezależne; rekomendacja: komunikacja first (szybsza wartość, mniejsze ryzyko techniczne na start).

## Pułapki i decyzje techniczne

- **Nazewnictwo**: `Contract`/`SubContract` zajęte; nowe modele `Construction*`/`Site*`. **`InvestmentImage` NIE jest relacją do `Investment`** (marketing/Settings) — komentarz w schemie przy obu modelach, żeby nie wyglądało na rodzica-dziecko.
- **Statusy**: string + komentarz w schemie + `BUDOWA_*_LABELS/COLORS` w `lib/types.ts`. Statusy protokołów to stringi bez porządku — zawsze jawne zbiory (`IN (ZATWIERDZONY, ZAFAKTUROWANY)`), nigdy „≥".
- **Multi-inwestycja od dnia 1 w modelu**, UI pod jedną aktywną (selektor ukryty, dopóki jedna; „2/3 inwestycji równolegle" to realny plan wg `docs/finanse-decyzje.md`).
- **„Do sprawdzenia" ma granulację per-umowa** (protokół dotyczy `SubContract`, nie zadania) — możliwe false-negative, gdy protokół za inne zadanie tej samej umowy „zaliczy" okres; świadome przybliżenie, doprecyzujemy po praktyce.
- **Bez Radix/toastów**: modale własne, feedback inline, `window.confirm` — jak reszta repo.
- **`force-dynamic`**: `(app)` dziedziczy; nowa grupa `(mobile)` musi mieć własny layout z session-checkiem i własnym `force-dynamic`.
- **Kwoty Float** — konwencja repo; sumy jak w `lib/finanse-stats.ts`.
- **Nie ruszać**: reimportu Konrada (przeroby), `Task`-centrum poza addytywnymi zmianami, dashboardu CRM, `lucide-react@1.9.0`.
- ⚠️ **Przeroby do rewizji (Rafał, 2026-07-09): „do poprawienia albo usunięcia — nie odpowiadają mi".** Budowa zależy od Przerobów WYŁĄCZNIE przez modele danych `Subcontractor`/`SubContract`/`Protocol` (rejestr wykonawców, umowy, protokoły) — te encje przetrwają dowolną przebudowę UI Przerobów i mają zostać zachowane nawet przy usunięciu workspace'u Przeroby. Gdyby przebudowa sięgała modeli — najpierw sprawdzić zależności Budowy (FK z `ConstructionTask`, alerty protokolarne, karta wykonawcy). Kierunek przebudowy Przerobów = osobna rozmowa z Rafałem, nie zaczynać przy okazji.
- Deploy: push na `main` → Coolify webhook; schema → `node node_modules/prisma/build/index.js db push --skip-generate` w Coolify Terminal.

## Decyzje podjęte (Rafał, 2026-07-09)

1. ✅ **Kolejność etapów**: „jak uważasz" → **komunikacja przed Ganttem** (rekomendacja przyjęta): E1 = check-in + dziennik + Widok Prezesa, E2 = harmonogram/Gantt.
2. ✅ **Gantt**: „wybierz najlepszą, najbardziej innowacyjną i niezawodną" → **SVAR React Gantt (MIT)** ze spikiem 1-dniowym i fallbackiem DHTMLX Standard (uzasadnienie w sekcji Gantt).
3. ✅ **Logowanie kierownika**: **własne dane do logowania** (imienne konto e-mail+hasło, bez magic-linków) + wydłużona sesja 30 dni dla kont z samym `checkin`.
4. ✅ **Koszty**: przypisywanie FV **z podziałem na inwestycję i etap** jako podstawa; FK do zadania zostaje jako opcja.
5. ✅ **% postępu inwestycji**: **prosta średnia** % zadań.
6. ✅ **Harmonogram startowy**: **istnieje Excel** → Etap 2 zawiera importer xlsx (wzorzec preview/commit jak `lib/units-import.ts`); Rafał dostarczy plik przy starcie etapu.
7. ✅ **Ryzyka**: **mały rejestr ryzyk** w Etapie 4 (model minimalny — patrz Etap 4).
8. ✅ **Digest mailowy**: **raz w tygodniu, do wszystkich** (Rafał, Marta, Bohdan; kierownik do decyzji przy wdrożeniu) — potwierdzony, realizacja w Etapie 4 (treść ma sens po harmonogramie i alertach).
9. ✅ **Obmiar w check-inie**: **wolny tekst** w notatce (rekomendacja przyjęta). ⚠️ Przy okazji ważny sygnał: **moduł Przeroby jest „do poprawienia albo usunięcia — nie odpowiada Rafałowi"** — patrz Pułapki.

## Zmiany v1 → v2 (po przeglądzie adwersaryjnym 2026-07-09)

4 niezależne krytyki (49 uwag: 5 blokerów, 21 major). Najważniejsze wcielone:
- **Widok Prezesa przeniesiony do layoutu mobilnego** (tata „często w rozjazdach" — desktop-only AppShell był wewnętrzną sprzecznością v1).
- **Sesja kierownika**: jawne rozwiązanie 8h-JWT (30 dni / magic-link) + mobilne logowanie + szkic w localStorage; PWA z nice-to-have → obowiązkowe.
- **Fazowanie odwrócone**: komunikacja (E1) przed Ganttem (E2) — wartość dla 3/4 użytkowników w tydzień.
- **Wycięte przerosty**: rejestr ryzyk, rejestr decyzji, baseline, budżet per zadanie, lagDays, tagowanie zdjęć po etapie/wykonawcy, sub-permission `budowa.koszty` + UI sub-permissions (zastąpione osobnym permission `checkin`), 4 podstrony nawigacji.
- **Dodane luki z briefu**: akt odbioru częściowego (wynik+data+kto), flaga „reakcja wykonawcy", kierunek Marty „czy mogę zapłacić" (badge statusu zakresu + opcjonalny `protocolId`), reguła dla `hasIssue`, historia raportów u prezesa, komplet filtrów kosztów, logika 🟢/🟡/🔴.
- **Poprawki techniczne**: komplet back-relacji Prisma (v1 nie przeszłaby `db push`), `PREFERRED_LANDING_ORDER` (v1: kierownik dostawał „NoAccess" po zalogowaniu), prawda o HEIC (v1 powoływała się na nieistniejącą konwersję), definicja „nieopłaconej FV" bez ANULOWANA/ODRZUCONA, dedup umów w alertach budżetowych, multi-firma, rozszerzenie `reconcileRuleTasks`, walidacja cykli zależności, wycofanie własnego CPM z MVP, kontrakt anty-N+1 dla alertów, procedura pg_dump+sieroty przy FK, twarde kryteria spike'a SVAR (dark mode runtime, Tailwind preflight).
