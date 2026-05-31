# Integracja KSeF — pobieranie faktur dla obu podmiotów

🟡 **Research + plan** (2026-05-21). Nie zaczęte kodowo — bloker: tokeny/certyfikaty per firma.

## Kontekst

KSeF (Krajowy System e-Faktur, MF) — **API 2.0 działa produkcyjnie od 1 lutego 2026**.
Od tej daty faktury wystawiane są w schemacie **FA(3)** (XML). Każda faktura
sprzedażowa przechodzi przez KSeF i dostaje numer KSeF.

**Wcześniejsze ustalenie:** biuro księgowe używa **Saldeo**, które jest mostem do
KSeF. Czyli KSeF jest „załatwiony" po stronie biura. Ale user chce **pobierać dane
z KSeF bezpośrednio do CRM** — żeby faktury (kosztowe i przychodowe) wpadały
automatycznie do modułu Finanse bez przepisywania, dla real-time cashflow per firma.

## Jak działa KSeF API 2.0 (skrót techniczny)

- **REST API**, środowiska: produkcja (`ksef.podatki.gov.pl`) + testowe.
- **Uwierzytelnianie per NIP** (podatnik):
  1. `POST /api/v2/auth/challenge` → challenge (ważny 10 min)
  2. Podpisanie `AuthTokenRequest` (challenge) jednym z:
     - **podpis/pieczęć kwalifikowana** firmy w formacie XAdES, **albo**
     - **token KSeF** (wygenerowany ręcznie w aplikacji podatnika na ksef.podatki.gov.pl przez osobę z uprawnieniami)
  3. → **token autoryzacyjny długoterminowy** — podpisuje kolejne requesty (bez certyfikatu za każdym razem)
- **Pobieranie faktur:**
  - `POST /invoices/query/metadata` — lista faktur wg filtrów (data, typ, kierunek)
  - `GET /invoices/ksef/{ksefNumber}` — pełny XML pojedynczej faktury
- **Szyfrowanie** (API 2.0): faktury szyfrowane AES-256-CBC, klucz symetryczny szyfrowany RSAES-OAEP (SHA-256/MGF1).
- Faktury zwracane w oryginalnym XML (FA(2) lub FA(3)) — parser musi obsłużyć FA(3).

## Architektura dla DWÓCH podmiotów (Maraf + Maraf Development)

**Kluczowe:** KSeF identyfikuje podatnika po **NIP**. Maraf i MD mają różne NIP →
**osobne uwierzytelnienie i osobny token** per firma. To pasuje do naszego modelu —
mamy już pole `company` (MARAF / MARAF_DEVELOPMENT) na fakturach.

### Model danych
- Nowa tabela `KsefConfig` (per firma): `company`, `nip`, `token` (zaszyfrowany), `environment` (PROD/TEST), `lastSyncAt`.
  Tokeny trzymane zaszyfrowane (nie plaintext) — np. AES z kluczem z env `KSEF_SECRET`.

### Przepływ pobierania (per firma, cyklicznie przez cron)
1. Dla każdej firmy: uwierzytelnij się (challenge → token) jej tokenem/certyfikatem.
2. `query/metadata` od `lastSyncAt` → lista nowych faktur (dwa kierunki):
   - **wystawione przez nas** (subject1 = nasz NIP) → mapuj na `SalesInvoice` (company = ta firma)
   - **otrzymane** (subject2 = nasz NIP) → mapuj na `PurchaseInvoice` (company = ta firma)
3. Dla każdej: pobierz XML, sparsuj FA(3) (numer, daty, kontrahent, netto/VAT/brutto, pozycje).
4. Upsert do bazy po `ksefNumber` (dodać pole `ksefNumber` do obu modeli — zapobiega duplikatom).
5. Vendor (dla kosztowych) — match po NIP/nazwie z FA(3) lub utwórz.
6. `lastSyncAt = now()`.

### Cross-company a KSeF
Faktura Maraf→MD pojawi się w KSeF **dwukrotnie**: jako wystawiona u Maraf i otrzymana u MD.
Przy imporcie z KSeF cross-company „samo się zrobi" — nie trzeba ręcznego „Utwórz koszt u odbiorcy"
(ten przycisk zostaje dla faktur spoza KSeF / ręcznych). Trzeba tylko rozpoznać że to ta sama
faktura (po `ksefNumber`) i ewentualnie zlinkować.

## Co potrzebne od usera (BLOKERY)

1. **Decyzja: pobieramy z KSeF do CRM równolegle do Saldeo, czy zamiast?**
   (Rekomendacja: równolegle — Saldeo zostaje dla biura/oficjalnej księgowości, CRM ciąga
   read-only dla wglądu/cashflow. Nie wystawiamy faktur przez CRM — tylko czytamy.)
2. **Sposób uwierzytelnienia per firma:**
   - Najprościej: **token KSeF** wygenerowany ręcznie w ksef.podatki.gov.pl (osoba z uprawnieniami: Bohdan/zarząd lub pełnomocnik). Jeden token per firma, długoterminowy.
   - Alternatywa: **pieczęć kwalifikowana** firmy (jeśli mają) — wtedy auth przez XAdES.
3. **Uprawnienia w KSeF** — każda firma musi nadać uprawnienie „odczyt faktur" dla tożsamości,
   której token użyjemy. Robi to osoba z uprawnieniami właścicielskimi (zarząd) w panelu KSeF.
4. **NIP-y obu firm.**

## Plan implementacji (gdy będą tokeny)

1. Schema: `KsefConfig` + pola `ksefNumber` na SalesInvoice/PurchaseInvoice.
2. `lib/ksef-client.ts` — auth (challenge + token), query/metadata, pobranie XML, deszyfrowanie.
3. `lib/ksef-parser.ts` — FA(3) XML → nasze modele.
4. Endpoint/skrypt sync per firma + cron (np. co godzinę / raz dziennie).
5. UI w `/settings` lub `/finanse`: konfiguracja KSeF per firma (NIP + token) + przycisk „Synchronizuj teraz" + status ostatniej synchronizacji.
6. Oznaczenie faktur z KSeF (badge „KSeF") + read-only dla pól pochodzących z KSeF.

## Ryzyka / uwagi

- **Bezpieczeństwo tokenów** — token KSeF daje dostęp do faktur firmy. Trzymać zaszyfrowany, nie w repo, nie w logach.
- **Szyfrowanie AES/RSA** w API 2.0 — implementacja deszyfrowania wymaga uwagi (klucze, formaty).
- **FA(3) parser** — schemat jest złożony; zacząć od pól które realnie potrzebujemy (nagłówek + sumy + kontrahent), nie całej struktury.
- **Limity API** — pull wsadowy, nie odpytywać za często.
- **Saldeo dublowanie** — jeśli i Saldeo i CRM ciągną z KSeF, to OK (read-only), ale uważać żeby nie wprowadzać faktur podwójnie ręcznie + z KSeF (dedup po ksefNumber).
