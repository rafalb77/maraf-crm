# Infrastruktura i panele administracyjne

Szybki dostęp do paneli, URL-i, hostingów. Hasła trzymamy w password managerze — **NIE w tym pliku**.

## Coolify (deploy, kontenery, logi)

- **URL logowania**: http://51.178.84.166:8000/login
- **Co tam jest**: deploy aplikacji, restart kontenerów, logi build/runtime, Terminal w kontenerze, zmienne środowiskowe
- **Login**: hasło w password managerze
- **Reset hasła**:
  - Standardowy reset przez „Forgot password?" wymaga skonfigurowanego SMTP w Coolify (może nie działać)
  - Awaryjnie: SSH do VPS + `sudo docker exec coolify php artisan password:reset {email}` (patrz „OVH VPS" niżej)

## OVH VPS (host serwera)

- **Panel**: https://www.ovh.pl/manager/
- **IP serwera**: 51.178.84.166
- **Co tam jest**: zarządzanie VPS, KVM console (web-based terminal działa nawet bez SSH), reset hasła root, monitoring zasobów, snapshoty
- **SSH**: standardowo dostępne (user `ubuntu` / `debian` / `root`, dane w mailu założeniowym OVH)

## GitHub repo

- **URL**: https://github.com/rafalb77/maraf-crm
- **Branch produkcyjny**: `main` (auto-deploy do Coolify przez webhook)
- **Repo private**: TAK (zmienione 2026-05-08 dla bezpieczeństwa cen ofertowych w `data/`)

## Strona Nova Staffa

- **URL**: https://www.novastaffa.pl
- **Adres biura Maraf**: ul. Struga 23, 95-100 Zgierz
- **Kontakt**: biuro@novastaffa.pl
- **Lokalizacja inwestycji**: Zgierz (51.86°N, 19.41°E) — używane w TopWidget jako domyślna lokalizacja pogody

## Aplikacja produkcyjna (CRM)

- **URL**: https://crm.maraf.pl
- **Admin email**: rafal.boruch@maraf.pl (gate dla `/settings/*` przez `NEXT_PUBLIC_ADMIN_EMAIL` env)

## Baza PostgreSQL

- Hosted by Coolify (kontener obok aplikacji)
- Dostęp: `DATABASE_URL` w env Coolify
- Backup: **Coolify Scheduled Backups → Backblaze B2** (patrz sekcja „Backup i odtwarzanie bazy" niżej)
- Migracje: NIE używamy `prisma migrate` — tylko `prisma db push` po zmianie schema

## Backup i odtwarzanie bazy

**Zasada**: backup MUSI być poza OVH. Incydent z 2026-07 (wygasła subskrypcja OVH → serwer stanął) pokazał, że ryzykiem nie jest tylko awaria dysku, ale utrata całego konta OVH — dlatego backup idzie do **Backblaze B2** (osobny dostawca, osobny billing), a nie do OVH Object Storage. Szersze tło i alternatywy: `docs/system-core.md` § 4.

### Konfiguracja docelowa

- **Storage**: Backblaze B2, bucket `maraf-crm-backups` (private), region EU
  - Konto B2: login w password managerze; Application Key (S3-compatible) też tam
  - Endpoint S3: `https://s3.<region>.backblazeb2.com` (region widoczny przy buckecie, np. `eu-central-003`)
- **Coolify**: panel → **Storages** → dodany S3 storage „Backblaze B2"
- **Harmonogram**: zasób PostgreSQL → zakładka **Backups** → Scheduled Backup
  - Frequency: `0 2 * * *` (codziennie 02:00)
  - „Save to S3" = ON, storage: Backblaze B2
  - Retencja: ~14 kopii lokalnie (Backups Amount to Keep), w B2 lifecycle rule bucketa (np. 30 dni)

### Jak sprawdzić, że backupy działają

1. Coolify → zasób PostgreSQL → **Backups** → lista wykonań (status + rozmiar pliku; rozmiar 0 B = alarm)
2. Backblaze → bucket `maraf-crm-backups` → czy pojawiają się nowe pliki z bieżącą datą
3. Raz na kwartał: testowe odtworzenie na lokalnym Postgresie (patrz niżej)

### Odtwarzanie (restore)

Coolify robi dump przez `pg_dump` (format custom, plik `.dmp`/`.dump`, może być zgzipowany).

**Scenariusz A — baza żyje, cofamy dane (np. ktoś coś skasował):**
1. Coolify → PostgreSQL → Backups → pobierz właściwy plik (albo ściągnij z B2)
2. Wgraj do kontenera bazy i odtwórz (Terminal Coolify na zasobie PostgreSQL albo SSH na VPS):
   ```bash
   # z VPS: znajdź kontener bazy
   sudo docker ps | grep postgres
   sudo docker cp backup.dmp <kontener>:/tmp/backup.dmp
   sudo docker exec -it <kontener> pg_restore -U <POSTGRES_USER> -d <POSTGRES_DB> \
     --clean --if-exists /tmp/backup.dmp
   ```
3. Restart aplikacji CRM w Coolify + smoke test na crm.maraf.pl

**Scenariusz B — VPS/konto OVH przepadło (disaster recovery):**
1. Nowy VPS (OVH lub inny) → zainstaluj Coolify (`curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`)
2. Utwórz zasób PostgreSQL 16, ustaw `POSTGRES_USER`/`POSTGRES_DB`/hasło
3. Ściągnij najnowszy dump z Backblaze B2 (panel B2 albo `rclone`/`aws s3` z Application Key)
4. `pg_restore` jak w scenariuszu A
5. Postaw aplikację z repo GitHub (Dockerfile), ustaw env vars wg `CLAUDE.md` sekcja „Zmienne środowiskowe (Coolify)", przepnij DNS crm.maraf.pl na nowy IP
6. **Uwaga**: wolumen `uploads/` (rysunki, PDF-y) NIE jest w backupie bazy — patrz niżej

### Luka: pliki z wolumenu `uploads/`

Backup Coolify obejmuje **tylko bazę**. Pliki uploadowane (rysunki, karty PDF) leżą na wolumenie Dockera na VPS. TODO: cron na VPS z `rclone sync` wolumenu do tego samego bucketa B2 (prefiks `uploads/`). Do czasu wdrożenia — po większych uploadach warto ręcznie zgrać kopię.

## SMTP (wysyłka maili z aplikacji)

- **Provider**: home.pl
- Konfiguracja przez **UI** w `/settings/SMTP` (NIE env vars)
- Login = adres From: `biuro@novastaffa.pl` (lub jak ustawiono w UI)
- Test mail: `/settings` → sekcja SMTP → „Wyślij test maila"
- **Uwaga**: maile z home.pl mogą trafić do folderu „Oferty" w WP.pl — patrz `docs/oferty-decyzje.md` (subject + headers transactional)

## Google Calendar (integracja OAuth)

Moduł `/calendar` integruje się z Google Calendar przez OAuth 2.0. Kod: `lib/google-calendar.ts` (`getOAuthClient`, `getAuthUrl`), endpointy `/api/calendar/connect` (start OAuth) + `/api/calendar/callback` (odbiór tokenu → tabela `CalendarToken`).

**Google Cloud Console** (https://console.cloud.google.com):
1. Projekt + włączone **Google Calendar API** (APIs & Services → Library → „Google Calendar API" → Enable)
2. **OAuth consent screen**: User type External, scope `.../auth/calendar`. W trybie „Testing" tylko maile z listy „Test users" mogą się podłączyć — dodaj tam adresy które będą podpinać kalendarz.
3. **Credentials → Create credentials → OAuth client ID** (typ: **Web application**):
   - Authorized redirect URI: `https://crm.maraf.pl/api/calendar/callback`

**Coolify env** (server-side — restart kontenera wystarczy, NIE wymaga rebuild bo brak prefiksu `NEXT_PUBLIC_`):
- `GOOGLE_CLIENT_ID` — z Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — z Google Cloud Console
- `GOOGLE_REDIRECT_URI` = `https://crm.maraf.pl/api/calendar/callback`

**Pułapki**:
- `GOOGLE_REDIRECT_URI` musi być **IDENTYCZNY** w Google Cloud Console i w Coolify env — każda różnica (http/https, trailing slash, ścieżka) → błąd `redirect_uri_mismatch`.
- Błąd `Missing required parameter: client_id` (400 invalid_request) = `GOOGLE_CLIENT_ID` nieustawione w Coolify.
- Scope `calendar` jest „sensitive" — publikacja consent screen do „In production" może wymagać weryfikacji Google przy większej liczbie userów; dla kilku osób tryb „Testing" + lista „Test users" w zupełności wystarcza.

## DNS

- Domeny zarządzane gdzie? — sprawdź u rejestratora (home.pl prawdopodobnie)
- Rekordy do skonfigurowania jeśli problemy z dostarczalnością maili:
  - SPF: `maraf.pl TXT "v=spf1 include:_spf.home.pl ~all"`
  - DKIM: w panelu home.pl (jeśli oferują)

## Awaryjne ścieżki

### Coolify nie wpuszcza (zapomniane hasło, błąd logowania)
1. Reset przez „Forgot password?" — wymaga SMTP
2. Jeśli (1) nie zadziała → OVH Manager → KVM Console → `sudo docker exec coolify php artisan password:reset {email}` lub bezpośrednio przez `tinker`

### Aplikacja CRM nie działa (500, biały ekran)
1. Coolify → Deployments → sprawdź ostatni deploy (czy Success czy Failed)
2. Coolify → Logs → sprawdź runtime errors
3. Jeśli baza niedostępna → Coolify → restart usługi PostgreSQL

### Deploy padł
1. Coolify → Deployments → kliknij na failed deploy → **czytaj log DEPLOYMENTU (build), nie log aplikacji** — werdykt („dlaczego failed") jest zawsze na końcu logu builda. Wklej go do nowej sesji Claude'a.
2. Częste przyczyny: OOM podczas `next build` (sprawdź `NODE_OPTIONS=--max-old-space-size=4096` w Dockerfile builder), brak Chromium/libów, błąd TS po zmianie schema bez `prisma generate`
3. ⚠️ **`dockerfile parse error ... ARG names can not be blank` = uszkodzona zmienna środowiskowa w Coolify** (przerabiane 2026-07-16→18: zmienna `cron_secret` z wklejoną instrukcją z docsów zamiast wartości blokowała WSZYSTKIE deploye przez 2 dni). Coolify wstrzykuje każdą env var jako `ARG nazwa=wartość` do Dockerfile przy każdym buildzie — wartość ze spacjami / `<>` / cudzysłowami rozwala parser zanim build ruszy. Szukaj winnej zmiennej w Environment Variables przez **Developer view** (surowy edytor — w zwykłym widoku łatwo ją przeoczyć; sprawdź też Shared Variables projektu/teamu). Zasada: **do formularza zmiennych wkleja się TYLKO gotową wartość** (np. hex z `node -e "..."`), nigdy całą linię instrukcji z dokumentacji.

### Klient nie dostaje maila z ofertą
1. Sprawdź w `/settings` → SMTP → Wyślij test maila — czy SMTP w ogóle działa
2. Sprawdź Coolify Logs → filtruj `oferty.email` lub `mail error`
3. Klient sprawdza folder „Oferty" w WP / „Spam" w Gmail
4. Patrz `docs/oferty-decyzje.md` (headers transactional, subject)
