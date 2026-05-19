# Incident report — skrzynka `bogdan.boruch@maraf.pl` (2026-05-18)

**Status**: 🟡 częściowo opanowane. Hasło zmienione, atakujący odcięty od SMTP. Pozostały zadania po stronie usera (skan komputera, zmiana haseł na innych serwisach, WordPress cleanup, decyzja o migracji poczty).

**Plik dla nowej sesji** — gdy ten temat wraca, czytaj od góry, lista TODO na dole.

---

## Część 1: Hack SMTP `bogdan.boruch@maraf.pl`

### Co się stało

- **2026-05-18**: w skrzynce Bogdana **969 bounce'ów** od „Mail Delivery System" (mailer-daemon@maraf.home.pl)
- Treść spamu: `@QuickMailChecker_bot — All-In-One Checker (Hotmail • MIX • Xbox) • Auto Login` + „Sky Market" — to **credential checker** (narzędzie cybercrime do testowania skradzionych loginów/haseł na innych serwisach: Hotmail, Xbox, etc.)
- Drugi wzorzec: `[undeliverable] SMTP-TEST @R00TXATTACKER` — atakujący nazywa się **„R00TXATTACKER"**, robił test SMTP do `test.smtp.ma@proton.me` (ProtonMail odrzucił rspamd filtrem, `554 5.7.1`)

### Diagnoza: HACK (nie spoofing) — dowody

1. `IdeaMailServer program at host maraf.home.pl` w treści bounce — wysyłka idzie **z serwera home.pl** (gdyby spoofing, bounce by szedł z obcego serwera)
2. `Message-Id: <...@v118.home.net.pl>` — home.pl wystawił prawdziwy Message-Id = **autoryzował wysyłkę** (znajomość loginu+hasła)
3. „Wysłane" w webmailu **puste** — to NIE oznacza braku hacku. Atakujący loguje się przez SMTP (nie webmail), wysyłka SMTP nie ląduje w folderze "Wysłane" w IMAP chyba że klient jawnie zapisuje kopię. Klasyczne dla credential stuffing automatów.

### Źródło wycieku hasła

**Synthient Credential Stuffing 2025** — haveibeenpwned.com pokazał **3 wycieki** dla `bogdan.boruch@maraf.pl`. Synthient agreguje 2 mld unikalnych maili + 1.3 mld haseł z wcześniejszych breachy. **Hasło Bogdana wyciekło z innego serwisu** (LinkedIn? Adobe? coś innego), atakujący odpalił credential stuffing automat na popularne maile, mail Bogdana + hasło pasowały → SMTP otwarty.

### Co zrobione

- ✅ **Zmienione hasło** `bogdan.boruch@maraf.pl` w panelu home.pl (mocne, unikalne)
- ✅ Sprawdzone reguły/forwardy/autoodpowiedzi (brak — atakujący nic nie podstawił)
- ✅ Sprawdzone app passwords (home.pl nie ma)
- ✅ Usunięte 969 bounce'ów ze skrzynki
- ✅ haveibeenpwned: potwierdzony Synthient breach jako źródło

### Działania w CRM po incydencie (2026-05-15, commit `a563135`)

Pakiet zabezpieczeń wdrożony **zanim** wpuścimy prawdziwe dane (gdyby identyczny atak trafił CRM):
- **Rate limiting** logowania: 5 prób/15min per email + 20/15min per IP (chroni przed credential stuffing)
- **Sesja 8h** zamiast 30 dni
- **Audit log**: `LOGIN_SUCCESS` / `LOGIN_FAIL` (z `reason: bad_password` albo `no_user`) z IP — widok `/settings/audit-log`
- **Security headers** (HSTS, X-Frame-Options, etc.)
- Wszystko opisane w `docs/system-core.md`

---

## Część 2: Spam przez zapomnianego WordPressa

### Co się stało

- **2026-05-18** (równolegle z hackiem SMTP, ale **niezwiązane**): mail od „Robertnet" z `biuro@maraf.pl` do `bogdan.boruch@maraf.pl`
- Subject: `[text your-subject]` — placeholder szablonu nie podstawiony (klasyczny ślad bot-spamu)
- Treść: rosyjski tekst — „Куплю Оборудование Китая" (Kupię Sprzęt Chiński), link do `towarkitai.com/products/61817870`
- Pole „Email" nadawcy: `irinazavona@mail.ru`
- **Stopka mail**: `-- This e-mail was sent from a contact form on wordpress (http://maraf.home.pl/autoinstalator/wordpress)`

### Diagnoza: zapomniany WordPress z formularzem bez ochrony

- Ktoś (kiedyś) zainstalował WordPressa przez **autoinstalator home.pl** pod `maraf.home.pl/autoinstalator/wordpress`
- WordPress ma formularz kontaktowy bez CAPTCHA / Akismet
- Spam-bot bombarduje formularz, każde wypełnienie wysyła mail (`From: biuro@maraf.pl`, `To: bogdan.boruch@maraf.pl` — adres odbiorcy zapisany w konfiguracji formularza)

### Weryfikacja zewnętrzna

- WebFetch `http://maraf.home.pl/autoinstalator/wordpress` → **404 publicznie** (strona nieaktywna)
- ALE formularz **wciąż wysyła** maile → WordPress fizycznie istnieje gdzieś (inna ścieżka? crontab? plik PHP zostawiony?)

---

## TODO — co jeszcze musi zrobić user

### 🔴 Krytyczne (przed full go-live CRM)

**Hasło Bogdana użyte gdzie indziej:**
- [ ] **Banki / panele finansowe** — natychmiast, priorytet #1
- [ ] **Google / Microsoft / Apple konta**
- [ ] **Facebook / Instagram / LinkedIn**
- [ ] **Allegro / OLX / inne zakupowe**
- [ ] **Panel home.pl administracyjny** (jeśli inne niż webmail)
- [ ] **Panel Coolify** (http://51.178.84.166:8000)
- [ ] **Panel OVH Manager**
- [ ] **GitHub** (rafalb77@github)
- [ ] **Cloudflare** (jeśli założone tym samym hasłem)
- [ ] **Audit Chrome**: `chrome://password-manager/checkup` — pokaże wszystkie zapisane hasła w wyciekach

**Skan komputera Bogdana:**
- [ ] **Microsoft Defender** (offline scan) + **Malwarebytes** — najprawdopodobniejsze źródło wycieku to keylogger / info-stealer typu RedLine/Raccoon

### 🟡 Pilne (w ciągu tygodnia)

**WordPress cleanup:**
- [ ] W panelu home.pl → **Autoinstalator / Aplikacje** — znaleźć instalację WordPress
  - Jeśli nieużywany → **odinstalować** (autoinstalator usuwa pliki + bazę)
  - Jeśli używany (mało prawdopodobne — Bogdan o tym nie wie) → zabezpieczyć: Akismet plugin + reCAPTCHA + update WP
- [ ] **Tymczasowo** w home.pl → filtr poczty dla `bogdan.boruch@maraf.pl`:
  - Jeśli body zawiera `This e-mail was sent from a contact form on wordpress` → Kosz

**home.pl audit:**
- [ ] Sprawdź czy home.pl ma **2FA** dla webmail / panelu administracyjnego — włącz jeśli oferują
- [ ] Sprawdź czy home.pl ma **IP whitelist** dla SMTP — jeśli tak, ogranicz logowanie SMTP do IP biura Maraf
- [ ] **Historia logowań** w panelu (jeśli oferują) — sprawdź czy nie ma zalogowanych z dziwnych IP / krajów

### 🟢 Strategiczne (do rozważenia)

- [ ] **Migracja poczty do Google Workspace albo Microsoft 365** — oba mają 2FA bezwzględnie + audit log + ochronę przed credential stuffing + lepsze filtry antyspamowe. Koszt: ~30 zł/user/mc. Po takim incydencie warto rozważyć.
- [ ] **Bitwarden / 1Password** dla całego zespołu Maraf — eliminuje problem credential stuffing (każdy serwis = unikalne hasło generowane)
- [ ] **YubiKey** dla kont infrastrukturalnych (Coolify, OVH, GitHub, Cloudflare, banki) — fizyczny 2FA, niemożliwy do phishing

### ⚖️ RODO — sprawdzić czy potrzebne zgłoszenie

**Pytanie kluczowe**: czy w skrzynce `bogdan.boruch@maraf.pl` były **dane osobowe klientów** (umowy, oferty, kontakty)?

- Jeśli **NIE** lub **trudno powiedzieć** — atakujący prawdopodobnie nie czytał maili (tylko SMTP), ryzyko niskie
- Jeśli **TAK** i atakujący mógł je przeglądać → potencjalny **incydent ochrony danych osobowych**. Maraf jako administrator danych ma obowiązek **w ciągu 72 godzin** zgłosić do **UODO** (jeśli istnieje ryzyko dla osób)

To **decyzja prawnika/IOD**. Jeśli macie współpracę z biurem prawnym — zgłosić tam.

---

## Lessons learned

1. **Każda aplikacja na hostingu = attack surface**. Testowy WordPress sprzed lat → źródło spamu. Po testach **odinstalować, nie zostawiać**.
2. **Hasło na własnej domenie ≠ bezpieczne**. Wycieka z innego serwisu (Synthient) → credential stuffing automat → SMTP otwarty. **Tylko unikalne hasła** + **2FA gdzie się da**.
3. **SMTP bez 2FA to fundamentalna słabość**. home.pl/większość hostingów to mają. Migracja do Google/Microsoft to nie luksus, to higiena bezpieczeństwa.
4. **Bounce'y w skrzynce to objaw, nie problem**. Filtrowanie ich = ukrywanie symptomu. Trzeba znaleźć przyczynę (SMTP hack vs WordPress vs spoofing — różne diagnozy, różne fixy).
5. **W CRM zrobione**: po tym incydencie wprowadzony pakiet (rate limit, audit log, sesja 8h, security headers) — patrz `docs/system-core.md` i `docs/changelog.md` 2026-05-15.

---

## Pliki kluczowe / linki

- `docs/system-core.md` — kręgosłup bezpieczeństwa CRM (pakiet po incydencie)
- `docs/changelog.md` — wpisy 2026-05-15 (commit `a563135`)
- `docs/infrastruktura.md` — URL panelu home.pl, OVH, Coolify
- `lib/auth.ts` — rate limiting + audit LOGIN_SUCCESS/LOGIN_FAIL
- `lib/audit-log.ts` — helper audytu
- `app/(app)/settings/audit-log/page.tsx` — widok admina audytu
