# Outlook Rafała — recreate konta po zmianie hasła (kontynuacja jutro w biurze)

**Plik dla nowej sesji** — kontynuacja wieczornej rozmowy 2026-05-19 (po incydencie Bogdan SMTP hack). Czytaj od góry, plan na dole.

---

## Skąd ten temat

Po incydencie hack SMTP Bogdana (2026-05-18, patrz `docs/incident-bogdan-mail-status.md`) Rafał zdecydował **profilaktycznie zmienić hasło** swojej skrzynki `rafal.boruch@maraf.pl`. Hasło zmienione w panelu home.pl (data: 2026-05-19 wieczór). **Webmail home.pl wpuszcza z nowym hasłem** → potwierdzone że zmiana zapisana poprawnie po stronie serwera.

Problem: **Outlook nie chce zaakceptować nowego hasła**. Komunikat:

> Wystąpił problem i program Outlook nie może zapisać ustawień konta. Spróbuj ponownie.

**Specyfika:**
- Błąd **specyficzny dla tej jednej skrzynki** (`rafal.boruch@maraf.pl`) — inne skrzynki w tym samym Outlooku Rafał może aktualizować bez problemu
- Błąd występuje na **dwóch różnych komputerach Rafała** jednocześnie → problem **nie jest lokalny** (Credential Manager, profil Outlooka, antywirus per maszyna)
- Najprawdopodobniej oba Outlooki bombardują home.pl starym hasłem w pętli IMAP → home.pl uruchomił **blokadę brute-force** specyficznie na IMAP (web działa, IMAP nie)

## Diagnoza Credential Manager (2026-05-19 wieczór)

Sprawdzone w cmd:
```cmd
cmdkey /list | findstr /i "rafal"        → tylko "User: rafalb77" (to GitHub user)
cmdkey /list | findstr /i "home.pl"      → puste
cmdkey /list | findstr /i "outlook"      → puste
cmdkey /list | findstr /i "microsoftoffice" → puste
```

**Wniosek**: Outlook NIE trzyma credentials dla rafal.boruch@maraf.pl w Credential Manager. Hasło siedzi w jednym z trzech miejsc alternatywnych:
1. **Rejestr** — `HKCU\Software\Microsoft\Office\16.0\Outlook\Profiles\<profil>\<konto>` (zaszyfrowane DPAPI)
2. **Microsoft Account / cloud vault** — jeśli Outlook traktuje konto jako Microsoft Account (błędny autodiscover)
3. **Windows Hello / Web Account Manager** — typowe dla New Outlook

Bez sprawdzenia wersji Outlooka i typu konta nie wiemy które dokładnie — ale **nie ma to znaczenia dla rozwiązania**, bo idziemy ścieżką recreate konta która omija problem.

## Niesprawdzone (do potwierdzenia jutro w biurze)

- [ ] Wersja Outlooka (Classic / New Outlook / aplikacja Mail z Windows) — File → Office Account → About Outlook
- [ ] Typ konta (IMAP / POP3 / Microsoft 365) — File → Account Settings → typ widoczny w kolumnie

---

## Plan na jutro — bezpieczna procedura recreate

### 1. STOP wszystkim Outlookom — na OBU komputerach jednocześnie

To krytyczne. Dopóki jeden Outlook bombarduje home.pl starym hasłem, blokada IMAP nie wygaśnie.

- Ctrl+Shift+Esc → zakończ wszystkie procesy `OUTLOOK.EXE`, `olk.exe`
- Albo: wyłącz Wi-Fi na obu kompach przed wszystkim

### 2. Eksport reguł Outlooka (zanim cokolwiek innego)

Reguły są zapisane per profil/konto — po recreate **mogą zniknąć** lub stracić powiązanie z folderami. Eksport ratuje przed utratą.

Classic Outlook:
- **Plik → Zarządzaj regułami i alertami** (Manage Rules & Alerts)
- **Opcje** (Options) w prawym górnym rogu okna
- **Eksportuj reguły** → zapisz np. `C:\Backup\rafal-reguly-2026-05-20.rwz`

### 3. Backup PST całego konta

Mimo że to IMAP (zakładamy) — backup chroni przed:
- Lokalnymi archiwami które mogły być utworzone (folder "Personal", "Archive")
- Folderami custom poza standardowymi
- 5-10 minut, jednorazowa asekuracja

- **Plik → Otwórz i eksportuj → Importuj/Eksportuj**
- **Eksportuj do pliku** → **Plik danych Outlook (.pst)**
- Zaznacz całe konto `rafal.boruch@maraf.pl` + ✅ **Uwzględnij podfoldery**
- Zapisz np. `C:\Backup\rafal-2026-05-20.pst`
- Opcjonalnie ustaw hasło do PST (zapamiętaj!)

### 4. Sprawdź typ konta przed kasowaniem

- **Plik → Ustawienia konta → Ustawienia konta**
- Wybierz `rafal.boruch@maraf.pl` → patrz kolumna **Typ**:
  - **IMAP/SMTP** → recreate bezpieczny (maile na serwerze, lokalny cache odtworzy się)
  - **POP/SMTP** → ⚠️ zatrzymaj się, POP3 może mieć tylko lokalne maile. Sprawdź w ustawieniach POP3 czy „Pozostaw kopie wiadomości na serwerze" było włączone. Jeśli nie — backup PST z punktu 3 to JEDYNE źródło prawdy
  - **Microsoft 365 / Exchange** → autodiscover poszedł złą ścieżką, trzeba ręcznie przeprowadzić jako IMAP

### 5. Recreate konta — Wariant A

Klasyczny Outlook:
- **Windows + R** → `control mlcfg32.cpl` → Enter (alternatywa: Panel sterowania → szukaj „Mail" → **Mail (Microsoft Outlook)**)
- **Pokaż profile** → wybierz profil (zwykle „Outlook") → **Właściwości**
- **Konta poczty e-mail**
- Zaznacz `rafal.boruch@maraf.pl` → **Usuń** → Potwierdź
- **Nowe** → wpisz `rafal.boruch@maraf.pl` → wybierz IMAP/POP3 jeśli pyta (zwykle IMAP) → **NOWE hasło** → Outlook autodetektnie ustawienia z home.pl
- Ustawienia serwera — **ZWERYFIKOWANE 2026-05-19** (testem TCP, nie zgadywane):
  - **IMAP (poczta przychodząca)** — host **`poczta.home.pl`**, port `993`, SSL/TLS
  - **SMTP (poczta wychodząca)** — host **`poczta.home.pl`**, port `465` SSL/TLS (lub `587` STARTTLS — oba otwarte), uwierzytelnianie wymagane (te same dane co IMAP)
  - ⚠️ **NIE wpisywać `maraf.pl` ani `imap.home.pl` jako serwera** — `maraf.pl` to domena (nie nasłuchuje na 993), `imap.home.pl` NIE ISTNIEJE w DNS. Błąd „nie można odnaleźć serwera poczty" 2026-05-19 wynikał z wpisanego `maraf.pl` w polu Serwer. Poprawny host dla home.pl to `poczta.home.pl` (ten sam co webmail).
- **Zakończ**

New Outlook (jeśli okaże się że to ta wersja):
- **Settings (zębatka) → Accounts → Email accounts**
- Wybierz `rafal.boruch@maraf.pl` → **Manage** → **Remove account**
- **+ Add account** → wpisz adres + nowe hasło

### 6. Import reguł

Po recreate konta i pierwszym sync:
- **Plik → Zarządzaj regułami i alertami → Opcje → Importuj reguły**
- Wybierz `.rwz` z punktu 2
- Niektóre reguły mogą wymagać re-mapowania folderu docelowego — przejdź przez listę, klikaj „Edytuj" gdzie widać błąd

### 7. Powtórz całość na drugim komputerze

Sekwencja identyczna. **Krytyczne**: dopóki na drugim kompie nie zrobisz tego samego, tamten Outlook dalej będzie bombardował home.pl starym hasłem i wywoła ponowną blokadę IMAP.

---

## Po skończeniu — wracamy do otwartych spraw incydentu

Po recreate konta → wracamy do `docs/incident-bogdan-mail-status.md` sekcja **„Otwarte sprawy"**:

### 🔴 Priorytet

- [ ] **Sprawdzić pełne nagłówki maila QuickMailChecker_bot który otrzymał Rafał** (Outlook → File → Properties → Internet headers, albo webmail home.pl → View source). Trzy scenariusze (A: stara masówka Bogdana sprzed odcięcia → kanał zamknięty; B: druga skrzynka @maraf.pl zhackowana → incydent trwa; C: zewnętrzna kampania spamu z leaked list). Z nagłówków rozstrzygnięcie 100%.
- [ ] **Backup PST Bogdana** + przywrócenie maili z Kosza Outlooka do Inboxu (wczoraj odkryte że są tam, nie skasowane permanentnie)
- [ ] **Audyt wp-admin maraf.pl** (motyw envision 2013, prawdopodobnie nieaudytowany — analogiczne ryzyko jak rafalboruch.com przed marcowym hackiem)
- [ ] **rafalboruch.com modyfikowane 2026-05-18** mimo „nic nie robiłem od miesiąca" — wejść w Wordfence Live Traffic
- [ ] **Czekać na logi IMAP od home.pl** (ticket wysłany) — rozstrzygnie scenariusz kasacji maili Bogdana

### 🟡 Pilne

- [ ] **Lista wszystkich skrzynek @maraf.pl** w panelu home.pl + prewencyjna zmiana haseł
- [ ] **TODO Bogdana**: skan komputera Defender + Malwarebytes, zmiana haseł na innych serwisach
- [ ] Wyłączyć **Avast HTTPS scanning** na komputerze Rafała

---

## Update 2026-05-19 (późny wieczór) — konto skonfigurowane, dwie sprawy

**Outlook na komputerze #1 — DZIAŁA.** Klucz: serwer to **`poczta.home.pl`** (nie `maraf.pl`, nie `imap.home.pl`). Po wpisaniu poprawnego serwera konto się połączyło i ruszyła synchronizacja. Pozostały drobiazg: błąd `0x80040119` „nie można zapisać w folderze Elementy wysłane — Outlook w trybie offline lub serwer nie zezwala". Przyczyna prawie na pewno: **Outlook w trybie offline** (przełączony wcześniej żeby chronić maile). Fix: wstążka → Wysyłanie/odbieranie → wyłącz „Pracuj w trybie offline". Jeśli zostanie po przejściu online → zmapować folder Sent (Plik → Ustawienia konta → Zmień → Więcej ustawień → Foldery wysłanych elementów → wskazać folder „Wysłane"/„Sent" serwera).

**Reputacja maraf.pl — sprawdzona, CZYSTA.** Proton VPN blokował stronę. Sprawdzone 3 niezależne źródła: Google Safe Browsing (czysto), 6 DNSBL spamowych (czysto), Proton malware engine (czysto — po przełączeniu NetShield na „malware only" strona się otworzyła). Blokada była przez listę „ads & trackers" (WordPress ma Google Analytics/podobne — nieszkodliwe). **Brak sygnałów infekcji maraf.pl.** Audyt WP nadal warto zrobić prewencyjnie (envision 2013), ale to nie pożar.

**KOMPUTER #1 — ✅ ZAMKNIĘTE.** Pełna synchronizacja zakończona: folder Sent ma 2000+ maili (cała historia). Maile rafal.boruch@maraf.pl były bezpieczne na serwerze (w przeciwieństwie do skrzynki Bogdana). Błąd „Elementy wysłane" był trybem offline — po przejściu online wysyłka działa.

**TODO komputer #2**: powtórzyć konfigurację konta z serwerem `poczta.home.pl`. Nie powtarzać błędu z `maraf.pl`/`imap.home.pl` w polu Serwer. Po połączeniu sprawdzić że nie został w trybie offline (wstążka → Wysyłanie/odbieranie).

---

## Lessons potencjalne (do dopisania po sukcesie)

- Outlook + zmiana hasła IMAP na DWÓCH komputerach jednocześnie = ryzyko blokady brute-force po stronie hostingu (oba klienci próbują starym hasłem w pętli). **Zalecana sekwencja**: zmiana hasła w panelu hostingu → natychmiast wyłącz wszystkie klienty pocztowe → osobno zaktualizuj credentials na każdym → włącz po kolei
- Credential Manager w Windows nie zawsze trzyma hasła Outlooka. W zależności od wersji (Classic / New Outlook / Microsoft Account linked) credentials mogą siedzieć w rejestrze, cloud vault albo Windows Hello. `cmdkey /list` ujawni tylko Generic Credentials; reszta wymaga innych ścieżek
