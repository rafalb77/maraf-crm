# Dostarczalność maili maraf.pl — naprawa SPF/DMARC/DKIM (2026-05-25)

**Status**: 🟡 OTWARTE. W trakcie naprawy konfiguracji DNS + ticket do home.pl.

**Plik dla nowej sesji** — gdy temat wraca, czytaj od góry.

---

## Problem

Maile wysyłane z `rafal.boruch@maraf.pl` są odrzucane przez serwery odbiorców jako SPAM. Konkretny bounce (2026-05-25):

```
<patrycja@nieruchomosciwozniak.pl>: 550 Your message was classified as SPAM. Your score: 250
Please add more content, cut down on HTML links... make sure your mailserver has
REVERSEDNS, SPF, DKIM, and is not on any black lists.
```

To **legalny mail biznesowy** Rafała (RE: Boya Żeleńskiego 48 Zgierz - usterki, do biura nieruchomości), nie spam hakera. Problem = **dostarczalność/reputacja**, nie atak.

## Przyczyny (zdiagnozowane 2026-05-25)

Sprawdzone przez DNS lookup:

| Element | Stan | Werdykt |
|---|---|---|
| **SPF** | `v=spf1 ip4:89.161.166.193 a mx` (brak `~all`) | ❌ niekompletny — musi kończyć się `~all`/`-all` |
| **DMARC** | brak rekordu `_dmarc.maraf.pl` | ❌ brak |
| **DKIM** | selektor `dkim._domainkey.maraf.pl` → klucz RSA istnieje | ✅ rekord JEST (ale czy serwer podpisuje? — do potwierdzenia u home.pl) |
| **PTR (reverse DNS)** | `89.161.166.193 → cloudserver030165.home.pl` | ⚠️ nie wskazuje maraf.pl — możliwy mismatch z HELO, naprawia tylko home.pl |
| **MX** | `maraf.pl → maraf.pl` | ✅ OK |
| **Spamhaus DBL** (domena) | nie na liście | ✅ |
| **6 DNSBL** (IP): zen.spamhaus, spamcop, barracuda, sorbs, cbl, uceprotect | czyste | ✅ |

**Dodatkowa przyczyna — reputacja po incydencie**: 18.05.2026 haker rozsyłał ~969 spamów z `bogdan.boruch@maraf.pl` (patrz `docs/incident-bogdan-mail-status.md`). IP `89.161.166.193` (współdzielony home.pl) prawdopodobnie dostał gorszą reputację u części providerów. Score 250 jest zbyt wysoki by tłumaczyć go samym brakiem `~all` — reputacja to istotny składnik. Goi się z czasem (tygodnie bez nowego spamu).

---

## Plan naprawy

### Część Rafała — DNS w panelu home.pl (strefa maraf.pl)

- [ ] **SPF** — edytuj istniejący rekord TXT:
  ```
  PRZED:  v=spf1 ip4:89.161.166.193 a mx
  PO:     v=spf1 ip4:89.161.166.193 a mx include:_spf.home.pl ~all
  ```
- [ ] **DMARC** — dodaj nowy rekord TXT:
  ```
  Host:      _dmarc
  Typ:       TXT
  Wartość:   v=DMARC1; p=none; rua=mailto:rafal.boruch@maraf.pl
  TTL:       puste (domyślne 3600)
  ```
  (`p=none` = tryb monitorowania, bezpieczny start; można zaostrzyć później do `p=quarantine`)

### Część home.pl — ticket (rzeczy które tylko oni naprawią)

- [ ] Wysłać ticket (gotowiec niżej): delisting IP po incydencie, weryfikacja aktywności DKIM (podpisywanie, nie tylko DNS), PTR/HELO spójność, reputacja konta

Gotowiec ticketu:

> Temat: maraf.pl — problemy z dostarczalnością poczty wychodzącej (klasyfikacja jako SPAM)
>
> Maile z rafal.boruch@maraf.pl są odrzucane przez serwery odbiorców jako SPAM (550, score 250, komunikat o REVERSEDNS/SPF/DKIM/blacklisty). Kontekst: tydzień temu (18.05.2026) skrzynka bogdan.boruch@maraf.pl została skompromitowana i atakujący rozsyłał spam (hasło zmienione, opanowane). Podejrzewam nadszarpniętą reputację serwera/IP.
>
> Proszę o sprawdzenie:
> 1. Czy IP serwera wychodzącego (89.161.166.193 / cloudserver030165.home.pl) nie trafił na blacklisty po incydencie — jeśli tak, proszę o delisting
> 2. Czy DKIM jest aktywnie włączony dla maraf.pl (podpisywanie wychodzących, nie tylko rekord DNS — selektor `dkim` widoczny w DNS)
> 3. Czy reverse DNS (PTR) jest spójny z HELO serwera — obecnie PTR = cloudserver030165.home.pl
> 4. Czy reputacja konta pocztowego jest OK po incydencie
>
> Po swojej stronie poprawiam SPF (dodaję ~all) i dodaję DMARC.
> Nr klienta: [...]

### Weryfikacja po naprawie

- [ ] Poczekać na propagację DNS (~1-24h)
- [ ] Test na **mail-tester.com** — wysłać testowy mail na podany adres, sprawdzić score 0-10 + listę problemów. Cel: 8-10/10
- [ ] Ponowić wysyłkę do patrycja@nieruchomosciwozniak.pl, sprawdzić czy przechodzi

### Doraźnie (zanim reputacja się odbuduje)

- [ ] Pilna korespondencja z odbiorcami którzy odrzucają → poprosić o dodanie rafal.boruch@maraf.pl do whitelisty, albo wysłać z Gmaila
- [ ] Patrycja Jaworska (nieruchomosciwozniak.pl) — poprosić IT o whitelist

---

## Update 2026-05-25 — pierwszy raport DMARC od Google (RUA działa)

Kilka godzin po dodaniu DMARC przyszedł pierwszy agregowany raport od Google (`noreply-dmarc-support@google.com` → rafal.boruch@maraf.pl). DMARC `rua=` działa, DNS się spropagował. Zawartość XML (okno ~25-26.05):

```
policy_published: domain=maraf.pl, p=none, adkim=r, aspf=r, pct=100
record:
  source_ip: 89.161.166.193  (legalny serwer maraf.pl/home.pl)
  count: 1
  dkim: PASS (selector "dkim", domain maraf.pl)
  spf:  PASS (domain maraf.pl)
  disposition: none
```

**Wnioski (rewizja diagnozy):**

1. ✅ **DKIM aktywnie podpisuje** wychodzące maile (nie tylko rekord w DNS) — `dkim: pass` + selektor `dkim`. **Punkt DKIM z ticketu do home.pl można SKREŚLIĆ — działa.**
2. ✅ **SPF przechodzi** mimo braku `~all` — bo IP 89.161.166.193 jest w `ip4:` rekordu (dla autoryzowanego IP pass). Dodanie `~all` nadal warto (twarda polityka + obsługa innych IP), ale fundament działał.
3. ✅ **DMARC alignment pass** — Google w pełni akceptuje uwierzytelnianie maraf.pl.
4. 🔑 **Tylko jeden source_ip (89.161.166.193, legalny)** — BRAK nieautoryzowanych źródeł/spoofingu. **Potwierdzenie z niezależnego źródła (Google) że atakujący NIE wysyła już z maraf.pl** — zmiana hasła skutecznie odcięła. (Istotne dla `docs/incident-bogdan-mail-status.md`.)

**Konsekwencja dla score 250**: skoro SPF+DKIM+DMARC wszystkie pass, odrzucenie przez nieruchomosciwozniak.pl to **NIE brak uwierzytelniania** → prawie na pewno **reputacja IP po incydencie**. Ticket do home.pl zawęża się do: **reputacja/delisting IP + PTR mismatch** (DKIM skreślony). Reputacja goi się z czasem (tygodnie bez nowego spamu) — raporty DMARC pozwolą monitorować.

**Uwaga praktyczna**: raporty DMARC będą przychodzić codziennie z wielu serwerów (Google, Microsoft, Yahoo...) na rafal.boruch@maraf.pl → zaśmiecą skrzynkę. Rozważyć: zmiana `rua=` na osobny adres (np. dmarc@maraf.pl) albo darmowy agregator (dmarcian / postmark DMARC).

## Czy problem zniknie po SPF+DMARC?

Częściowo. SPF (z `~all`) + DMARC + DKIM to fundament — usunie dużą część scoringu. ALE score 250 sugeruje że dochodzi **reputacja IP po incydencie** (działka home.pl + czas) i ewentualnie **PTR mismatch** (działka home.pl). Dlatego ticket do home.pl równolegle, nie tylko DNS. Realistycznie: poprawa stopniowa przez dni-tygodnie w miarę gojenia reputacji + po działaniach home.pl.

## Powiązane

- `docs/incident-bogdan-mail-status.md` — źródłowy incydent (hack SMTP który nadszarpnął reputację)
- `docs/infrastruktura.md` — sekcja DNS (było zalecenie SPF `v=spf1 include:_spf.home.pl ~all` — nigdy nie wdrożone do końca)
