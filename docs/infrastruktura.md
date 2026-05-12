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
- Backup: TODO (na razie brak automatycznego)
- Migracje: NIE używamy `prisma migrate` — tylko `prisma db push` po zmianie schema

## SMTP (wysyłka maili z aplikacji)

- **Provider**: home.pl
- Konfiguracja przez **UI** w `/settings/SMTP` (NIE env vars)
- Login = adres From: `biuro@novastaffa.pl` (lub jak ustawiono w UI)
- Test mail: `/settings` → sekcja SMTP → „Wyślij test maila"
- **Uwaga**: maile z home.pl mogą trafić do folderu „Oferty" w WP.pl — patrz `docs/oferty-decyzje.md` (subject + headers transactional)

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
1. Coolify → Deployments → kliknij na failed deploy → wklej logi do nowej sesji Claude'a
2. Częste przyczyny: OOM podczas `next build` (sprawdź `NODE_OPTIONS=--max-old-space-size=4096` w Dockerfile builder), brak Chromium/libów, błąd TS po zmianie schema bez `prisma generate`

### Klient nie dostaje maila z ofertą
1. Sprawdź w `/settings` → SMTP → Wyślij test maila — czy SMTP w ogóle działa
2. Sprawdź Coolify Logs → filtruj `oferty.email` lub `mail error`
3. Klient sprawdza folder „Oferty" w WP / „Spam" w Gmail
4. Patrz `docs/oferty-decyzje.md` (headers transactional, subject)
