# Dostarczalność maili maraf.pl + novastaffa.pl — SPF/DMARC/DKIM

**Status**: 🟡 OTWARTE — maraf.pl naprawione (patrz Update 2026-07-11), **czeka novastaffa.pl** (nadawca CRM: brak DKIM i DMARC przez wildcard DNS) + ewentualny ticket PTR do home.pl.

**Plik dla nowej sesji** — najpierw czytaj „Update 2026-07-11" na dole (aktualny stan + checklist), historia wyżej.

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

## Update 2026-07-11 — maraf.pl ✅ zrobione; odkryto lukę w novastaffa.pl (nadawca CRM)

Kontrola live DNS (8.8.8.8) + 5 blacklist. Kontekst: wdrożyliśmy automatyczne
powiadomienia e-mail do klientów o wygasających rezerwacjach
(`docs/rezerwacje-powiadomienia-decyzje.md`) — wysyłane przez SMTP home.pl
z **`biuro@novastaffa.pl`**, więc ich dostarczalność zależy od DNS
**novastaffa.pl**, nie maraf.pl.

### maraf.pl — plan z 25.05 WYKONANY

| Element | Stan 2026-07-11 |
|---|---|
| SPF | ✅ `v=spf1 ip4:89.161.166.193 a mx include:_spf.home.pl ~all` (jest `~all` + include) |
| DMARC | ✅ `v=DMARC1; p=none; rua=mailto:rafal.boruch@maraf.pl` |
| DKIM | ✅ selektor `dkim` istnieje (podpisywanie potwierdzone raportem DMARC 25.05) |
| Blacklisty | ✅ zen.spamhaus, spamcop, barracuda, sorbs, psbl — czysto |
| PTR | ⚠️ nadal `cloudserver030165.home.pl` (tylko home.pl; drobiazg — HELO spójne z PTR) |

Zostaje (opcjonalnie): ticket do home.pl o PTR/reputację — **tylko jeśli maile
Rafała nadal są odrzucane** (minęło 7 tygodni od incydentu, reputacja mogła się
zagoić; przetestować zanim wyśle się ticket).

### novastaffa.pl — ❌ brak DKIM i DMARC (wildcard DNS zjada rekordy)

Stan: SPF = `v=spf1 a mx ~all` → ✅ pass (A domeny = 89.161.166.193 = serwer
wysyłkowy). ALE w strefie jest **wildcard `*` → CNAME na apex** (dowolna
subdomena resolvuje na 89.161.166.193), przez co:

- `dkim._domainkey.novastaffa.pl` → CNAME na apex → **brak klucza DKIM**
  (żaden selektor; maile z CRM idą bez ważnego podpisu DKIM),
- `_dmarc.novastaffa.pl` → CNAME na apex → **brak DMARC**.

Gmail (wymogi nadawców od 2024) i wp.pl (tam są klienci, np. @wp.pl) traktują
brak DKIM+DMARC jako silny sygnał spamowy — dokładnie dla maili transakcyjnych
CRM do klientów.

### Checklist naprawy novastaffa.pl (panel home.pl)

- [ ] **DKIM**: panel home.pl → Poczta → domena novastaffa.pl → włącz podpis
  DKIM (home.pl sam doda rekord `dkim._domainkey` do strefy; rekord jawny
  wygrywa z wildcardem). Jeśli w panelu brak opcji → ticket do home.pl.
- [ ] **DMARC**: DNS novastaffa.pl → dodaj TXT:
  `Host: _dmarc`, `Wartość: v=DMARC1; p=none; rua=mailto:biuro@novastaffa.pl`
  (rua w tej samej domenie = bez dodatkowej autoryzacji cross-domain).
- [ ] (opcjonalnie) **SPF** doprecyzować jak w maraf.pl:
  `v=spf1 ip4:89.161.166.193 a mx include:_spf.home.pl ~all` — odporne na
  przenosiny IP w ramach home.pl.
- [ ] (higiena, decyzja świadoma) wildcard `*` CNAME zostawić lub usunąć —
  jawne rekordy i tak wygrywają, ale wildcard utrudnia diagnostykę.
- [ ] **Weryfikacja po ~1-24h propagacji**: w CRM `/settings` → „Powiadomienia
  o rezerwacjach" → „Test e-mail" na adres z **mail-tester.com** (testuje
  dokładnie ścieżkę powiadomień: SMTP home.pl + nagłówki auto-mail). Cel ≥ 9/10,
  w raporcie DKIM=pass i DMARC=pass. Drugi test: mail na własne konto @wp.pl
  i @gmail.com — sprawdzić że nie wpada do spamu/„Ofert".

## Powiązane

- `docs/incident-bogdan-mail-status.md` — źródłowy incydent (hack SMTP który nadszarpnął reputację)
- `docs/infrastruktura.md` — sekcja DNS (było zalecenie SPF `v=spf1 include:_spf.home.pl ~all` — nigdy nie wdrożone do końca) + sekcja SMTP (nadawca CRM = biuro@novastaffa.pl)
- `docs/rezerwacje-powiadomienia-decyzje.md` — automatyczne maile do klientów, których dotyczy novastaffa.pl
