# Moduł Statystyki (CRM) — decyzje

Strona `/statystyki` (workspace **CRM**, uprawnienie `statystyki`). Agregacje liczone
w JS w `lib/stats.ts` na **istniejących polach** (bez osobnej tabeli analitycznej).
Wykresy: `recharts@2`. Stan: 10 widoków w 2 paczkach (2026-05-21).

## Architektura

- **`lib/stats.ts`** — dwie funkcje server-side:
  - `getCrmStats()` → lejek, źródła leadów, tempo sprzedaży, heatmapa, momentum
  - `getCrmInsights()` → cykl sprzedaży, czas do sprzedaży, leady do odgrzania, pipeline, puls aktywności
- **`app/(app)/statystyki/page.tsx`** — server component, woła obie funkcje `Promise.all`, renderuje sekcje. Lejek/heatmapa/cykl/pipeline/leady są server-rendered; wykresy recharts są w klient-komponentach.
- **`components/stats/*`** — `SalesVelocityChart`, `LeadSourceChart`, `ActivityPulseChart`, `Sparkline` (wszystkie `'use client'`).
- Uprawnienie `statystyki` w `lib/permissions.ts` (page + api). Admin ma override; innym userom admin nadaje checkbox w `/settings`, po czym muszą się **przelogować** (permissions to snapshot w JWT). **Brak zmian schematu** — nie trzeba `db push`.

## Co napędza każdy widok (źródło prawdy danych)

| Widok | Model / pola | Pojawi się gdy… |
|---|---|---|
| **Lejek konwersji** | `Client.status` (ZAPYTANIE→OFERTA→REZERWACJA→UMOWA→ODBIOR) | są klienci. Lejek = „osiągnął etap lub dalszy" (klient ma 1 status naraz). |
| **Źródła leadów (ROI)** | `Client.source`, `Client.status` (UMOWA/ODBIOR = konwersja) | klienci mają wypełnione `source`. |
| **Tempo sprzedaży 12 mc** | `Contract` (status PODPISANA) `signedAt` + `valueGross` | **są umowy** PODPISANA z `signedAt`. |
| **Momentum (leady)** | `Client.createdAt` | są klienci. |
| **Momentum (umowy/przychód)** | `Contract.signedAt` + `valueGross` | są umowy PODPISANA. |
| **Cykl sprzedaży** | `Contract.signedAt` − `Client.createdAt` (po `clientId`) | są umowy PODPISANA z klientem. |
| **Czas do sprzedaży / typ** | `Contract.signedAt` − `Unit.createdAt` (po `contractUnits`) + `Unit.type` | umowy mają **podpięte lokale** (`ContractUnit`). |
| **Leady do odgrzania** | `Client` (ZAPYTANIE/OFERTA/REZERWACJA) + ostatnia `Activity.date` | są otwarte leady bez kontaktu ≥ `STALE_LEAD_DAYS` (21). |
| **Prognoza pipeline** | `Contract` W_PRZYGOTOWANIU `valueGross` + `Offer` WYSLANA `totalGross` | są umowy w przygotowaniu / wysłane oferty z wartościami. |
| **Puls aktywności** | `Activity.date` + `type` | są zarejestrowane działania. |
| **Heatmapa sprzedaży** | `Unit.status` (SPRZEDANY) + `Unit.building` (lub prefiks numeru) + `Unit.floor` | są lokale ze statusem i piętrem/budynkiem. |

**Wniosek kluczowy:** import „sprzedanych lokali" przez `/units/import` zasila **tylko heatmapę**.
Statystyki czasowe (tempo, cykl, czas do sprzedaży, momentum-przychód) jadą z **umów** (`Contract`),
których import lokali NIE tworzy.

## Import lokali a heatmapa — pułapki

Importer `lib/units-import.ts` (UI: `/units/import`) czyta kolumny xlsx (z nagłówkiem):

- **A** Numer · **B** Typ lokalu · **C** Status · **D** Klient · **F** Budynek · **G** Klatka · **H** Kondygnacja · **K** Powierzchnia · **M** Cena brutto
- Pomijane: E (kolejka), I (pokoje), J (piętro display), L (cena/m²), N (cechy), O (umowa). Cena netto i cena/m² liczone automatycznie.

Żeby heatmapa pokazała sprzedane:
1. **Włącz przełącznik „synchronizuj status i klientów"** w importerze — domyślnie jest **WYŁĄCZONY**. Bez niego status nie jest importowany (nowe lokale → `WOLNY`), więc heatmapa = 0% sprzedanych.
2. **Kolumna C (Status)** musi mieć dokładnie jedną z etykiet: `Wolny` | `Sprzedany` | `Rezerwacja` | `Wyłączony ze sprzedaży`.
3. **Kolumna B (Typ)** musi pasować dokładnie: `Lokal mieszkalny` | `Lokal usługowy` | `Miejsce postojowe` | `Miejsce garażowe` | `Komórka lokatorska` (inaczej wiersz jest pomijany).
4. **Kolumna F/G (Budynek/Klatka)** → grupowanie wierszy heatmapy (importer zapisuje np. `B1 / Klatka 2`). Gdy puste — fallback na prefiks numeru (`B1.1.M3` → `B1`).
5. **Kolumna H (Kondygnacja)** → kolumny heatmapy (liczba; 0=Parter, -1=Podziemie).

## Parametry do strojenia

- `PREP_CONTRACT_WEIGHT = 0.6`, `SENT_OFFER_WEIGHT = 0.25` — wagi prognozy pipeline.
- `STALE_LEAD_DAYS = 21` — próg „leadu do odgrzania".
- Lejek: założenie „at-or-beyond" (klient w UMOWA przeszedł wcześniejsze etapy).

## Otwarte / do zrobienia

- **Wykres ewolucji cen lokali** — wymaga modelu `PriceHistory` (wspólny z dane.gov.pl + 3D Estate,
  patrz `docs/raportowanie-dane-gov-rozpoczecie.md`). Gdy `PriceHistory` powstanie, dorzucić sekcję
  trendu cennika w czasie — dane już będą, koszt minimalny.
- **Rankingi per-handlowiec** — niemożliwe bez dodania `ownerId` na `Client`/`Contract`/`Activity`
  (obecnie brak przypisania kto prowadzi leada / wpisał działanie). Activity to agregat firmowy.
- **Przychód z `Unit.priceGross` vs `Contract.valueGross`** — stat przychodu używa `valueGross` umów
  (realna wartość transakcji). Jeśli umowy nie mają wypełnionego `valueGross`, przychód pokaże 0
  mimo podpisanych umów.
