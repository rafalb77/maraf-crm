# Kręgosłup systemu CRM — infrastruktura, bezpieczeństwo, checklist przed go-live

**Cel pliku**: jedno miejsce na wszystko co fundamentalne — jak działa infrastruktura, jakie zabezpieczenia są w kodzie, co jeszcze trzeba ogarnąć **zanim wpuścimy prawdziwe dane klientów**. Aktualizować przy każdej decyzji architektonicznej.

---

## 1. Architektura — co tam właściwie jest (prostym językiem)

```
🖥️  OVH VPS              = goły serwer w serwerowni OVH (Francja/Polska)
                            IP: 51.178.84.166 — patrz docs/infrastruktura.md
       ↓
🐳  Docker                = silnik kontenerów (lekkie "pudełka" z aplikacjami)
       ↓
🎛️  Coolify               = panel webowy do zarządzania (URL: http://51.178.84.166:8000)
                            uruchamia kontenery, robi deploy z gita, certyfikaty SSL,
                            monitoring, restart, backupy
       ↓
📦  Aplikacja CRM        = Next.js w kontenerze, port 3000 (publiczny: crm.maraf.pl)
📦  PostgreSQL           = baza danych w kontenerze (osobnym)
📦  Volume `uploads/`    = pliki na dysku VPS (karty PDF, zdjęcia, faktury)
```

**Coolify to alternatywa dla Heroku/Vercel** — samohostowana. Płacimy mniej (~50 PLN/mc OVH zamiast ~250 PLN/mc Vercel Pro), ale my odpowiadamy za backup, monitoring, aktualizacje. Bez backupu jeden krzyż dysku = wszystko stracone.

**Wszystkie aktualne dane są na OVH VPS** — baza, pliki, audit log. Dlatego backup MUSI być na **zewnętrznym storage** (inny dysk, najlepiej inna lokalizacja geograficzna).

---

## 2. Stan bezpieczeństwa — co już JEST w kodzie

Pakiet wdrożony **2026-05-15** (commit `a563135`):

### Kontrola dostępu
- ✅ **NextAuth + bcrypt** — hasła haszowane (round 10)
- ✅ **Per-user permissions** (od 2026-05-12) — każdy user ma listę sekcji do których ma dostęp; admin override przez `NEXT_PUBLIC_ADMIN_EMAIL`
- ✅ **Middleware gate** server-side — `middleware.ts` blokuje dostęp do `/api/*` i stron `/(app)/*` bez permission
- ✅ **Sesja 8h** zamiast 30 dni — utracony laptop = max 8h ekspozycji
- ✅ **Rate limiting** logowania (`lib/rate-limit.ts`):
  - per email: 5 prób / 15 min (chroni konkretne konto przed credential stuffing)
  - per IP: 20 prób / 15 min (chroni przed brute force z 1 źródła)

### Ochrona przeglądarki
- ✅ **HTTPS** (Let's Encrypt przez Coolify) — `crm.maraf.pl`
- ✅ **Security headers** (`next.config.js` `headers()`):
  - `Strict-Transport-Security: max-age=15768000` (6 mc HSTS)
  - `X-Frame-Options: SAMEORIGIN` (anti-clickjacking)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
- ⏸ **CSP** świadomie pominięty — zbyt łatwo zablokować legalny ruch (Google Calendar, Open-Meteo, RSS, iframe PDF). Dodać w report-only mode po testach.

### Audit log (RODO Art. 30/32)
- ✅ Model `AuditLog` w schemie (createdAt, userId, userEmail, action, entity, entityId, path, ip, userAgent, metadata JSON)
- ✅ Helper `lib/audit-log.ts` — fire-and-forget (nie blokuje response)
- ✅ Logowane akcje: `LOGIN_SUCCESS`, `LOGIN_FAIL`, `LOGOUT`, `VIEW_CLIENT`, `CREATE`, `UPDATE`, `DELETE`, `EXPORT`, `PERMISSION_CHANGE`, `PASSWORD_RESET_REQUEST`, `PASSWORD_RESET`
- ✅ Integracja w endpointach: `lib/auth.ts` (login), `api/clients` (CRUD), `api/users/[id]/permissions`, `api/auth/reset-password`
- ✅ Widok `/settings/audit-log` (admin) — filtry (action/entity/userEmail) + paginacja 100/strona

### Bezpieczeństwo repo
- ✅ Repo GitHub **private** (od 2026-05-08)
- ✅ `.gitignore` chroni `.env*` (wszystkie warianty)
- ✅ Nie ma hardcoded haseł — wszystko przez `process.env` lub tabelę `Settings`
- ✅ SMTP credentials w DB (przez UI `/settings`), nie env, nie repo

---

## 3. CHECKLIST przed wprowadzeniem prawdziwych danych klientów

### 🔴 KRYTYCZNE (must-have)

- [ ] **Backup bazy** — Coolify → Database → Scheduled Backups → `daily` + S3 (OVH Object Storage / Cloudflare R2 / Backblaze B2). Patrz § 4.
- [ ] **`prisma db push`** w Coolify Terminal — tworzy tabelę `AuditLog`:
  ```bash
  node node_modules/prisma/build/index.js db push --skip-generate
  ```
- [ ] **Audit logu działa** — zaloguj się, otwórz `/settings/audit-log`, sprawdź czy są wpisy `LOGIN_SUCCESS` z Twoim emailem

### ⚖️ FORMALNOŚCI RODO (po Twojej stronie / prawnika)

- [ ] **Rejestr czynności przetwarzania** (RODO Art. 30) — dokument PDF: jakie dane, w jakim celu, gdzie przechowywane (Coolify/OVH), kto ma dostęp
- [ ] **DPA** (umowa powierzenia przetwarzania) z **Coolify Inc.** + **OVH SAS** — ściągnąć ich wzory ze stron, podpisać
- [ ] **Polityka prywatności** na novastaffa.pl — co robicie z danymi klientów, jak długo, prawa klienta (Art. 17, 20, 22)
- [ ] **Klauzula informacyjna RODO** w umowie rezerwacyjnej + formularzach kontaktowych (sprawdzić czy jest w `templates/umowa-rezerwacyjna.docx`)
- [ ] **Zgody marketingowe** — odrębne od umowy sprzedaży, jeśli będziesz mailingować

### 🔐 HIGIENA HASEŁ (po Twojej stronie)

Po incydencie SMTP-hack `bogdan.boruch@maraf.pl` (Synthient breach — hasło wycieklo z innego serwisu):

- [ ] **Bogdan zmienia hasło wszędzie** gdzie używał tego samego (banki, social media, panel Coolify, panel home.pl, panel OVH)
- [ ] **Skan komputera Bogdana** — Microsoft Defender (offline) + Malwarebytes
- [ ] **Wszyscy userzy CRM**: mocne, **unikalne** hasła. Najlepiej menedżer haseł (Bitwarden — darmowy)
- [ ] **`haveibeenpwned.com`** — sprawdzić maile wszystkich userów Marafa, czy nie w wycieku

---

## 4. Backup bazy — gdzie i jak

OVH VPS = jedna lokalizacja. Backup MUSI być POZA tym VPS-em.

### Opcja A: OVH Object Storage (rekomendowana — zostaje w ekosystemie)

**Plus**: jesteś już klientem OVH, brak egress fees między usługami, ~0,01 EUR/GB/mc.

1. **OVH Manager → Public Cloud** (utwórz projekt jeśli nie masz)
2. **Storage → Object Storage → Create container** → np. `maraf-crm-backups`
3. **Users & Roles → Add user → Object Store Operator** → wygeneruj **S3 credentials**
4. Endpoint: `https://s3.{region}.io.cloud.ovh.net` (`waw` = Warszawa, `gra` = Gravelines)
5. **Coolify → Storages → + S3 Storage → S3 Compatible** → wklej endpoint, bucket, Access Key, Secret
6. **Coolify → Database → Scheduled Backups → + New** → Frequency: `daily` (lub `0 2 * * *`), Storage: nowo dodany S3

### Opcja B: Cloudflare R2 / Backblaze B2

Analogicznie — różnice cenowe groszowe dla małej bazy. Konfiguracja identyczna (oba S3-compatible).

### Bonus: OVH Automated Backup (snapshoty całego VPS)

**Niezależne od Coolify** — OVH hypervisor robi snapshoty całego dysku VPS codziennie, trzyma ~7 dni. Włączasz w OVH Manager → Twój VPS → Automated Backup. ~3-5 EUR/mc.

**Po co?**
- Object Storage backup = szybki rollback bazy (np. ktoś coś skasował)
- VPS Automated Backup = disaster recovery (cały serwer padł, hacker zaszyfrował dysk)

**Rekomendacja**: zacznij od Object Storage (groszowy koszt, lepszy niż nic). VPS Automated Backup dodaj jak będziesz mieć kilka tysięcy klientów + transakcje.

---

## 5. Faza 2 — po go-live (1-2 tygodnie po wprowadzeniu danych)

W kolejności priorytetu:

1. **2FA** (TOTP via Google Authenticator) — po incidencie Bogdana wiemy że samo hasło to za mało
2. **Szyfrowanie PESEL w DB** — pgcrypto albo Prisma Field Encryption. Dump bazy bez szyfrowania = wyciek PESELi.
3. **DSR endpoints** — eksport danych klienta (RODO Art. 20) + usunięcie (Art. 17). Dla małej skali można robić ręcznie, ale endpoint jest porządniejszy.
4. **Retencja audit logu** — cron usuwający wpisy > 12 miesięcy (RODO sugeruje minimum 12mc dla audit, więc trzymamy maksimum 24mc)
5. **CSP w report-only mode** — analiza naruszeń, potem enforce
6. **Penetration test** — gdy firma rośnie / przed kontrolą UODO

---

## 6. Decyzje projektowe — krótkie uzasadnienia

| Decyzja | Dlaczego |
|---|---|
| **CSP pominięty** | Google Calendar, Open-Meteo, RSS, iframe PDF, Meta Ads — łatwo zablokować legalny ruch. Lepiej dodać świadomie później w report-only. |
| **Sesja 8h** | Dla CRM z PESEL-ami 30 dni domyślnych NextAuth to za długo. 8h = pełen dzień pracy, rano login. |
| **Rate limit per email + per IP** | Per email chroni konkretne konto (credential stuffing — atakujący zna mail). Per IP chroni przed brute force z jednego źródła. Per IP wyższy bo biuro = jedno IP dla wszystkich. |
| **Audit log selektywny** | Nie każdy request — eksplozja tabeli. Logujemy: login (sukces+fail), VIEW na wrażliwym (klient), CREATE/UPDATE/DELETE, PERMISSION_CHANGE, PASSWORD_RESET. To pokrywa RODO Art. 30/32. |
| **Rate limit in-memory** | Per-proces Map. OK dla Coolify (1 kontener). Klastry → Redis. |
| **Audit fire-and-forget** | `void audit({...})` — nie blokuje response. Błąd zapisu logowany do console, nie psuje operacji user-facing. |
| **Backup tylko na zewnętrzny storage** | Backup na tym samym VPS = brak backupu (jeden krzyż dysku zabija wszystko). |

---

## 7. Mapa dokumentacji — co gdzie

| Plik | Co tam |
|---|---|
| **`docs/system-core.md`** (TEN PLIK) | Architektura, bezpieczeństwo, checklist go-live |
| `docs/infrastruktura.md` | URL-e paneli, hasła awaryjne, SMTP, Google Calendar OAuth |
| `docs/changelog.md` | Niebanalne decyzje techniczne z datami |
| `docs/przeroby-decyzje.md` | Moduł Przeroby (Maraf vs Konrad, protokoły) |
| `docs/oferty-decyzje.md` | Kalkulator ofert, PDF, wysyłka |
| `docs/sprzedaz-decyzje.md` | Umowy rezerwacyjne, generator DOCX |
| `docs/lokale-decyzje.md` | Moduł Lokale (CRUD, import, statusy) |
| `docs/dashboard-decyzje.md` | TopWidget (news, pogoda) |
| `docs/finanse-rozpoczecie.md` | Moduł Finanse (faktury, płatności) — start |
| `docs/meta-ads-decyzje.md` | Integracja Meta Ads — roadmap |
| `docs/integracja-3destate-rozpoczecie.md` | Integracja API 3D Estate (przed launch) |
| `docs/raportowanie-dane-gov-rozpoczecie.md` | Raportowanie cen na dane.gov.pl (obowiązek) |

---

## 8. Akcja w Coolify — szybka ściąga

Po deployu wymagającym zmiany schemy:
```bash
node node_modules/prisma/build/index.js db push --skip-generate
```

Po zmianie env vars:
- `NEXT_PUBLIC_*` — wymaga **REBUILD** (inline w buildtime)
- inne — wystarczy **RESTART** kontenera

Reset hasła Coolify (gdyby SMTP nie działał):
```bash
sudo docker exec coolify php artisan password:reset {email}
```
(przez OVH Manager → KVM Console jeśli zapomnisz hasła do Coolify)
