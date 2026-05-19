# Changelog — najważniejsze decyzje techniczne

Krótkie wpisy „co i **dlaczego**". Bez listy wszystkich commitów — od tego jest `git log`. Tu tylko **niebanalne** decyzje, które za pół roku ciężko zrozumieć z samego kodu.

---

## 2026-05-19

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
