# Panel + personalizacja per-user — punkt startowy

**Status**: 🟡 user zgłosił chęć rozpoczęcia. Łączy 3 podtematy:
1. **Dopracowanie panelu** (UX strony `/settings` jako całość)
2. **Ustawienia per-użytkownik** (rozszerzenie poza permissions)
3. **Personalizacja Dashboard / TopWidget** dla nowych userów (zainteresowania, preferowane imię)

## Co JUŻ działa

### Strona `/settings`

- **Tylko admin** widzi (`NEXT_PUBLIC_ADMIN_EMAIL` + `app/(app)/settings/layout.tsx` redirect non-admin)
- **Sekcje**:
  - **Użytkownicy i uprawnienia** (`UsersSection.tsx`) — lista userów, dodawanie z mailem aktywacyjnym, reset hasła, usuwanie, **per-user permissions** (z 2026-05-12 — checkboxy do każdej z 9 sekcji aplikacji: dashboard, clients, units, oferty, sales, service, mailing, calendar, przeroby)
  - **Google Calendar** — OAuth flow, status połączenia
  - **Serwer poczty (SMTP)** (`SettingsForm.tsx`) — full UI z host/port/user/pass/from/fromName/allowSelfSigned + preset home.pl + test mail
  - **Dane firmy** — companyName, investmentName, bankAccount, emailSignature

### Permissions per-user (2026-05-12)

- `User.permissions String[]` w schema — lista identyfikatorów sekcji (np. `['przeroby', 'units']`)
- `lib/permissions.ts` — `ALL_PERMISSIONS`, `PERMISSION_LABELS`, `getRequiredPermission(path)`, `getFirstAvailableUrl()`
- **Middleware** (`middleware.ts`) — server-side gate: 403 dla `/api/*`, redirect na pierwszą dostępną stronę
- **Sidebar** filtruje sekcje per-permission
- Admin (env) ma wszystko zawsze (override)
- **Pułapka**: permissions w JWT to snapshot z chwili logowania — user musi się wylogować/zalogować po zmianie

### Dashboard / TopWidget (powitanie + news + pogoda)

- **`/api/dashboard/widget`** zwraca `{ greeting, news, weather, isAdmin }`
- Powitanie po porze dnia + imieniu (admin = hardcoded "Rafał", inni = pierwsze słowo z `User.name` lub email)
- News dnia — topic rotuje per dzień tygodnia (pon/cz=tech, wt/sb=świat, śr/nd=biohacking, pt=motywacja)
- Pogoda Open-Meteo dla Zgierza (konfigurowalne env: `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_CITY`)
- **Ograniczenie**: news + weather widoczne **tylko dla admina**. Pozostali userzy → tylko prosty `SimpleGreeting` (biały kafelek, bez news/pogody)

## Co NIE działa / co user chce zmienić

### Podtemat 1: „Dopracowanie panelu" — niedoprecyzowane

User mówi „dopracujemy cały panel" — zakres niejasny. Pytania:

- **Czy chodzi o stronę `/settings`** (kosmetyka, lepsza nawigacja między sekcjami, np. tabs zamiast scrolla)?
- **Czy o `Sidebar`** (np. ikona profilu z dropdown'em, lepsze grupowanie sekcji)?
- **Czy o `TopBar`** (avatar usera, quick actions, search global)?
- **Czy o ogólny brand consistency** (kolory, spacing, typography w obu modach)?
- **Czy konkretne błędy / nieprzyjemne miejsca** które user widzi codziennie?

### Podtemat 2: Ustawienia per-użytkownik

Aktualnie `User` ma tylko: `email, password, name, permissions, resetToken*`. Czego brakuje?

**Możliwe rozszerzenia schema** (do uzgodnienia z userem):

```diff
 model User {
   id                String    @id @default(cuid())
   email             String    @unique
   password          String
   name              String?
+  preferredName     String?   // wyświetlane w powitaniu (np. "Rafał" zamiast "Rafał Boruch")
+  avatarUrl         String?   // upload do public/uploads/avatars/
+  phone             String?   // do stopki maili
+  jobTitle          String?   // np. "Dyrektor sprzedaży"
+  signature         String?   // własna stopka maila (zamiast globalnej z Settings)
+  interests         String[]  @default([]) // tematy newsów ['tech','world','motivation','biohacking']
+  theme             String?   // 'light' | 'dark' | 'auto'
+  locale            String?   @default("pl")
+  notifications     Json?     // preferencje notyfikacji (które typy)
   permissions       String[]  @default([])
   ...
 }
```

**Pytania**:
- Które z tych pól user chce mieć w pierwszej iteracji?
- Edycja **per-user przez self-service** (user edytuje swoje `/profil`) czy **admin przez `/settings`**? Albo oba?
- Avatary — upload (jak `FloorPlanUpload`) czy initials/gravatar?
- Czy stopki mailowe per-user → każdy user wysyłający z system maila ma swoją? (Obecnie globalna `emailSignature` z `Settings` table)

### Podtemat 3: Personalizacja Dashboard po zalogowaniu nowego usera

Aktualnie nowi userzy widzą tylko `SimpleGreeting`. User chce żeby też mieli pełen TopWidget z news/weather. Plus tematy newsów **per user**, nie hardcoded rotacja per dzień tygodnia.

**Implementacja (proponowana)**:

1. **`User.interests String[]`** w schema — lista wybranych tematów (`tech`, `world`, `motivation`, `biohacking`, `coding`, `business`, ...)
2. **Default**: pusty array → fallback do dzisiejszej rotacji per dzień (wszyscy widzą to samo)
3. **UI w `/settings/profil`** (lub `/profil`) — formularz z checkboxami tematów + zapis `PATCH /api/users/[id]/interests`
4. **Endpoint `/api/dashboard/widget`**:
   - Czyta `interests` z sesji (lub query do DB)
   - Jeśli pusty → dzisiejsza logika (rotacja per dzień)
   - Jeśli ma tematy → deterministyczny wybór jednego z `user.interests` per dzień (np. hash(`userId-YYYYMMDD`) % `interests.length`)
5. **Plus**: usunąć `isAdmin` gate w endpoincie — pokazywać TopWidget wszystkim userom (nie tylko admin)

**Pytania**:
- Lista tematów do wyboru — czy zostawiamy 4 obecne (`tech, world, motivation, biohacking`) plus rozszerzamy? Np. dodać `coding`, `business`, `architecture`, `real estate`, `polski rynek`?
- Czy `interests` ustawia user sam (w `/profil`) czy admin (w `/settings/users`)?
- **Domyślne tematy przy rejestracji** — jakieś sensowne 2-3 tematy żeby user nie miał pustego widget'u
- Plus może rozszerzyć też **pogodę** per-user (każdy ma swoje miasto)? Obecnie globalna z env.

## Plan implementacji (proponowany — do akceptacji w nowej sesji)

### Faza 1: Schema + permissions (1-2h)

1. `prisma/schema.prisma`: dodać `preferredName`, `interests` (minimum)
2. `prisma db push --skip-generate` w Coolify Terminal
3. `lib/permissions.ts`: nowa permission `profile.edit` (lub coś podobnego)
4. Endpoint `PATCH /api/users/me` — user edytuje **swoje** pola (nie wszystkie, tylko whitelist)

### Faza 2: Strona /profil (2-3h)

1. `app/(app)/profil/page.tsx` — server component
2. `components/profil/ProfileForm.tsx` — client edit
3. Sekcje: imię/preferowane imię, zainteresowania (checkboxy), avatar (opcjonalne), preferencje (theme, locale)
4. Link w sidebarze (lub w TopBar dropdown nad emailem)

### Faza 3: TopWidget per-user (1-2h)

1. `/api/dashboard/widget` czyta `User.interests`
2. `lib/news-feed.ts` ma `getTopicForToday(date, interests?)` — jeśli interests podane, wybiera z nich; jeśli puste, dzisiejsza logika
3. Usunąć `isAdmin` gate w endpointcie — wszyscy widzą TopWidget
4. **SimpleGreeting** zostaje jako fallback gdy news/weather padnie

### Faza 4: Settings — dopracowanie panelu (1-2h, zależnie co user chce)

Po doprecyzowaniu w sesji.

## Pułapki

- **JWT snapshot** — po zmianie `User.interests` user musi się wylogować i zalogować, **chyba że** czytamy interests z DB query w `/api/dashboard/widget` (nie z `session.user.interests`) — wtedy działa natychmiast. Polecam DB query (jest tani, raz dziennie i tak cache 6h).
- **`User.interests` jako tablica** — Postgres `text[]` w Prisma to `String[]`. Filtry typu „user X ma interest Y" wymagają `where: { interests: { has: 'tech' } }`.
- **Avatar upload** — jeśli wybierzemy upload (nie initials), potrzebny endpoint + storage. Albo S3-compat (R2 / B2) albo lokalny `public/uploads/avatars/` (jak `FloorPlanUpload`). Patrz `docs/lokale-decyzje.md` (pułapka floor plan).

## Powiązania z innymi modułami

- **Dashboard** (`docs/dashboard-decyzje.md`) — TopWidget będzie korzystał z `User.interests`. Aktualizacja po implementacji.
- **Mailing** — jeśli per-user signature, każdy mail z systemu (oferty, reset hasła, mailing) używa sygnatury **wysyłającego** zamiast globalnej. Wymaga refactor `lib/mailer.ts` (`sendEmail` przyjmuje `fromUserId?`).
- **CONTRACTOR / Konrad** — jego TopWidget też pokaże news/weather? Czy zostaje na podstawowym poziomie? (Bo Konrad ma tylko `przeroby` permission, dashboard pewnie nawet nie widzi.) Sprawdzić `lib/permissions.ts → getFirstAvailableUrl()`.

## Jak rozpocząć w nowej sesji

```
"Przeczytaj docs/panel-personalizacja-rozpoczecie.md.
Zadaj mi pytania z 3 podtematów (panel UX, ustawienia per-user,
personalizacja dashboard) i wybierzmy zakres MVP."
```

Albo jeśli wiesz że to konkretny scope:

```
"Z docs/panel-personalizacja-rozpoczecie.md robimy fazę 1+2+3 (schema,
profil page, TopWidget per-user). Plan?"
```

Lub tylko jeden podtemat:

```
"Z docs/panel-personalizacja-rozpoczecie.md — tylko podtemat 3
(TopWidget per-user interests). Plan i kodowanie."
```

## Pliki kluczowe (do dotknięcia w zależności od zakresu)

| Plik | Co zmienić |
|---|---|
| `prisma/schema.prisma` | nowe pola w `User` (interests, preferredName, ...) |
| `app/(app)/profil/page.tsx` | NOWY — strona profilu usera |
| `components/profil/ProfileForm.tsx` | NOWY — edycja |
| `app/api/users/me/route.ts` | NOWY — PATCH własnych pól |
| `app/api/dashboard/widget/route.ts` | czyta interests, usuwa admin gate |
| `lib/news-feed.ts` | `getTopicForToday(date, interests?)` |
| `lib/greeting.ts` | `getGreeting()` czyta `preferredName` (zamiast hardcoded "Rafał") |
| `components/layout/TopBar.tsx` | dropdown z linkiem do profilu, avatar |
| `components/layout/Sidebar.tsx` | ewentualnie link do profilu |
| `lib/permissions.ts` | nowa permission `profile.edit` (lub bez — każdy ma dostęp do **swojego** profilu) |
| `components/settings/UsersSection.tsx` | admin edytuje cudze interests / preferredName |
