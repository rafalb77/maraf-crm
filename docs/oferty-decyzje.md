# Moduł Oferty — decyzje projektowe

Kalkulator ofert dla mieszkań/lokali/parkingów/komórek z rabatami, wysyłką mailem (z PDF), konwersją oferty na umowę rezerwacyjną.

## Architektura danych

```
Offer (status: SZKIC | WYSLANA | ZAAKCEPTOWANA | ODRZUCONA | ANULOWANA)
  ├── clientId → Client (opcjonalny)
  └── items: OfferItem[]
       └── unitId → Unit (opcjonalny, można też custom label)
```

`OfferItem` snapshotuje cenę z `Unit` w chwili dodania (jeśli Unit się zmieni, oferta zostaje).

## Kluczowe decyzje

### 1. Rabat w „zł" = kwota **BRUTTO** (zmiana z 2026-05-09)

Wcześniej `discountType='AMOUNT_NET'` traktowany jako kwota netto, brutto wyliczana przez VAT. **Klient widzi kwotę brutto** („20 000 zł rabatu" = 20 000 mniej do zapłaty), więc semantyka zmieniona:

- Typ `'AMOUNT_NET'` (nazwa zostawiona dla legacy DB) = kwota **brutto** w UI
- `discountGross = min(discountValue, priceGross)`
- `discountNet = discountGross / (1 + VAT/100)`
- Typ `'PCT'` bez zmian (procent stosowany na netto)

Zmiana w 3 miejscach (`api/oferty/route.ts` POST, `api/oferty/[id]/route.ts` PUT, `OfferCalculator.tsx` w funkcji `computeDiscount` która zwraca `{dNet, dGross}`).

### 2. Cena/m² po rabacie

Pod wartością „Po rabacie netto/brutto" (w kalkulatorze i widoku oferty) pokazuje się drobna linia `X,XX /m²` — wyliczana jako `finalGross / area`. Renderowana **tylko gdy** `discountValue > 0 && area > 0` (omija parking/garaż gdzie area=0; bez rabatu cena/m² jest już w osobnej kolumnie).

### 3. Kolor rabatu — **rose**, nie amber

Pierwotnie używaliśmy `bg-amber-50 text-amber-700` dla rabatów — wyglądało jak „brąz", user nie lubił. Zmienione na `rose` (różowy) — kojarzy z promocją/obniżką, elegancko odróżnia się od zielonego („do zapłaty"). Wymagało dodania `bg-rose-*` + opacity wariantów do `globals.css` dark mode.

### 4. Wysyłka oferty mailem — kluczowe ustawienia

**Subject**: `Wiadomość od MARAF Development — {numer}` (NIE `Oferta {nr}` — WP klasyfikowało jako handlową i wrzucało do folderu „Oferty").

**Headers transactional** (sygnał anti-spam):
```
X-Auto-Response-Suppress: All
Auto-Submitted: auto-generated
X-Mailer: MARAF CRM
```

**Lepsza diagnostyka błędów** — endpoint zwraca:
- 502 + szczegóły jeśli SMTP zwróci `rejected: [adres]` (cichy reject)
- 502 jeśli `accepted: []` (SMTP nie potwierdził dostarczenia)
- W logach `[oferty.email] sent: { messageId, accepted, rejected, response }` dla każdej wysyłki

### 5. PDF jako załącznik

`generateOfferPdf()` w `lib/pdf-generator.ts` — Puppeteer (puppeteer-core + system Google Chrome) renderuje HTML z `lib/offer-pdf-html.ts` do PDF i dołącza do maila. **Non-blocking** — jeśli Chrome padnie, mail leci bez PDF z warningiem w logach.

HTML jest **server-side string** (nie React component) z embedded base64 dla obrazków z `public/`. Niezależne od auth/network/Next.js Image. Layout: A4 portrait, navy+gold branding, 7 kolumn tabeli (uproszczone z 11 dla portrait), sekcja Nova Staffa z USP (8 punktów), karta „DO ZAPŁATY" jako flagship navy+gold.

Endpoint diagnostyczny `/api/oferty/[id]/pdf` zwraca PDF inline — używaj do testów (bez wysyłki maila).

### 6. Treść oferty w PDF — wytyczne marketingowe

Sekcja „Nova Staffa" (lib/offer-pdf-html.ts) ma **stałe wytyczne biznesowe**:
- „Bezpośrednie sąsiedztwo Lasu Krogulec" (NIE „pomiędzy Lasem a Łodzią")
- „Doskonała komunikacja do centrum Zgierza i Łodzi"
- „Doświadczony deweloper — Maraf Development" (liczba pojedyncza; Maraf Development jest młoda firma, doświadczenie z innych spółek)
- „Możliwość montażu stacji ładowania EV **na parkingach zewnętrznych**" (nie podziemnych)
- Adres `ul. Struga 23` to **biuro Maraf**, NIE inwestycja — występuje tylko w footerze („Biuro:")
- Email kontakt: `biuro@novastaffa.pl` (nie `biuro@maraf.pl`)
- Logo Maraf: `/logo-icon-light.png` (nie `dark` — `dark` był „niewidoczny" na białym tle wydruku)
- Logo Nova Staffa: `/logo-novastaffa.png` (wgrane do repo)

### 7. Druk pionowy A4 (nie landscape)

Wcześniej druk był landscape z 11 kolumnami. Pionowy lepiej się składa do oferty handlowej (klient drukuje, podpisuje). Tabela uproszczona do 7 kolumn (Lp / Typ / Numer / Pow / Cena brutto / Rabat / Po rabacie brutto). Podpisy klienta/sprzedawcy **usunięte** (user nie chciał).

### 8. Konwersja oferta → umowa rezerwacyjna

Kiedy `Offer.status === 'ZAAKCEPTOWANA'` + jest klient + lokale → przycisk „Umowa rezerwacyjna" → endpoint `/api/oferty/[id]/convert-to-contract` tworzy `Contract` typu REZERWACYJNA z klientem i lokalami z oferty. Lokale oznaczane jako `ZAREZERWOWANY`.

## Pułapki

- **`AMOUNT_NET` to legacy nazwa** w bazie — semantyka to BRUTTO. Nie zmieniamy nazwy bo trzeba by migrować rekordy.
- **`bg-rose-*` wymaga overrides dark mode** dla każdej opacity wariantu (`bg-rose-50/40` ≠ `bg-rose-50`). Plus `text-rose-700` i `text-rose-800` w globals.css.
- **PDF musi być non-blocking** — jeśli Chromium padnie, mail i tak musi się wysłać. Catch + warning w logach, nie throw.

## Pułapki PDF (Chrome w Docker)

Patrz też `docs/changelog.md` (2026-05-09):
- **NIE używaj** Debian `chromium` z apt-get — Chromium 137+ ma bug crashpad. Używamy **Google Chrome stable** z oficjalnego repo Google.
- User `nextjs` w Dockerfile **MUSI mieć home** (`useradd -m -d /home/nextjs`) + pre-tworzone katalogi `~/.config`, `~/.local/share/applications`, `/tmp/chrome-crashes`, `/tmp/chrome-user-data` z chown.
- Flagi puppeteer: `--no-sandbox`, `--disable-dev-shm-usage`, `--crash-dumps-dir=/tmp/chrome-crashes`, `--user-data-dir=/tmp/chrome-user-data`. Plus `headless: true` (legacy single-process — `'new'` wymaga multi-process + crashpad subprocess).

## Otwarte sprawy

- **PDF nie generuje się jeszcze na produkcji** — Chrome pada przy launch w Docker. Pełny stan debugowania + checklist do nowej sesji: **`docs/pdf-generator-status.md`**.
- Email do klienta z preview na osobnej stronie publicznej (signed URL bez auth) — alternatywa do PDF attachment

## Pliki kluczowe

- `app/(app)/oferty/[id]/page.tsx` — widok oferty (read-only, akcje)
- `components/oferty/OfferCalculator.tsx` — kalkulator (nowa/edycja oferty)
- `components/oferty/OfferActions.tsx` — przyciski akcji (status, edytuj, druk, email, konwersja)
- `app/api/oferty/route.ts` + `[id]/route.ts` — CRUD + logika discount
- `app/api/oferty/[id]/email/route.ts` — wysyłka z PDF attachment + headers
- `app/api/oferty/[id]/pdf/route.ts` — bezpośrednie pobranie PDF (diagnostyka)
- `app/(print)/oferty/[id]/druk/page.tsx` — widok druku (HTML + print CSS)
- `lib/offer-pdf-html.ts` — server-side HTML string dla PDF
- `lib/pdf-generator.ts` — Puppeteer wrapper
