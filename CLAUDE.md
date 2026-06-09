# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dokumentacja per moduł

Zanim zaczniesz pracę nad konkretnym modułem — przeczytaj odpowiedni plik. Tam są **decyzje projektowe**, mapowania danych, pułapki i otwarte sprawy. Pliki:

- **`docs/architektura.md`** — **🦴 SZKIELET SYSTEMU**: stack (Next.js 14 / Prisma / PostgreSQL / NextAuth / Tailwind v4), struktura katalogów, route groups, mapa ~40 modeli Prisma pogrupowana po domenach, auth+permissions flow, **wzorce wielokrotnego użytku** (import xlsx, uploads, audit, rate limit, SMTP, PDF, DOCX, dark mode), mapa modułów, opis każdego helpera w `lib/`, **przepis „jak dodać nowy moduł"**, pułapki krytyczne. Pierwszy plik do przeczytania w nowej sesji która dotyka fundamentów / dodaje moduł.
- **`docs/system-core.md`** — **🔥 KRĘGOSŁUP SYSTEMU**: architektura (Coolify+OVH+Docker prostym językiem), stan bezpieczeństwa po pakiecie z 2026-05-15 (security headers, rate limit, audit log, sesja 8h), **checklist przed wprowadzeniem prawdziwych danych klientów**, backup w OVH Object Storage, faza 2 (2FA, szyfrowanie PESEL, DSR). Pierwszy plik do przeczytania w nowej sesji która dotyczy infrastruktury/bezpieczeństwa.
- **`docs/przeroby-decyzje.md`** — moduł Przeroby (porównanie Maraf vs Konrad, mapowania kondygnacji, idempotencja reimportu)
- **`docs/oferty-decyzje.md`** — kalkulator ofert, rabat brutto/netto, druk PDF, wysyłka mailem
- **`docs/dashboard-decyzje.md`** — TopWidget (powitanie/news/pogoda), RSS, Open-Meteo
- **`docs/sprzedaz-decyzje.md`** — moduł Sprzedaż (umowy rezerwacyjne, generowanie DOCX, konwersja z oferty). Stan obecny + plan na podpisywanie umów (4 warianty MVP) + 10 kierunków rozwoju generatora.
- **`docs/lokale-decyzje.md`** — moduł Lokale (CRUD, import xlsx, statusy, rezerwacje). Stan obecny + 10 kierunków rozwoju (bulk ops, wizualizacja, historia, floor plan, integracje).
- **`docs/statystyki-decyzje.md`** — moduł Statystyki (`/statystyki`, workspace CRM). 10 widoków: lejek+konwersja, ROI źródeł leadów, tempo sprzedaży, momentum, cykl sprzedaży, czas do sprzedaży, leady do odgrzania, prognoza pipeline, puls aktywności, heatmapa. **Tabela „co napędza każdy widok"** (które modele/pola → który stat) + **pułapki importu lokali** (przełącznik sync statusu domyślnie OFF!) + parametry do strojenia + otwarte (wykres cen czeka na `PriceHistory`, rankingi per-handlowiec wymagają `ownerId`).
- **`docs/finanse-decyzje.md`** — moduł Finanse. Multi-firma (Maraf + Maraf Development) jako pełna separacja przez cookie. Faktury kosztowe + przychodowe + CIT/VAT (orientacyjne) + kaucje gwarancyjne. Importer xlsx, klient KSeF API 2.0 (read-only) z auto-sync, cross-company Maraf↔MD. Sortowane/filtrowalne listy z folderami głównymi (Staffa/Promatbud/Bauter/Stałe/Inne/Pozostali). **Workflow uproszczony** (Marta sama zatwierdza, brak osobnej fazy „do zatwierdzenia"). Saldeo zostaje dla księgowości — CRM tylko READ z KSeF.
- **`docs/meta-ads-decyzje.md`** — integracja Meta (Facebook + Instagram) Ads. Roadmap MVP #1-5 (generator kreacji → push do Mety → Conversions API → dashboard → reguły optymalizacji). Wyjaśnia dlaczego nie MCP. Pułapki App Review, Special Ad Category Housing.
- **`docs/changelog.md`** — dziennik niebanalnych decyzji technicznych z datami („dlaczego coś jest tak a nie inaczej")
- **`docs/infrastruktura.md`** — panele administracyjne, URL-e (Coolify, OVH, GitHub), SMTP, awaryjne ścieżki resetu hasła. **Patrz tu gdy user pyta „jak zalogować się do Coolify" lub o inne kwestie operacyjne.**

### Otwarte sprawy (do dokończenia)

- **`docs/finanse-rozpoczecie.md`** — **🟢 ZAMKNIĘTE 2026-05-31** (zostaje plik z historią decyzji i feedbackiem Marty). Moduł Finanse wdrożony — patrz `docs/finanse-decyzje.md` w głównej liście modułów. **Plus `docs/finanse-ksef-rozpoczecie.md`** — research integracji KSeF (już zaimplementowane w klient + auto-sync; pierwsze realne syncy mogą wymagać iteracji).
- **`docs/finanse-finansowanie-etap2-rozpoczecie.md`** — 🟢 **ZAMKNIĘTE 2026-06-05** (zostaje plik z historią decyzji): ETAP 2 modułu Finansowanie — harmonogram wpłat nabywcy w module Sprzedaż (`ContractPayment`, statusy PLANOWANA/OPŁACONA) + auto-tworzenie `EscrowDeposit` przy odhaczeniu wpłaty (tylko umowa deweloperska, auto-wybór konta gdy 1 / dropdown gdy >1). Etap 1 (kredyty + escrow OMRP + zwroty VAT, cashflow gotówkowy + DSCR) wdrożony 2026-06-03 commit `334a0f6`. Oba etapy — patrz `docs/finanse-decyzje.md`. **WYMAGA na produkcji `prisma db push`** (etap 1: 7 tabel Loan/LoanTranche/LoanRepayment/VatRefund/EscrowAccount/EscrowDeposit/EscrowRelease; etap 2: tabela `ContractPayment` + 2 kolumny na `EscrowDeposit`).
- **`docs/integracja-3destate-rozpoczecie.md`** — 🟡 **PRIORYTET WYSOKI** (przed odpaleniem systemu). Integracja po API z matrycą 3D Estate (`novastaffa.pl/mieszkania`) — ceny i statusy lokali. Stan 2026-05-19: ✅ MVP endpoint wdrożony (model PULL, JSON, klucz API w Settings, pola promo + visibleOnMatrix). Mapowanie pól + fazowanie + decyzje → **`docs/integracja-3destate-decyzje.md`** (źródło prawdy). Archiwum mailowe: `docs/integracja-3destate-pytania.md`. Framing wobec 3DE: **nie ujawniamy że budujemy własny CRM** ("rozważamy zmianę"). Po deployu: `prisma db push` + admin generuje klucz w `/settings` i przekazuje 3DE (support@3destate.pl, kod `86c9vnnau`).
- **`docs/raportowanie.md`** — 🟢 **moduł technicznie skończony 2026-05-21**, czeka tylko **rejestracja u ministerstwa** (mail na `kontakt@dane.gov.pl` z URL-em katalogu) + ustawienie scheduled task w Coolify (cron snapshotu) + wypełnienie ~35 pól w `/settings/dane-gov`. User planuje dokończyć gdy system będzie w pełni funkcjonalny przed startem. Otwarte techniczne (niskie priorytety): logowanie cen przy reimporcie xlsx (`lib/units-import.ts` nie pisze do `PriceHistory`), weryfikacja nagłówków po pierwszym harveście, ew. wielo-inwestycyjność. Szczegóły techniczne w **`docs/raportowanie-dane-gov-decyzje.md`** (źródło prawdy) + **`-rozpoczecie.md`** (research).
- **`docs/incident-bogdan-mail-status.md`** — 🟡 **OTWARTE** (po stronie usera, nie kod): incydent hack SMTP `bogdan.boruch@maraf.pl` (Synthient credential stuffing) + spam przez zapomnianego WordPressa. Hasło zmienione, **WordPress cleanup wykonany 2026-05-19** (3 zombie skasowane z `/autoinstalator/`). Otwarte: **audyt wp-admin maraf.pl** (motyw envision 2013, nieaudytowana — analogiczne ryzyko jak rafalboruch.com przed marcowym hackiem 2026-03), sprawdzenie modyfikacji rafalboruch.com z 18.05, prewencyjna lista + zmiana haseł skrzynek @maraf.pl, TODO Bogdana (skan + zmiana haseł na innych serwisach). Pełny stan: sekcja „Update 2026-05-19" w pliku.
- **`docs/outlook-rafal-recreate-rozpoczecie.md`** — 🟡 **OTWARTE** (operacyjne): Outlook Rafała — recreate konta `rafal.boruch@maraf.pl` po zmianie hasła. **Komputer #1 ZAMKNIĘTE** (działa, serwer `poczta.home.pl` był kluczem — NIE `maraf.pl`/`imap.home.pl`; pełna historia Sent 2000+). Zostaje komputer #2 (ta sama procedura). Plik ma pełną procedurę + ustawienia serwera.
- **`docs/dostarczalnosc-maili-maraf-status.md`** — 🟡 **OTWARTE** (realny problem biznesowy): maile z `rafal.boruch@maraf.pl` odrzucane przez odbiorców jako SPAM (score 250) — skutek uboczny incydentu Bogdana (nadszarpnięta reputacja IP) + braki konfiguracji. Diagnoza 2026-05-25: SPF bez `~all` (do poprawy), brak DMARC (do dodania), DKIM rekord JEST (aktywność do potwierdzenia u home.pl), PTR mismatch (home.pl). Plan: poprawa SPF+DMARC w DNS (Rafał) + ticket do home.pl (delisting IP, DKIM, PTR) + test mail-tester.com. Gotowe wartości rekordów + gotowiec ticketu w pliku.
- **`docs/karty-mieszkan-status.md`** — **🟢 ZAMKNIĘTE 2026-05-13** (zostawiam plik dla historii; jest 1 mini-TODO: poprawić w UI 2 literówki w `Unit.floor` — `B1.2.M18` 3→2, `B1.4.M59` 5→4).
- **`docs/obmiary-rozpoczecie.md`** — moduł obmiarów z rysunków (DXF/PDF). Schema + dependencies gotowe, ale brak UI/API. 4 warianty MVP do wyboru z user'em (manualne klikanie / DXF parser / AI / pełna integracja z Przerobami).
- **`docs/porownanie-obmiarow-rozpoczecie.md`** — porównanie obmiarów (rozszerzenie istniejącego `/przeroby/porownanie`). Zakres niejasny — 4 scenariusze do uzgodnienia z userem (rozszerzenie, historia wersji, xlsx vs rysunek, inne).
- **`docs/panel-personalizacja-rozpoczecie.md`** — **podtemat 2+3 (preferredName, interests, /profil, TopWidget per-user) wdrożony 2026-05-13** — patrz changelog. Otwarty pozostaje podtemat 1 (UX panelu `/settings`) — niedoprecyzowany.
- **`docs/sprzedaz-decyzje.md`** — moduł Sprzedaż gotowy w MVP. Otwarte: 4 warianty podpisywania umów (sekcja „Plan podpisywania") + 10 kierunków rozwoju generatora.
- **`docs/lokale-decyzje.md`** — moduł Lokale działa. Otwarte: 10 kierunków rozwoju (bulk operacje, wizualizacja rzutu, historia zmian, integracje portali).

_(temat „PDF generator" zamknięty 2026-05-12, „Personalizacja per-user" + „Import kart mieszkań" zamknięte 2026-05-13 — patrz `docs/changelog.md`)_

Gdy w trakcie pracy pojawi się temat niedokończony (deploy padł, fix wymaga osobnej sesji, czekamy na dane od użytkownika) — **wpisz tu** wraz z linkiem do osobnego pliku `docs/<temat>-status.md` z pełnym kontekstem (co próbowano, co nie pomogło, checklist diagnostyki).

Aktualizuj te pliki gdy podejmujesz nową decyzję projektową.

## Commands

```bash
# Dev
npm run dev                       # next dev (port 3000)
npm run build                     # produkcyjny build
npm run lint                      # next lint
npx tsc --noEmit                  # type-check (use after non-trivial edits)

# Baza danych
npx prisma generate               # po zmianach w prisma/schema.prisma
npx prisma db push --skip-generate  # synchronizuj schema → DB (projekt używa db push, nie migracji)
npm run db:seed                   # tworzy admina z ADMIN_EMAIL/ADMIN_PASSWORD
```

**UWAGA — README.md jest częściowo nieaktualny.** Mówi o deployu na MyDevil.net i `npm run db:migrate`, ale faktyczna produkcja to **Coolify + Docker na OVH VPS**, baza zarządzana przez `prisma db push` (folder `prisma/migrations/` nie istnieje). Push do `main` triggeruje webhook Coolify (auto-deploy). Po deployu który zmienia schema — w **Coolify Terminal** wykonać `node node_modules/prisma/build/index.js db push --skip-generate`.

## Architektura

### Route groups (Next.js App Router)

- **`app/(app)/*`** — wszystkie strony aplikacji z sidebarem. Layout wymusza session NextAuth (redirect do `/auth/signin`) i ma `export const dynamic = 'force-dynamic'` — wszystkie podstrony są SSR on-demand (nie SSG). Jeśli dodajesz nowy moduł — wszedź pod `(app)`.
- **`app/(print)/*`** — widoki do druku/PDF, własny layout (białe tło, bez chrome aplikacji), też wymaga session. Tu lądują wydruki ofert (`/oferty/[id]/druk`).
- **`app/auth/*`** — strony logowania, reset hasła (poza grupą — bez session check).
- **`app/api/*`** — route handlers. Wszystkie używają `getServerSession(authOptions)` + 401 jeśli brak.

### Domeny biznesowe (moduły)

| Folder pod `(app)` + `api/` | Co robi |
|---|---|
| `clients`, `units`, `oferty`, `sales`, `service`, `mailing`, `calendar` | **CRM** — sprzedaż mieszkań, oferty z kalkulatorem rabatu, umowy rezerwacyjne |
| `przeroby` | **Kontroling protokołów przerobowych** — porównanie obmiaru inżyniera (Maraf) z przedmiarem kierownika (Konrad) per kondygnacja, generowanie protokołów |
| `settings` | Konfiguracja — **tylko admin widzi** (gate w layout + Sidebar). Admin = `NEXT_PUBLIC_ADMIN_EMAIL` w env. SMTP, dane firmy, użytkownicy. |

### Schema Prisma — konwencje

- Status pole to **string** z dokumentowanym zestawem wartości w komentarzu nad modelem (np. `// status: WOLNY | ZAREZERWOWANY | SPRZEDANY | NIEDOSTEPNY`). Etykiety + kolory są w `lib/types.ts` (`UNIT_STATUS_LABELS`, `UNIT_STATUS_COLORS`).
- Schema dodaje pola → `prisma generate` lokalnie + `prisma db push` na produkcji. Nie ma migracji.

### Kluczowe wzorce kodu

- **Import xlsx** — moduł Lokali (`/units/import`) + Przeroby Konrada (`/przeroby/porownanie` → uploader) używają tego samego patternu: endpoint POST z FormData + dwa tryby `preview` (czyta + diff) i `commit` (zapis w `prisma.$transaction`). Wspólna logika w `lib/units-import.ts` / `lib/przedmiar-konrad-import.ts`. Reimport zachowuje pola edytowane przez usera (`manualValue` w FloorSummaryItem) + odtwarza historię (`FloorSummaryItemHistory`) bo cascade delete by ją skasował.
- **SMTP** — konfigurowany przez `/settings` (zapisywany w tabeli `Settings` jako klucz/wartość), NIE przez env. `lib/mailer.ts` (funkcja `getSmtpConfig`) czyta z DB najpierw, env jako fallback. `sendEmail()` ma retry dla transient errors (ECONNRESET, ETIMEOUT) i przyjmuje opcjonalne `headers`.
- **PDF z oferty** — `lib/offer-pdf-html.ts` (HTML string z embedded base64 images z `public/`) + `lib/pdf-generator.ts` (puppeteer-core z system Chrome). Endpoint `/api/oferty/[id]/pdf` zwraca PDF; wysyłka maila (`/api/oferty/[id]/email`) dołącza go jako attachment (non-blocking — jeśli generator padnie, mail leci bez PDF).
- **Dark mode** — class-based (`.dark` na root), w `app/globals.css` mam ręczne overrides dla utility-classes Tailwinda których app używa. Tailwind v4 + class-based dark variant zdefiniowane przez `@variant dark (&:where(.dark, .dark *))`. Opacity warianty (`bg-X-50/40`) wymagają **osobnych overrides** bo Tailwind generuje inne klasy.

## Pułapki

- **`lucide-react@^1.9.0`** — bardzo stara wersja (oficjalny lucide-react jest na `0.x.x`). Działa, ma większość ikon — **nie upgrade'uj bez weryfikacji** że nasze importy nadal istnieją.
- **Docker user `nextjs` MUSI mieć home directory** (`useradd -m -d /home/nextjs`). Bez `$HOME` Chrome pada z `chrome_crashpad_handler: --database is required`. Dockerfile ma to skonfigurowane + pre-tworzy `~/.config`, `~/.local/share/applications`, `/tmp/chrome-crashes`, `/tmp/chrome-user-data` z `chown nextjs:nodejs`.
- **Debian chromium 137+ ma bug crashpad** — używamy **Google Chrome stable** zainstalowanego z oficjalnego repo Google (Dockerfile w runner stage). `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable`. **NIE wracaj** do `apt-get install chromium`.
- **`.env.local` vs `schema.prisma`** — lokalnie aplikacja **się nie uruchomi** out-of-the-box: `.env.local` ma `DATABASE_URL="file:..."` (SQLite z legacy), a schema mówi `provider = "postgresql"`. Trzeba postawić lokalnego Postgres albo użyć cloud DB. Workflow developerski bywa: edit kod → push → Coolify deploy → test na produkcji.
- **`force-dynamic` w `app/(app)/layout.tsx`** jest **konieczny** — bez niego `next build` próbuje statycznie wygenerować strony robiące Prisma queries, dostaje OOM przy SSG i build pada. Każda nowa strona pod `(app)` dziedziczy to.
- **`output: 'standalone'` + `public/uploads/`** — Next.js standalone trace'uje listę plików w `public/` w **buildtime**. Pliki dodane w runtime (przez Coolify persistent volume `/app/public/uploads` lub nasze skrypty importowe) **NIE są serwowane** przez wbudowany static handler — zwraca 404. Dlatego mamy `app/uploads/[...path]/route.ts` — catch-all API route który czyta pliki z fs. Każdy URL `/uploads/*` przechodzi przez niego (wymaga session + sanityzuje path traversal). Jak dodajesz nowy MIME type — uzupełnij `MIME` w route.ts.
- **Worktree'y w `.claude/worktrees/`** — Claude Code czasem pracuje w worktree, główne repo to `C:/AplikacjeAI/CodeCRM`. `node_modules` jest w głównym repo, worktree go nie ma — `npx prisma generate` uruchamiaj w głównym repo. Pliki binarne (xlsx, png) wgrywane przez usera do głównego repo trzeba skopiować do worktree przed `git add`.

## Skrypty CLI (poza UI)

Folder `scripts/` zawiera importery xlsx → DB uruchamiane w Coolify Terminal po deployu (`node scripts/import-X.js [args]`). Dockerfile kopiuje je do obrazu razem z xlsx/dotenv/bcryptjs. Workflow: scp xlsx na VPS → docker cp do kontenera → node scripts/import-X.js /tmp/plik.xlsx. Dla powtarzalnych plików (jak Konrad co miesiąc) preferowany jest **upload przez UI** (`/przeroby/porownanie` ma uploader); skrypty CLI są dla jednorazowych masowych importów (obmiar Maraf, lista lokali).

## Zmienne środowiskowe (Coolify)

Poza standardowymi (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`):

- `NEXT_PUBLIC_ADMIN_EMAIL` — gate dla `/settings/*` + sidebar link. **MUSI być rebuild** (nie restart) po zmianie — `NEXT_PUBLIC_*` są inline'owane w buildtime.
- `ENCRYPTION_KEY` — **64 znaki hex (32 bajty)**, szyfrowanie at-rest danych osobowych klientów (PESEL, NIP, dowód, imiona rodziców, adres) — patrz `lib/crypto.ts` + `lib/prisma.ts` ($extends). Wygeneruj: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Bez klucza dane zapisują się PLAINTEXT** (z ostrzeżeniem w logu) — aplikacja nie pada, ale ochrona nie działa. Po pierwszym ustawieniu klucza uruchom **raz** `node scripts/encrypt-existing-clients.js` w Coolify Terminal (szyfruje istniejące rekordy; idempotentny). **NIE zmieniaj klucza** po zaszyfrowaniu danych — stare rekordy staną się nieodczytywalne (rotacja kluczy nie jest zaimplementowana). Klucz trzymaj w password managerze obok `DATABASE_URL`.
- `DANEGOV_CRON_SECRET` — sekret dla cron-a generującego dzienny snapshot raportu cen na dane.gov.pl. Wymagany przez `POST /api/public/dane-gov/snapshot?secret=...` (lub `Authorization: Bearer ...`). Wygeneruj: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Coolify scheduled task: codzienne POST z tym sekretem. Bez tej zmiennej cron zwraca 401, ale **panel admina** w `/settings/dane-gov` może generować ręcznie (chroniony sesją). Patrz `docs/raportowanie-dane-gov-decyzje.md`.
- `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_CITY` — opcjonalne, domyślnie Zgierz (TopWidget na dashboardzie pobiera pogodę z Open-Meteo).
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable` — ustawione w Dockerfile.
- SMTP — **nie przez env**, konfiguracja w UI Settings.

## Git workflow

- Push do `main` → auto-deploy Coolify.
- Nie ma PRs/branchy w obecnym workflow — bezpośrednio na main.
- Commit messages po polsku, prefix modułowy (np. `Oferty:`, `Przeroby:`, `Dark mode:`). Co-Authored-By z Claude jeśli pracował.
- **`prefetch={false}` na linkach** w `Sidebar.tsx` — żeby uniknąć bundle-mismatch po deploy (stary JS w cache + nowy serwer).
