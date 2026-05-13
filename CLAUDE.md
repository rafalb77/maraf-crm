# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dokumentacja per moduł

Zanim zaczniesz pracę nad konkretnym modułem — przeczytaj odpowiedni plik. Tam są **decyzje projektowe**, mapowania danych, pułapki i otwarte sprawy. Pliki:

- **`docs/przeroby-decyzje.md`** — moduł Przeroby (porównanie Maraf vs Konrad, mapowania kondygnacji, idempotencja reimportu)
- **`docs/oferty-decyzje.md`** — kalkulator ofert, rabat brutto/netto, druk PDF, wysyłka mailem
- **`docs/dashboard-decyzje.md`** — TopWidget (powitanie/news/pogoda), RSS, Open-Meteo
- **`docs/sprzedaz-decyzje.md`** — moduł Sprzedaż (umowy rezerwacyjne, generowanie DOCX, konwersja z oferty). Stan obecny + plan na podpisywanie umów (4 warianty MVP) + 10 kierunków rozwoju generatora.
- **`docs/lokale-decyzje.md`** — moduł Lokale (CRUD, import xlsx, statusy, rezerwacje). Stan obecny + 10 kierunków rozwoju (bulk ops, wizualizacja, historia, floor plan, integracje).
- **`docs/changelog.md`** — dziennik niebanalnych decyzji technicznych z datami („dlaczego coś jest tak a nie inaczej")
- **`docs/infrastruktura.md`** — panele administracyjne, URL-e (Coolify, OVH, GitHub), SMTP, awaryjne ścieżki resetu hasła. **Patrz tu gdy user pyta „jak zalogować się do Coolify" lub o inne kwestie operacyjne.**

### Otwarte sprawy (do dokończenia)

- **`docs/obmiary-rozpoczecie.md`** — moduł obmiarów z rysunków (DXF/PDF). Schema + dependencies gotowe, ale brak UI/API. 4 warianty MVP do wyboru z user'em (manualne klikanie / DXF parser / AI / pełna integracja z Przerobami).
- **`docs/porownanie-obmiarow-rozpoczecie.md`** — porównanie obmiarów (rozszerzenie istniejącego `/przeroby/porownanie`). Zakres niejasny — 4 scenariusze do uzgodnienia z userem (rozszerzenie, historia wersji, xlsx vs rysunek, inne).
- **`docs/panel-personalizacja-rozpoczecie.md`** — dopracowanie panelu `/settings` + ustawienia per-user (zainteresowania, preferowane imię, avatar) + TopWidget personalizowany dla wszystkich userów (nie tylko admin). 3 podtematy, plan 4-fazowy.

_(temat „PDF generator" zamknięty 2026-05-12 — patrz `docs/changelog.md`)_

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
- **Worktree'y w `.claude/worktrees/`** — Claude Code czasem pracuje w worktree, główne repo to `C:/AplikacjeAI/CodeCRM`. `node_modules` jest w głównym repo, worktree go nie ma — `npx prisma generate` uruchamiaj w głównym repo. Pliki binarne (xlsx, png) wgrywane przez usera do głównego repo trzeba skopiować do worktree przed `git add`.

## Skrypty CLI (poza UI)

Folder `scripts/` zawiera importery xlsx → DB uruchamiane w Coolify Terminal po deployu (`node scripts/import-X.js [args]`). Dockerfile kopiuje je do obrazu razem z xlsx/dotenv/bcryptjs. Workflow: scp xlsx na VPS → docker cp do kontenera → node scripts/import-X.js /tmp/plik.xlsx. Dla powtarzalnych plików (jak Konrad co miesiąc) preferowany jest **upload przez UI** (`/przeroby/porownanie` ma uploader); skrypty CLI są dla jednorazowych masowych importów (obmiar Maraf, lista lokali).

## Zmienne środowiskowe (Coolify)

Poza standardowymi (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`):

- `NEXT_PUBLIC_ADMIN_EMAIL` — gate dla `/settings/*` + sidebar link. **MUSI być rebuild** (nie restart) po zmianie — `NEXT_PUBLIC_*` są inline'owane w buildtime.
- `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_CITY` — opcjonalne, domyślnie Zgierz (TopWidget na dashboardzie pobiera pogodę z Open-Meteo).
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable` — ustawione w Dockerfile.
- SMTP — **nie przez env**, konfiguracja w UI Settings.

## Git workflow

- Push do `main` → auto-deploy Coolify.
- Nie ma PRs/branchy w obecnym workflow — bezpośrednio na main.
- Commit messages po polsku, prefix modułowy (np. `Oferty:`, `Przeroby:`, `Dark mode:`). Co-Authored-By z Claude jeśli pracował.
- **`prefetch={false}` na linkach** w `Sidebar.tsx` — żeby uniknąć bundle-mismatch po deploy (stary JS w cache + nowy serwer).
