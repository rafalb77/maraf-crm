# Meta Ads — decyzje i plan rozwoju

Integracja CRM z Meta (Facebook + Instagram) — od generatora kreacji po pełną automatyzację kampanii reklamowych. Dokument prowadzony od **2026-05-13**.

## Dlaczego nie MCP

MCP (Model Context Protocol) byłby narzędziem dla admina przez Claude'a (terminal), **nie dla użytkowników CRM**. Sprzedawcy używają aplikacji, nie Claude'a. Plus oficjalnego Meta MCP nie ma — są społecznościowe, ryzyko z tokenami. **Idziemy w Marketing API + Graph API**, MCP odpada.

## Strategia ogólna

Nie próbujemy przebić algorytmu Mety (Advantage+). Wartość po naszej stronie to:
1. **Generowanie wielu wariantów kreacji** (Meta wybierze najlepszy)
2. **Raportowanie ROI po stronie CRM** (lead z FB → rezerwacja → sprzedaż, per lokal/kampania)
3. **Automatyzacja boilerplate'u** (Lead Ads → Client w CRM, post nowego lokalu na Page + IG)

Reklamy mieszkań w UE = **Special Ad Category "HOUSING"** (zakaz targetowania wiek/płeć/dokładna lokalizacja, wymóg Mety). Każda kampania tworzona przez nas musi to mieć ustawione.

## Roadmap MVP (1-5)

### MVP #1 — Generator kreacji (bez Mety)
Cel: z lokalu (zdjęcia + dane + nazwa inwestycji z Settings) wygenerować zestaw PNG-ów w formatach FB/IG do ręcznego wgrania w Ads Managerze. **Daje wartość natychmiast bez App Review Mety.**

- **1a. Galeria zdjęć lokalu** (status: w trakcie 2026-05-13)
  - Model `UnitImage` (id, unitId, url, position, isPrimary, createdAt) — relacja kaskadowa do Unit
  - API `/api/units/[id]/images` (POST multi-upload, GET list) + `/api/units/[id]/images/[imageId]` (DELETE, PATCH dla reorder/setPrimary)
  - Folder `public/uploads/units/<unitId>/`
  - Komponent `UnitImageGallery` w `/units/[id]` — dropzone, drag-reorder, isPrimary, delete
  - **Nie ruszamy `floorPlanUrl`** — pozostaje na karty PDF mieszkań (relabel UI: "Karta lokalu (PDF)")
  - Walidacja: tylko obrazy (JPG/PNG/WebP), max 5MB/plik, bez auto-kompresji na MVP

- **1b. Template engine + render PNG** (status: pending)
  - `lib/ad-creative-html.ts` — HTML+CSS composer dla 4 formatów: 1080×1080 (FB/IG feed), 1080×1350 (IG portrait 4:5), 1080×1920 (Stories/Reels 9:16), 1200×628 (FB landscape 1.91:1)
  - Reuse `lib/pdf-generator.ts` (puppeteer + Chrome) → dodać helper `generatePng(html, w, h)` używający `page.screenshot({ type: 'png' })`
  - Layout: zdjęcie isPrimary jako tło + overlay z logo, nazwą inwestycji ("Nova Staffa" z Settings), numerem lokalu, metrażem, ceną brutto, CTA ("Zobacz szczegóły"); branding NAVY `#2C3E54` + GOLD `#C9A37A`
  - Endpoint `POST /api/units/[id]/ad-creative` → ZIP (4 PNG-i × N wariantów)
  - Strona `/units/[id]/creative` — wybór zdjęcia, podgląd live, button "Pobierz ZIP"

- **1c. AI copy generator** (status: pending — wymaga `ANTHROPIC_API_KEY` w Coolify)
  - Endpoint `POST /api/units/[id]/ad-copy` → 5 wariantów `{headline, primaryText, description}`
  - Prompt: dane lokalu + nazwa inwestycji → 5 kątów (cena/lokalizacja/lifestyle/urgency/value)
  - Jeśli brak `ANTHROPIC_API_KEY` → 400 z message o konfiguracji
  - Integracja w UI generatora (krok 2 po wyborze zdjęcia)

### MVP #2 — Push do Mety jako Draft Ad
Cel: kreacja wygenerowana w CRM → automatycznie ląduje w Ads Managerze jako **Draft Ad** (user dopina ostateczną publikację ręcznie — minimalizuje ryzyko App Review).

- Wymagane: Meta App (Business), App Review na `ads_management`, Business Manager, Ad Account, Page Access Token (zarządzany w `Settings` z auto-refresh long-lived token)
- Special Ad Category `HOUSING` ustawiany przy każdej kampanii (wymóg Mety dla nieruchomości w UE)
- Model `MetaAdDraft` (id, unitId, campaignId, adsetId, adId, status, createdAt) — śledzimy co już wypchnięto
- UI: button "Wyślij do Ads Managera" w `/units/[id]/creative`, dropdown istniejących kampanii (pull z Marketing API)

### MVP #3 — Conversions API
Cel: gdy `Client.status` zmienia się na "REZERWACJA"/"UMOWA" → event do Mety. Algorytm FB lepiej optymalizuje kampanie, większa wartość ROAS.

- Hash PII (email/phone SHA-256) przed wysyłką (wymóg Mety)
- Deduplikacja `event_id` (żeby zdarzenie nie poszło 2× przy retry)
- Mapowanie `Client.source = "FB_LEAD"` → event z `fbclid`/`fbp` z czasu zapisu leada (do śledzenia trzeba zachować ten parametr przy imporcie Lead Ads w MVP-future)
- Cron / hook na update `Client.status` → kolejka eventów

### MVP #4 — Dashboard wyników w CRM
Cel: w nowym module `/marketing` pokazać efektywność kampanii **per lokal** ("Mieszkanie M-12: 23 leady po 45 zł, 2 rezerwacje, ROI X").

- Pull stats z Marketing API (Insights endpoint) — daily cron, cache w lokalnej tabeli `MetaInsight`
- Agregacja: per kampania, per ad set, per lokal (via tagi/UTM)
- UI: lista kampanii + drill-down do ad-setów i kreacji + wykresy (chart.js / recharts)

### MVP #5 — Reguły optymalizacji
Cel: cron job pauzujący/skalujący kampanie wg reguł zdefiniowanych w UI.

- Model `OptimizationRule` (warunek: metryka + próg + okno czasowe; akcja: pause/scale_budget)
- Cron co X minut: pull metryk → eval reguł → wywołaj API Mety
- UI: edytor reguł, historia zadziałań
- **Uwaga**: zaczynamy od reguł prostych. AI optimizer (Claude analizuje wyniki i decyduje sam) = poza scope MVP, bo Advantage+ często wygrywa.

## Out of scope (nie robimy)

- Generowanie wnętrz przez AI (DALL·E/Imagen) — myli proporcje pomieszczeń, ryzyko polityki Housing Meta. **Używamy realnych zdjęć + template puppeteer.**
- Messenger/IG DM inbox w CRM — ambitne, App Review trudny, niski ROI dla deweloperów
- Pełna autopublikacja kreacji (bez ręcznego review w Ads Manager) — dopiero gdy reszta jest stabilna

## Pułapki

- **App Review Mety** na `ads_management` / `leads_retrieval` / `pages_manage_posts` wymaga screencastu funkcji w działającym CRM + dokumentów firmy. 1-3 tygodnie. Każda istotna zmiana funkcji = re-review.
- **Page Access Token long-lived** — wygasają. Musi być automatyczny refresh + alert do admina jak się zbliża deadline.
- **Instagram Business Account** musi być połączony z Facebook Page. Bez tego API IG nie zadziała.
- **Polityka Meta dla Housing** — odrzuca kreacje sugerujące ekskluzywność lokalizacji/sąsiedztwa. Copy musi być neutralne.
- **Każda kreacja review przez Metę ~24h** — automatyzacja kreacji ≠ natychmiastowa publikacja.

## Zmienne środowiskowe (do dodania w Coolify gdy potrzebne)

- `ANTHROPIC_API_KEY` — dla MVP #1c (AI copy). **TODO: sprawdzić czy już jest, jeśli nie — dodać.**
- `META_APP_ID`, `META_APP_SECRET` — dla MVP #2
- `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_IG_BUSINESS_ID` — konkretne ID konta reklamowego (per środowisko)
- Page Access Token i Pixel Access Token — **w `Settings` w DB**, nie w env (rotacja, audit)

## Decyzje techniczne podjęte

- **2026-05-13** — Galeria zdjęć osobno od `floorPlanUrl`. `floorPlanUrl` zostaje na PDF-karty mieszkań (relabel "Karta lokalu (PDF)"). Powód: PDF kart nie nadaje się jako tło reklamy na FB/IG, potrzebujemy multi-image galerii dla wizualizacji/renderów.
- **2026-05-13** — Generator kreacji reuse'uje pattern `lib/offer-pdf-html.ts` (HTML+base64 → puppeteer), zamiast wprowadzać nową bibliotekę (Sharp/Canvas). Powód: Chrome już skonfigurowany w Dockerfile, zero nowych dependencies.
- **2026-05-13** — Branding (logo, kolory) na MVP **hardcoded** (NAVY/GOLD jak w PDF ofert). Settings dla brandingu = kierunek po MVP, gdy będzie więcej inwestycji.
