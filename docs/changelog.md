# Changelog — najważniejsze decyzje techniczne

Krótkie wpisy „co i **dlaczego**". Bez listy wszystkich commitów — od tego jest `git log`. Tu tylko **niebanalne** decyzje, które za pół roku ciężko zrozumieć z samego kodu.

---

## 2026-05-12

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
