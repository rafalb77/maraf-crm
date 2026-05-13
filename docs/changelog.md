# Changelog — najważniejsze decyzje techniczne

Krótkie wpisy „co i **dlaczego**". Bez listy wszystkich commitów — od tego jest `git log`. Tu tylko **niebanalne** decyzje, które za pół roku ciężko zrozumieć z samego kodu.

---

## 2026-05-13

### Bulk import 59 kart mieszkań PDF (deterministyczne mapowanie)
**Powód**: Maraf dostarczył 59 PDF-ów (karty lokali) w folderach `Pietro 1/`..`Pietro 4/` z nazwami `Nova Staffa_karta lokalu_nr1.pdf`..`nr59.pdf`. Trzeba je hurtem podpiąć do `Unit.floorPlanUrl` żeby były dostępne w `/lokale/<id>`. Ręczne wgrywanie przez UI dla 59 lokali odpada.
**Implementacja**: `scripts/import-floorplans.js`. Najpierw próbowałem **pdf-parse** (wyciągnięcie metrażu i piętra z tekstu PDF) — wynik: 0/59, bo fonty osadzone bez CMap, tekst nieczytelny. Pivot na **deterministyczne mapowanie po nazwach**: folder → numer piętra (`/Pi[ęe]tro\s*(\d+)/`), filename → globalny numer pliku (`/nr(\d+)/`), w bazie `SELECT Unit WHERE type='MIESZKALNY'` + sort numeryczny po końcowym numerze z `unit.number` (`extractTrailingNumber`), N-ty plik → N-ty Unit. **Pułapka**: Prisma `orderBy: { number: 'asc' }` sortuje stringami — `M1, M10, M11, ..., M2, M3` zamiast `M1, M2, M3...`. Na piętrach 2-4 problemu nie było (wszystkie 2-cyfrowe), tylko piętro 1 (mieszane 1-cyfrowe + 2-cyfrowe) miało źle. Fix przez sortowanie w JS: `units.sort((a,b) => extractTrailingNumber(a.number) - extractTrailingNumber(b.number))`. Weryfikacja: filename floor === unit.floor → warning gdy nie pasuje (znaleziono 2 literówki w `Unit.floor` z importu xlsx: `B1.2.M18` floor=3 zamiast 2, `B1.4.M59` floor=5 zamiast 4 — do poprawienia w UI). Pliki kopiowane do `/app/public/uploads/floorplans/<number>-<ts>.pdf` (Coolify persistent volume), `Unit.floorPlanUrl` ustawiane przez `UPDATE`. Tryb `--dry-run` dla preview bez zapisu. **Source** w repo: `data/karty/` (18MB, COPY w Dockerfile) — po imporcie do produkcji można usunąć (`git rm -r data/karty`). Patrz [docs/karty-mieszkan-status.md](karty-mieszkan-status.md).

### Akceptacja Inwestora (`investorApproved`) + ręczne dodawanie pozycji obmiaru
**Powód**: (1) Brakowało finalnej decyzji „Inwestor zatwierdza pozycję do protokołu" — stary mechanizm `accepted` był akceptacją różnicy przez kierownika, nie wystarczał semantycznie do podstawy faktury. (2) Brakowało możliwości dodania pozycji spoza listy `buildPositionsForFloor` (np. „Słupy maszynowni dachu" — element specjalny nieprzewidziany w mapowaniu Maraf↔Konrad).
**Implementacja**:
- Schema: 5 nowych pól w `FloorSummaryItem` — `investorApproved`, `investorApprovedBy/At/Note/Value` (snapshot wartości kierownika w momencie akceptacji). `accepted/At/Note` zostawione w schemie jako DEPRECATED (nie używane w UI, niekasowane żeby nie tracić historii). Nowy `matchMode = 'MANUAL_ADDED'` (komentarz).
- API: PATCH `floor-summaries/items/[id]` — akceptacja tylko dla admina (403 dla innych). Zmiana `konradManualValue` **auto-cofa** akceptację (`INVESTOR_UNAPPROVE` w historii) + ustawia `approvalStale` w UI. POST `floor-summaries/[summaryId]/items` (NOWY) — dodawanie pozycji manualnej. DELETE `items/[id]` — tylko dla `matchMode === 'MANUAL_ADDED'`.
- UI: nowa kolumna „AKCEPTACJA INWESTORA" w tabeli (badge ✓ / ⚠ Nieaktualna / Czeka). Komponent `InvestorApproval` w panelu szczegółów (zielony banner gdy ok, żółty gdy stale, formularz dla admina). Button „➕ Dodaj pozycję" nad tabelą + modal `AddItemModal` (name, unit dropdown, opc. wartości Marafa + kierownika + uzasadnienie). Delete button widoczny tylko dla `MANUAL_ADDED` w panelu szczegółów. Nagłówek tabeli „Pozycja kierownika" → „Pozycja obmiaru".
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
**Powód**: Dla pozycji `MANUAL_NOT_FOUND` (Konrad nie ma detalu w xlsx) kierownik musi wpisać wartość ręcznie — wcześniej UI pozwalał tylko nadpisać Marafa (`manualValue`), co było niespójne semantycznie (kolumna „Kierownik" pokazywała 0,00 a edytowało się Marafa). Plus chcemy audytować duże rozjazdy Konrad↔Maraf — jeśli |Δ| > 5%, kierownik musi napisać „z czego wynika".
**Implementacja**: Schema — dwa nowe pola w `FloorSummaryItem`: `konradManualValue Float?` + `konradManualReason String?`. Endpoint PATCH `/api/przeroby/floor-summaries/items/[id]` przyjmuje nowe pola + auth-aware: contractor (Konrad) ma 403 przy próbie edycji `manualValue` (Maraf). Historia: nowe akcje `SET_KONRAD_VALUE` / `CLEAR_KONRAD_VALUE` w `FloorSummaryItemHistory.action`. Reimport (`lib/przedmiar-konrad-import.ts`) zachowuje oba pola w `PreservedItem`. UI `ComparisonTable` — nowy komponent `KonradEditor` (indigo) z live Δ%, walidacją `reasonMissing` (disable submit), próg `KONRAD_DIFF_THRESHOLD = 0.05`. `refValue()` i `referenceValue()` traktują `konradManualValue` jako pierwszorzędną wartość kierownika (nad `laborQty`/`concreteVol`). `totalReady` zalicza pozycję z `konradManualValue` jako gotową gdy Δ ≤ 5% lub wpisane jest uzasadnienie. **WYMAGANE po deployu**: `prisma db push --skip-generate` w Coolify Terminal (schema zmieniona).

### Rola `CONTRACTOR` — Konrad widzi tylko sekcję Przeroby
**Powód**: Konrad (kierownik podwykonawcy) ma uzupełniać wartości w `/przeroby/porownanie/[floor]` — ale nie powinien widzieć reszty CRM-u (klienci, oferty, sprzedaż, settings). Potrzebny gate per-rola.
**Implementacja**: Hardcoded email w env `NEXT_PUBLIC_CONTRACTOR_EMAIL` (analogicznie do `NEXT_PUBLIC_ADMIN_EMAIL`) — bez zmiany schema, bez `User.role` enum. Funkcja `isContractor()` + biała lista `contractorCanAccess()` w `lib/auth-utils.ts`. **Middleware** `middleware.ts` (server-side, NextAuth JWT) blokuje server-side: redirect na `/przeroby` dla stron, 403 JSON dla API. **Sidebar** (client-side) filtruje sekcje — contractor widzi tylko grupę „Przeroby". **Po zmianie env wymagany REBUILD** (nie tylko restart) — `NEXT_PUBLIC_` jest inline'owane w buildtime, inaczej Sidebar client-side nie zauważy roli.

### Maraf wyznacznikiem także dla pozycji `MANUAL_NOT_FOUND`
**Powód**: W `/przeroby/porownanie/[floor]` kolumna „Maraf (wyznacznik)" była pusta (`—`) dla pozycji typu „Strop nad I piętro", „Belki nad I piętro", „Biegi schodowe" — mimo że xlsx obmiaru Marafa zawiera komplet danych (Stropy nadziemia A=1013,90 m² na Kondygnacji 1 itd.). Bug: kod liczył `autoValue` tylko dla `matchMode === 'AUTO_OK'`, ignorując pozycje `MANUAL_NOT_FOUND` mimo że mają `mappingRule`. Semantyka `MANUAL_NOT_FOUND` to „brak detalu u **Konrada**", nie u Marafa — Maraf jest wyznacznikiem zawsze.
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
**Powód**: Pierwsza iteracja Konrada importera tworzyła tylko 2 pozycje per kondygnacja (ściany + słupy). User chciał WSZYSTKIE kategorie Marafa (stropy, belki, fundamenty, biegi, szyby, atyki).
**Implementacja**: `lib/przedmiar-konrad-import.ts` → `buildPositionsForFloor()` zwraca per kondygnację 5-7 pozycji z mapowaniem na kategorie Marafa. Pozycje bez detalu Konrada → `MANUAL_NOT_FOUND`, kierownik wpisuje ręcznie.

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
