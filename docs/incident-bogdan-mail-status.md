# Incident report — skrzynka `bogdan.boruch@maraf.pl` (2026-05-18)

**Status**: 🟡 częściowo opanowane. Hasło zmienione, atakujący odcięty od SMTP. WordPress cleanup wykonany 2026-05-19 (sekcja „Update 2026-05-19" niżej). Maile od początku roku które „zniknęły" odnalezione w Koszu Outlooka — backup PST + przywrócenie zaplanowane (sekcja „Update 2026-05-19 (wieczór)"). Hipoteza wycieku hasła z publicznego repo GitHub sprawdzona i odrzucona — pozostaje Synthient credential stuffing. Pozostały zadania po stronie usera (skan komputera, zmiana haseł na innych serwisach, audyt maraf.pl, czekanie na logi IMAP od home.pl, decyzja o migracji poczty).

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

## Update 2026-05-19 (wieczór) — odkryte skasowane maile + sprawdzenie git + nowy timeline

### Skasowane maile od początku roku — odzyskane w Koszu Outlooka

Rafał wieczorem 2026-05-19 odkrył, że **wszystkie maile od początku roku zniknęły** ze skrzynki bogdan.boruch@maraf.pl (zarówno z Inbox, jak i z serwera). Pierwsza reakcja: ocena 🔴 — atakujący miał pełny dostęp IMAP + skasował. Po sprawdzeniu Outlooka Bogdana: **maile są w folderze Kosz/Deleted Items** (move-to-trash, nie permanent delete). **Bogdan zarzeka się, że nie kasował.**

**Krytyczne instrukcje przekazane userowi**:
- NIE OPRÓŻNIAĆ Kosza
- Wyłączyć auto-empty kosza (Outlook → Options → Advanced → odznacz „Empty Deleted Items folder when exiting Outlook")
- Backup PST całego konta zanim Outlook się zsynchronizuje (File → Open & Export → Export to .pst)
- Przywrócić maile z Kosza do Inboxu (Ctrl+A → Move → Inbox)

**Trzy realne scenariusze**:
1. **Bogdan jednak skasował nieświadomie** — najbardziej prawdopodobne (Ctrl+A → Del, „pokaż nieprzeczytane" + zaznacz wszystko + przenieś, etc.)
2. **Reguła w Outlooku** — auto-przeniesienie do kosza (sprawdzić w Outlook → File → Manage Rules & Alerts)
3. **Atakujący IMAP** — jeśli to samo hasło SMTP=IMAP=webmail w home.pl, atakujący technicznie miał dostęp. Kasacja do Kosza (nie Shift+Delete) byłaby dziwna jak na bota, ale możliwa. **Mniej prawdopodobne**

To rozstrzygną **logi home.pl** (zażądane w tickecie). Login IMAP z obcego IP w okresie kasacji → scenariusz 3.

### Potwierdzenie z DMARC (2026-05-25): atakujący NIE wysyła już z maraf.pl

Po dodaniu rekordu DMARC (2026-05-25, w ramach naprawy dostarczalności — patrz `docs/dostarczalnosc-maili-maraf-status.md`) przyszedł pierwszy agregowany raport od Google. Zawiera **tylko jeden source_ip: `89.161.166.193` (legalny serwer maraf.pl)**, z SPF pass + DKIM pass. Gdyby atakujący nadal wysyłał z maraf.pl z obcego IP, pojawiłby się drugi rekord z innym IP i fail. Brak takiego = **niezależne potwierdzenie (Google) że zmiana hasła skutecznie odcięła atakującego od SMTP maraf.pl**. DMARC `rua=` będzie dalej monitorował — jeśli haker wróci z innego IP, zobaczymy to w raportach.

### Nowy timeline ataku — wcześniejszy niż zakładaliśmy

Rafał znalazł nowy ślad w mailach Bogdana: **niedziela 2026-05-17 o 11:54 — test SMTP z bogdan.boruch@maraf.pl do bogdan.boruch@maraf.pl**. To **dzień przed** głównym odkryciem incydentu.

To **klasyczny pattern bota credential stuffing**: po znalezieniu pasujących credentials bot najpierw testuje SMTP (wysyła test mail do siebie potwierdzający że relay działa), POTEM rozpoczyna masówkę. Czyli:

```
17.05 (niedziela) 11:54 → atakujący testuje SMTP
17-18.05            → atakujący rozpoczyna masówkę
18.05 (poniedziałek)→ 969 bounce'ów zauważone w skrzynce, odkrycie incydentu
18.05               → zmiana hasła, atakujący odcięty od SMTP
19.05               → echo bounce'ów (24-72h retry zewnętrznych mailerów)
19.05               → diagnostyka, WordPress cleanup, odkrycie skasowanych maili
```

R00TXATTACKER (handle z bounce'ów) to znany pattern handlu skradzionymi SMTP credentials na darknetach. Sygnatura zgodna.

### Hipoteza „wyciek z publicznego repo na GitHub" — SPRAWDZONA i ODRZUCONA

Rafał zaproponował hipotezę: repo było **publiczne do 2026-05-08** (10 dni przed atakiem), może hasło Bogdana wyciekło stamtąd przez bot-scrapery GitHub'a.

Sprawdziłem git history:
- ❌ `.env` nigdy nie był commitowany — tylko `.env.example` z placeholderami (`zmien-natychmiast-po-pierwszym-logowaniu`)
- ❌ Brak hardcoded credentials w kodzie (sprawdzone pattern `password = "..."` z prawdziwymi wartościami)
- ❌ `bogdan.boruch@maraf.pl` nigdy nie występował w żadnym pliku w historii repo — pierwsze wzmianki to `docs/incident-bogdan-mail-status.md` z 2026-05-19 (po incydencie)
- ❌ `prisma/seed.ts` używa `process.env.ADMIN_PASSWORD`, brak hardcoded
- ✅ `data/karty/` (karty mieszkań z cenami) dodane 2026-05-13 — **po** zmianie repo na private. Nigdy nie były publiczne.
- ⚠️ Publiczne w okresie 2026-05-05 → 2026-05-08: kod aplikacji + `data/przedmiary/maraf.xlsx` (obmiary inżynieryjne, nie credentials ani dane klientów)

**Konkluzja**: hasło Bogdana **nigdy nie istniało w repo**. Publiczne repo wyciekło co innego (kod, struktura aplikacji, plik obmiarów budowlanych) — biznesowo niefortunne, ale nie wyjaśnia kompromitacji SMTP.

**Najbardziej prawdopodobna hipoteza pozostaje pierwotną**: **Synthient credential stuffing**. Hasło Bogdana wyciekło z **innego serwisu** (jakieś forum / shop / social media gdzie używał tego samego hasła) — Synthient breach na haveibeenpwned to potwierdza (3 wycieki dla tego adresu).

### Nowe lekcje
→ Dopisane do sekcji „Lessons learned" na końcu pliku (punkty #9-11).

---

## Otwarte sprawy po 2026-05-19

### 🔴 Priorytet (przed full go-live CRM)

- [ ] **Sprawdzić pełne nagłówki maila QuickMailChecker_bot który otrzymał Rafał** (zgłoszone 2026-05-19 wieczór, laptop chwilowo niedostępny). To **dokładnie ten sam handle** co w bounce'ach wysyłanych z konta Bogdana — pytanie kluczowe: czy nadawca to `bogdan.boruch@maraf.pl` (scenariusz A: stara masówka sprzed odcięcia, kanał już zamknięty), czy `biuro@/info@/inne @maraf.pl` (scenariusz B: **druga skrzynka zhackowana, incydent trwa**), czy obcy adres (scenariusz C: zewnętrzna kampania spamu). Z pełnych nagłówków: From, Received chain, Message-Id, Authentication-Results (SPF/DKIM/DMARC), X-Authenticated-User — rozstrzygnie 100%. Outlook → File → Properties → Internet headers, albo webmail home.pl → View source.
- [ ] **Audyt wp-admin maraf.pl** — wersja WP, lista aktywnych pluginów, instalacja security pluginów (Wordfence/AIOS jeśli brak), lista administratorów (szukanie wirusowych jak na rafalboruch.com w marcu), sprawdzenie co konkretnie zmodyfikowano dziś (cache vs backdoor), konfiguracja CloudFW (widoczna w zakładkach Chrome'a Rafała). **PRIORYTET ZMNIEJSZONY 🔴→🟡 (2026-05-19 wieczór)**: sprawdzone reputacja maraf.pl na 3 niezależnych źródłach (Google Safe Browsing, 6 DNSBL spamowych, Proton VPN malware engine) — **WSZYSTKIE CZYSTE, brak sygnałów obecnej infekcji**. Proton VPN blokował maraf.pl tylko przez listę „ads & trackers" (WP ma Google Analytics/podobne — nieszkodliwe), nie malware — potwierdzone przełączeniem NetShield na „malware only" (strona się otworzyła). Czyli audyt to teraz **prewencja** (envision 2013 nieaktualizowany = ryzyko przyszłe, znane CVE), nie gaszenie pożaru. IP `89.161.166.193` czysty na zen.spamhaus/spamcop/barracuda/sorbs/cbl/uceprotect.
- [ ] **rafalboruch.com modyfikowane 2026-05-18** mimo że Rafał nic nie robił od miesiąca — wejść w Wordfence Live Traffic + ostatnie logowania administratora w `/administracja`. Może to UpdraftPlus / WP auto-update (legit), może nowy atak po marcowym czyszczeniu.
- [ ] **Backup PST + przywrócenie maili Bogdana** z Outlook Kosza do Inboxu (Bogdan: NIE OPRÓŻNIAĆ KOSZA, wyłączyć auto-empty w Options → Advanced, eksport PST, potem Move → Inbox). Po przywróceniu zweryfikować że maile wróciły też na serwer (jeśli IMAP).
- [ ] **Czekać na logi IMAP od home.pl** (ticket wysłany 2026-05-19) — to rozstrzygnie scenariusz kasacji maili: Bogdan user-error vs reguła Outlook vs atakujący IMAP. Jeśli pokażą login z obcego IP → potencjalne RODO, konsultacja z prawnikiem/IOD.
- [ ] **Sprawdzić reguły w Outlook** (File → Manage Rules & Alerts) — wykluczyć auto-delete / auto-move
- [ ] **Sprawdzić typ konta pocztowego** Bogdana (IMAP/POP3 — File → Account Settings) — wpływa na to czy lokalna kopia synchronizuje się z serwerem

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
9. **Maile w Koszu klienta pocztowego po pozornej kasacji z serwera** (lessons z 2026-05-19 wieczór). Zanim panika RODO — **najpierw sprawdzić Outlook/Thunderbird Trash** + lokalny PST/OST. Klient pocztowy synchronizuje przez IMAP, ale lokalna kopia może żyć dłużej niż na serwerze. Procedura: `[backup PST → przywróć z kosza → ponowna synchronizacja]` zanim ogłosi się incydent danych osobowych.
10. **Każdy ślad SMTP-TEST w skrzynce to czerwony alarm** (lessons z 2026-05-19 wieczór). Bot credential stuffing **zawsze** testuje SMTP przed masówką — wysyła mail do siebie / na publiczny adres testowy (proton.me, gmail.com). Jeśli widzisz mail `From: ja@moja-domena.pl To: ja@moja-domena.pl Subject: SMTP-TEST` którego nie wysyłałeś — bot potwierdził działanie SMTP i za chwilę odpali masówkę. **Reaguj natychmiast, nie czekaj na bounce'y.** Pattern: test w niedzielę 2026-05-17 11:54 → masówka 2026-05-18.
11. **Sprawdzenie hipotezy „wyciek z gita" — szybkie i konkretne** (lessons z 2026-05-19 wieczór). Komendy: `git log --all -p -S "<wartość>"` szuka kiedy dany string był dodany/usunięty. `git log --all --diff-filter=D --name-only` lista plików kiedyś tracked, potem usuniętych. `git ls-tree -r <commit> --name-only` snapshot drzewa w danym momencie. 5 minut roboty, daje pewną odpowiedź. **W tym przypadku: hasło Bogdana nigdy nie istniało w repo, hipoteza odrzucona.**

---

## Pliki kluczowe / linki

- `docs/system-core.md` — kręgosłup bezpieczeństwa CRM (pakiet po incydencie)
- `docs/changelog.md` — wpisy 2026-05-15 (commit `a563135`)
- `docs/infrastruktura.md` — URL panelu home.pl, OVH, Coolify
- `lib/auth.ts` — rate limiting + audit LOGIN_SUCCESS/LOGIN_FAIL
- `lib/audit-log.ts` — helper audytu
- `app/(app)/settings/audit-log/page.tsx` — widok admina audytu
