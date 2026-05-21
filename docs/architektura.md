# Architektura — szkielet systemu CRM

**Cel pliku**: kompletny obraz „jak ten system jest zbudowany". Stack, struktura, modele, wzorce wielokrotnego użytku, przepływy, jak dodać nowy moduł. Pierwszy plik do przeczytania w nowej sesji która dotyka fundamentów / dodaje moduł.

Powiązane: `docs/system-core.md` (infrastruktura + bezpieczeństwo + go-live), `CLAUDE.md` (skrót na każdą sesję), `docs/changelog.md` (decyzje z datami).

---

## 1. Stack technologiczny

| Warstwa | Technologia | Wersja | Uwagi |
|---|---|---|---|
| Framework | **Next.js** App Router | 14.2.35 | `output: 'standalone'` (Docker) |
| Język | TypeScript | — | `npx tsc --noEmit` po nietrywialnych zmianach |
| ORM | **Prisma** | 5.22 | `db push`, NIE migracje (brak `prisma/migrations/`) |
| Baza | **PostgreSQL** | — | kontener obok aplikacji w Coolify |
| Auth | **NextAuth** (Credentials + JWT) | 4.24 | bcrypt hasła, sesja 8h |
| Style | **Tailwind v4** | 4.2 | class-based dark mode + ręczne overrides w globals.css |
| Ikony | **lucide-react** | **1.9.0** | ⚠️ stara wersja — NIE upgrade bez weryfikacji importów |
| PDF | **puppeteer-core** + Google Chrome | — | generowanie ofert PDF |
| DOCX | **docxtemplater** | 3.68 | generowanie umów z szablonu |
| XLSX | **xlsx** (SheetJS) | — | importy (lokale, obmiary, protokoły, faktury) |
| Hash | **bcryptjs** | 3.0 | round 10 |

Deploy: **Coolify + Docker na OVH VPS**. Push do `main` → webhook → auto-deploy. Patrz `docs/system-core.md`.

---

## 2. Struktura katalogów

```
app/
  (app)/              # strony z sidebarem — wymaga session, force-dynamic (SSR)
    dashboard/ clients/ units/ oferty/ sales/ service/ mailing/
    calendar/ profil/ przeroby/ finanse/ settings/
  (print)/            # widoki do druku/PDF — własny layout (białe tło)
  auth/               # logowanie, reset hasła (BEZ session check)
  api/                # route handlers — getServerSession + 401 jeśli brak
  uploads/[...path]/  # catch-all serwujący pliki z public/uploads/ (standalone fix)
components/
  layout/             # Sidebar (workspace switcher), TopBar, Logo
  dashboard/ clients/ units/ sales/ przeroby/ finanse/ settings/  # per-moduł
lib/                  # logika biznesowa, helpery (patrz §8)
prisma/
  schema.prisma       # JEDEN plik, ~40 modeli
  seed.ts             # tworzy admina z ADMIN_EMAIL/ADMIN_PASSWORD
scripts/              # importery CLI xlsx → DB (uruchamiane w Coolify Terminal)
docs/                 # decyzje projektowe per moduł (czytaj przed pracą)
public/uploads/       # volume Coolify — pliki runtime (karty PDF, skany, zdjęcia)
templates/            # umowa-rezerwacyjna.docx (placeholdery {{...}})
```

---

## 3. Route groups + przepływ layoutów

- **`app/(app)/layout.tsx`** — wymusza `getServerSession` (redirect `/auth/signin` gdy brak) + `export const dynamic = 'force-dynamic'`. **Konieczne** — bez `force-dynamic` `next build` próbuje SSG stron z Prisma queries → OOM → build pada. Każda strona pod `(app)` dziedziczy.
- **`app/(print)/layout.tsx`** — białe tło, bez chrome aplikacji. Wydruki ofert (`/oferty/[id]/druk`).
- **`app/auth/*`** — poza grupami, bez session.
- **`middleware.ts`** — server-side gate per-permission. Czyta `token.permissions` z JWT. Admin override (`NEXT_PUBLIC_ADMIN_EMAIL`). Brak permission → 403 dla `/api/*`, redirect dla stron. Matcher wyklucza URL-e z kropką (`.*\.`) — pliki/statics omijają middleware.

---

## 4. Schema Prisma — mapa modeli (pogrupowana po domenach)

**Auth & system:**
`User` (permissions[], preferredName, interests), `Settings` (key/value — SMTP, dane firmy), `AuditLog` (RODO), `CalendarToken` (Google OAuth)

**CRM sprzedaż:**
`Client` (PESEL, NIP, dane rodziców) → `Activity`, `ClientUnit`, `Offer`+`OfferItem`, `Contract`+`ContractClient`+`ContractUnit`+`ContractAttachment`+`ContractHistory`, `ServiceRequest`
`Unit` (lokale: status, ceny, floor, rooms, floorPlanUrl) → `UnitImage`, `UnitCreativeSettings` (Meta Ads), `InvestmentImage`

**Przeroby (kontroling wykonawstwa):**
`Subcontractor` → `SubContract` (valueNet + agreedValueNet) → `ContractWorkItem` → `Protocol` → `ProtocolItem`
`WorkScope` → `WorkCategory` → `WorkItem` (obmiar Maraf)
`FloorSummary` → `FloorSummaryItem` → `FloorSummaryItemHistory` (porównanie Maraf↔Konrad)
`DrawingProject` → `Drawing` → `DrawingElement` (obmiary z rysunków — schema gotowa, brak UI)

**Finanse (faktury zakupowe):**
`Vendor` → `PurchaseInvoice` → `PurchaseInvoicePayment` / `PurchaseInvoiceApproval` / `PurchaseInvoiceAttachment`

**Konwencja statusów**: pole `String` z dokumentowanym zestawem wartości w komentarzu nad modelem (np. `// status: WOLNY | ZAREZERWOWANY | ...`). Etykiety + kolory w `lib/types.ts`.

---

## 5. Auth + permissions flow

```
Login (NextAuth Credentials) → authorize() w lib/auth.ts:
  - rate limit (5/15min email + 20/15min IP)
  - bcrypt.compare
  - audit LOGIN_SUCCESS/FAIL
  → JWT z permissions[] (snapshot z DB)

Każdy request:
  - middleware.ts czyta token.permissions
  - getRequiredPermission(pathname) → wymagana sekcja
  - admin (NEXT_PUBLIC_ADMIN_EMAIL) → override, przepuść wszystko
  - permission match → przepuść; brak → 403/redirect
```

- **Permissions** (`lib/permissions.ts` `ALL_PERMISSIONS`): `dashboard, clients, units, oferty, sales, service, mailing, calendar, przeroby, finanse`. `settings` = hardcoded admin-only.
- **Snapshot w JWT** — po zmianie permissions user musi się wylogować/zalogować.
- **Sidebar** (`components/layout/Sidebar.tsx`) filtruje workspace'y/sekcje per permission. Workspace switcher: CRM / Przeroby / Finanse / Konfiguracja. Gdy `status !== 'authenticated'` → pokazuje wszystko (anti-pusty-sidebar).

---

## 6. Wzorce wielokrotnego użytku (reuse — kopiuj te, nie wymyślaj nowych)

| Wzorzec | Gdzie | Jak działa |
|---|---|---|
| **Import xlsx** | `lib/units-import.ts`, `przedmiar-konrad-import.ts`, `finanse-import.ts` | POST FormData, 2 tryby: `preview` (czyta+diff) i `commit` (zapis w `$transaction`). Reimport zachowuje pola edytowane przez usera. |
| **Uploads** | `app/uploads/[...path]/route.ts` | Catch-all serwujący pliki z `public/uploads/` (standalone NIE serwuje runtime additions). Wymaga session + sanityzacja path traversal. Każdy nowy upload-flow zapisuje do `public/uploads/<sekcja>/`. |
| **Audit log** | `lib/audit-log.ts` | `void audit({action, entity, entityId, ...})` fire-and-forget. Akcje: LOGIN_*, VIEW_CLIENT, CREATE/UPDATE/DELETE, PERMISSION_CHANGE, PASSWORD_RESET. |
| **Rate limit** | `lib/rate-limit.ts` | `rateLimit(key, maxHits, windowMs)` sliding window in-memory. |
| **SMTP** | `lib/mailer.ts` | `getSmtpConfig` czyta z tabeli `Settings` (DB, przez UI `/settings`), env fallback. `sendEmail()` retry dla transient errors + opcjonalne headers. |
| **PDF (oferty)** | `lib/offer-pdf-html.ts` + `pdf-generator.ts` | HTML string z base64 images → puppeteer-core + system Chrome. |
| **DOCX (umowy)** | `lib/contract-generator.ts` + `templates/umowa-rezerwacyjna.docx` | docxtemplater wypełnia placeholdery `{{...}}` z `buildContractContext`. |
| **Dark mode** | `app/globals.css` | class-based `.dark`, ręczne overrides utility-class. Opacity warianty (`bg-X-50/40`) wymagają OSOBNYCH overrides. Bezpieczny pattern: CSS variables (`var(--surface)` etc.) albo `bg-X-50 text-X-700` (mają override). |

---

## 7. Mapa modułów + stan

| Moduł `/(app)/` | Co robi | Stan |
|---|---|---|
| `dashboard` | TopWidget (powitanie/news/pogoda) + KPI | ✅ działa |
| `clients` | CRM klienci (CRUD, aktywności, statusy) | ✅ działa |
| `units` | Lokale (CRUD, import xlsx, karty PDF, galeria, statusy) | ✅ działa |
| `oferty` | Kalkulator ofert + rabat brutto + PDF + wysyłka mailem | ✅ działa |
| `sales` | Umowy rezerwacyjne (DOCX generator, konwersja z oferty, załączniki) | ✅ MVP |
| `service` | Zgłoszenia serwisowe / usterki | ✅ działa |
| `mailing` | Wysyłka maili | ✅ działa |
| `calendar` | Google Calendar (OAuth, widoki dzień/tydzień/miesiąc) | ✅ działa |
| `profil` | Personalizacja per-user (preferredName, interests) | ✅ działa |
| `przeroby` | Kontroling protokołów (Maraf↔Konrad, obmiary, podwykonawcy) | ✅ działa |
| `finanse` | Faktury zakupowe, płatności, akceptacje, import xlsx | ✅ MVP Faza 1 |
| `settings` | Admin: SMTP, użytkownicy+permissions, dane firmy, audit log, Meta Ads | ✅ działa |

Szczegóły per moduł w `docs/<moduł>-decyzje.md`.

---

## 8. `lib/` — co robi każdy helper

- **Rdzeń**: `prisma.ts` (singleton), `auth.ts` (NextAuth + rate limit + audit), `auth-utils.ts` (isAdmin), `permissions.ts` (mapa URL→permission), `types.ts` (labele/kolory statusów), `utils.ts` (format waluty/daty)
- **Bezpieczeństwo**: `audit-log.ts`, `rate-limit.ts`
- **Komunikacja**: `mailer.ts` (SMTP), `google-calendar.ts` (OAuth + events)
- **Dokumenty**: `contract-generator.ts` + `contracts.ts` (umowy), `offer-pdf-html.ts` + `pdf-generator.ts` (oferty PDF), `numberToWordsPl.ts` (kwoty słownie)
- **Importy**: `units-import.ts`, `przedmiar-konrad-import.ts`, `finanse-import.ts`, `finanse-format.ts`
- **Przeroby**: `przeroby-mapping.ts`, `protokol-maraf-match.ts` (dopasowanie protokół↔obmiar)
- **Dashboard**: `greeting.ts`, `news-feed.ts` (RSS), `weather.ts` (Open-Meteo)
- **Meta Ads**: `ad-copy.ts`, `ad-creative-build.ts`, `ad-creative-generator.ts`, `ad-creative-html.ts`
- **Pliki**: `compress-image.ts`, `zip.ts`
- **Rezerwacje**: `reservations.ts` (expire soft reservations)

---

## 9. Jak dodać nowy moduł (przepis)

1. **Schema**: dodaj modele w `prisma/schema.prisma` + komentarz statusów. `npx prisma generate` lokalnie.
2. **Permission**: dodaj identyfikator do `ALL_PERMISSIONS` w `lib/permissions.ts` + mapowanie URL w `getRequiredPermission`.
3. **Strony**: utwórz `app/(app)/<moduł>/page.tsx` (+ podstrony). Dziedziczą `force-dynamic` z layoutu.
4. **API**: `app/api/<moduł>/route.ts` — zawsze `getServerSession` + 401. Mutacje → `void audit({...})`.
5. **Sidebar**: dodaj sekcję do odpowiedniego workspace w `components/layout/Sidebar.tsx`.
6. **Komponenty**: `components/<moduł>/` (client components z `'use client'`).
7. **Import xlsx** (jeśli trzeba): skopiuj wzorzec preview/commit z `lib/units-import.ts`.
8. **Uploads** (jeśli trzeba): zapisuj do `public/uploads/<moduł>/`, serwowanie działa przez catch-all route automatycznie.
9. **Docs**: `docs/<moduł>-decyzje.md` z decyzjami. Wpis do `docs/changelog.md`.
10. **Deploy**: push → Coolify. Jeśli schema zmieniona → `prisma db push` w Coolify Terminal.

---

## 10. Pułapki krytyczne (uczyć się na cudzych błędach)

- **`force-dynamic` w `(app)/layout.tsx`** — konieczny, bez niego build OOM.
- **`output: 'standalone'` + uploads** — runtime files w `public/` NIE serwowane przez built-in handler → `app/uploads/[...path]/route.ts` to obchodzi.
- **`lucide-react@1.9.0`** — stara wersja, nie upgrade bez weryfikacji.
- **Docker user `nextjs` MUSI mieć home** (`useradd -m`) — bez `$HOME` Chrome pada (crashpad). Używamy Google Chrome stable, NIE Debian chromium (bug 137+).
- **`NEXT_PUBLIC_*`** — inline w buildtime → po zmianie wymaga **REBUILD**, nie restart. Inne env → restart wystarczy.
- **`prisma db push`** po każdej zmianie schemy na produkcji (Coolify Terminal: `node node_modules/prisma/build/index.js db push --skip-generate`).
- **Dark mode opacity warianty** (`bg-X-50/40`) — wymagają osobnych overrides w globals.css.
- **Worktree vs główne repo** — `node_modules` tylko w głównym repo; tsc/prisma generate uruchamiać tam. Worktree do commitów. **NIE `git reset --hard` w głównym repo** gdy user ma tam niezacommitowane pliki (np. otwarty docx).
- **Równoległe sesje** — czasem dodają kod używający modelu którego nie ma w schemie (broken build na origin/main). Sprawdzać `git ls-tree origin/main` czy plik faktycznie jest, czy to lokalny untracked.
