# Incident report — skrzynka `bogdan.boruch@maraf.pl` (2026-05-18)

**Status**: 🟡 częściowo opanowane. Hasło zmienione, atakujący odcięty od SMTP. WordPress cleanup wykonany 2026-05-19 (sekcja „Update 2026-05-19" niżej). Pozostały zadania po stronie usera (skan komputera, zmiana haseł na innych serwisach, audyt maraf.pl, decyzja o migracji poczty).

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

## Update 2026-05-19 — kontynuacja diagnostyki + WordPress cleanup

**Status SMTP**: opanowane. Bounce'y które wciąż przychodzą do skrzynki Bogdana to **echa starego ataku** — oryginalne maile mają daty sprzed zmiany hasła (np. `Date: Mon, 18 May 2026 08:00:40 +0300`), zewnętrzne mailery próbują dostarczyć 24-72h i odbijają z opóźnieniem. Wygasną w 2-3 dni same.

### Kontekst szerszy — marcowy hack rafalboruch.com (osobny incydent, 2026-03)

User pokazał raport admina home.pl po przejęciu **rafalboruch.com** (osobna domena Rafała, hosting na tym samym koncie home.pl):

- Strona przejęta przez **brak aktualizacji** + nieobsługiwane pluginy (carousel-without-jetpack, googleanalytics, google-sitemap-generator/plugin, jquery-pin-it-button-for-images, pinterest-for-galleries, wp-multibyte-patch, yikes-inc-easy-mailchimp-extender — wszystkie usunięte)
- Usunięci **wirusowi administratorzy** dodani przez infekcję
- Ukryte wpisy spamerskie dodawane **od 2020 roku** (5 lat ukrytego dostępu) — wyczyszczone
- Naprawione: motyw **The Gem** update, WordPress core update, PHP 8.5, MySQL 8.0
- Zainstalowane: **Wordfence + AIOS** (All-In-One Security)
- Backup: **UpdraftPlus**
- Adres logowania zmieniony na `https://www.rafalboruch.com/administracja`
- Stare pliki przeniesione do `/do-usuniecia/` (zalecenie: usunąć po weryfikacji)
- ⚠️ **maraf.pl NIE była audytowana** w marcu — tylko rafalboruch.com. Stan WP maraf.pl nieznany, motyw envision z ~2013, prawdopodobnie analogiczne ryzyko jak miała rafalboruch.com przed marcowym audytem.

### Inwentaryzacja WordPressów na koncie home.pl

| Instalacja | Status |
|---|---|
| `/autoinstalator/wordpress` (zombie, 2013-07-27, brak domeny) | ✅ Skasowana 2026-05-19 |
| `/autoinstalator/wordpress` (zombie, 2014-04-02, brak domeny) | ✅ Skasowana 2026-05-19 |
| `/autoinstalator/wordpress1` (fotografia-lodz.pl, 2013-08-23) | ✅ Skasowana 2026-05-19 |
| `/autoinstalator/wordpressplugins3` (novastaffa.pl, 2025-07-03) | ⛔ Nie ruszać — żywa strona firmy |
| `/www/maraf.pl/` (poza autoinstalatorem, motyw envision z ~2013) | 🔴 **Do audytu** — może być w stanie sprzed marcowego audytu rafalboruch.com |
| `/www/rafalboruch.com/` (po marcowym audycie) | 🟡 Folder modyfikowany 2026-05-18 mimo "nic nie robiłem od miesiąca" — sprawdzić co (Wordfence task vs nowy atak) |
| `/www/novastaffa.pl/` | OK (żywa, edytowana legalnie) |
| `/do-usuniecia/` (root) | 🟡 Ticket do home.pl wysłany — FileZilla nie kasuje (UID 31189 = admin home.pl, my mamy inny UID) |

**Skutek cleanupu zombie**: stopka spamu `[text your-subject]` (Andreafaith, Bill, irinazavona@mail.ru) pochodziła z formularza kontaktowego zombie WP w `/autoinstalator/wordpress` — po kasacji spam przestanie przychodzić w godzinach.

### SSL maraf.pl — fałszywy alarm

Z komputera Rafała **Avast Antivirus MITM-uje HTTPS** i wstawia własny cert (`CN=Avast Web/Mail Shield Root, OU=generated by Avast Antivirus for SSL/TLS scanning`). Wyglądało jak brak SSL na maraf.pl. **Prawdziwy cert serwera home.pl jest OK** (potwierdzone przez crt.sh + bezpośredni fetch z serwera Anthropic):

- Wystawca: **home.pl S.A.** (zaufana CA: `C=PL, O=home.pl S.A., CN=home pl DV TLS G2 R35 CA`)
- CN: `rafalboruch.com`, SAN: `maraf.pl`, `www.maraf.pl`, `www.rafalboruch.com` (homeSSL Start Multidomain 3 domeny)
- Ważny do **2027-03-12**
- Chrome bezpośrednio mówi „Połączenie jest bezpieczne" (Chrome ma własny store certów, omija schannel/Avast)

**TODO Rafał**: wyłączyć Avast HTTPS scanning (Settings → Protection → Core Shields → Web Shield → Enable HTTPS scanning OFF), ewentualnie odinstalować Avast (Windows Defender wystarcza, nie robi MITM).

### Ticket do home.pl

Wysłany 2026-05-19: prośba o skasowanie katalogu `/do-usuniecia/` (FileZilla nie kasuje — folder należy do UID 31189 = admin home.pl, FTP user Rafała ma inny UID). Czekamy 1-2 dni.

---

## Otwarte sprawy po 2026-05-19

### 🔴 Priorytet (przed full go-live CRM)

- [ ] **Audyt wp-admin maraf.pl** — wersja WP, lista aktywnych pluginów, instalacja security pluginów (Wordfence/AIOS jeśli brak), lista administratorów (szukanie wirusowych jak na rafalboruch.com w marcu), sprawdzenie co konkretnie zmodyfikowano dziś (cache vs backdoor), konfiguracja CloudFW (widoczna w zakładkach Chrome'a Rafała). **Realne ryzyko: powtórka marcowego scenariusza, tym razem na maraf.pl**.
- [ ] **rafalboruch.com modyfikowane 2026-05-18** mimo że Rafał nic nie robił od miesiąca — wejść w Wordfence Live Traffic + ostatnie logowania administratora w `/administracja`. Może to UpdraftPlus / WP auto-update (legit), może nowy atak po marcowym czyszczeniu.

### 🟡 Pilne (w ciągu tygodnia)

- [ ] **Lista wszystkich skrzynek @maraf.pl** w panelu home.pl + prewencyjna zmiana haseł (zwłaszcza dla skrzynek z prostymi/krótkimi hasłami — admini home.pl ostrzegali: „są zbyt krótkie i łatwe do złamania")
- [ ] **TODO Bogdana** (niezmienione od 2026-05-18): skan komputera Microsoft Defender offline + Malwarebytes, zmiana haseł na innych serwisach (banki, Google, FB, Allegro, Coolify, OVH, GitHub, Cloudflare, panel home.pl administracyjny)
- [ ] Wyłączyć **Avast HTTPS scanning** na komputerze Rafała

### 🟢 Strategicznie

- Migracja poczty `@maraf.pl` z home.pl do **Google Workspace / Microsoft 365** (2FA wymuszone, audit log, ochrona przed credential stuffing)
- **Bitwarden / 1Password** dla całego zespołu Maraf
- WordPress maraf.pl: po audycie zdecydować — pełen update + Wordfence/AIOS (jak rafalboruch.com w marcu) albo migracja na statyczny Next.js / headless

---

## Lessons learned

1. **Każda aplikacja na hostingu = attack surface**. Testowy WordPress sprzed lat → źródło spamu. Po testach **odinstalować, nie zostawiać**.
2. **Hasło na własnej domenie ≠ bezpieczne**. Wycieka z innego serwisu (Synthient) → credential stuffing automat → SMTP otwarty. **Tylko unikalne hasła** + **2FA gdzie się da**.
3. **SMTP bez 2FA to fundamentalna słabość**. home.pl/większość hostingów to mają. Migracja do Google/Microsoft to nie luksus, to higiena bezpieczeństwa.
4. **Bounce'y w skrzynce to objaw, nie problem**. Filtrowanie ich = ukrywanie symptomu. Trzeba znaleźć przyczynę (SMTP hack vs WordPress vs spoofing — różne diagnozy, różne fixy).
5. **W CRM zrobione**: po tym incydencie wprowadzony pakiet (rate limit, audit log, sesja 8h, security headers) — patrz `docs/system-core.md` i `docs/changelog.md` 2026-05-15.
6. **Inwentaryzacja hostingu raz na rok** (lessons z 2026-05-19). Konto home.pl Rafała miało 4 instalacje WP — 2 zombie z 2013/2014 bez przypisanej domeny, 1 zapomniana fotografia-lodz.pl. Każda = nieaktualizowany attack surface. **Co najmniej raz na 6 miesięcy** przejrzeć panel autoinstalatora + `/www` w FTP — wszystko czego nie używasz odinstalować.
7. **Avast (i podobne AV) MITM-uje HTTPS** (lessons z 2026-05-19). Jeśli widzisz dziwne problemy z certem, sprawdź najpierw issuer — jeśli `Avast Web/Mail Shield Root` → to Twój lokalny AV, nie serwer. Dla dewelopera robi to debugowanie potwornie trudnym. Windows Defender nie robi MITM — zalecany.
8. **Echa bounce'ów po ataku trwają 24-72h** (lessons z 2026-05-19). Mailery zewnętrzne ponawiają próby dostarczenia przez dni — bounce'y wracają z opóźnieniem nawet PO odcięciu atakującego. Nie panikować i nie zmieniać hasła kolejny raz tylko dlatego że bounce'y wciąż lecą. Sprawdzić `Date:` w treści bounce'a — jeśli sprzed odcięcia → echo, jeśli świeży → atak nadal trwa.

---

## Pliki kluczowe / linki

- `docs/system-core.md` — kręgosłup bezpieczeństwa CRM (pakiet po incydencie)
- `docs/changelog.md` — wpisy 2026-05-15 (commit `a563135`)
- `docs/infrastruktura.md` — URL panelu home.pl, OVH, Coolify
- `lib/auth.ts` — rate limiting + audit LOGIN_SUCCESS/LOGIN_FAIL
- `lib/audit-log.ts` — helper audytu
- `app/(app)/settings/audit-log/page.tsx` — widok admina audytu
