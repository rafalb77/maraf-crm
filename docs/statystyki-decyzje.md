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
| **Czas do sprzedaży / typ** | `Unit.soldAt` − `Unit.createdAt` dla lokali ze statusem SPRZEDANY + `Unit.type`/`Unit.rooms` | są **sprzedane lokale z ręcznie wpisaną `soldAt`** (data sprzedaży). Mieszkania (`MIESZKALNY`) rozbite po liczbie pokoi (1-pok., 2-pok., …; brak/0 → grupa „bez liczby pokoi"); pozostałe typy grupowane po typie. Lokale bez `soldAt` są pomijane (brak daty = brak czasu). `soldAt` ustawia się w edycji lokalu (pole widoczne gdy status=SPRZEDANY). |
| **Leady do odgrzania** | `Client` (ZAPYTANIE/OFERTA/REZERWACJA) + ostatnia `Activity.date` | są otwarte leady bez kontaktu ≥ `STALE_LEAD_DAYS` (21). |
| **Prognoza pipeline** | `Contract` W_PRZYGOTOWANIU `valueGross` + `Offer` WYSLANA `totalGross` | są umowy w przygotowaniu / wysłane oferty z wartościami. |
| **Puls aktywności** | `Activity.date` + `type` | są zarejestrowane działania. |
| **Heatmapa sprzedaży** | `Unit.status` (SPRZEDANY) + `Unit.building` (lub prefiks numeru) + `Unit.floor` | są lokale ze statusem i piętrem/budynkiem. |

**Wniosek kluczowy:** import „sprzedanych lokali" przez `/units/import` zasila **heatmapę** (po `status`)
oraz — po ręcznym uzupełnieniu `Unit.soldAt` — **„co schodzi najszybciej"**. Pozostałe statystyki czasowe
(tempo, cykl, momentum-przychód) jadą z **umów** (`Contract`), których import lokali NIE tworzy.

**„Co schodzi najszybciej" (od 2026-06):** przepięte z umów na `Unit.status=SPRZEDANY` + `Unit.soldAt`
(decyzja: pokazać wszystkie sprzedane lokale, a datę sprzedaży wpisywać ręcznie w edycji lokalu).
`soldAt` to nowe pole `Unit` (nullable). **Wymaga `prisma db push` na prod** (brak migracji — patrz
`docs/infrastruktura.md`). Zmiana statusu lokalu na inny niż SPRZEDANY czyści `soldAt` (API units).

## Import lokali a heatmapa — pułapki

Importer `lib/units-import.ts` (UI: `/units/import`) czyta kolumny xlsx (z nagłówkiem):

- **A** Numer · **B** Typ lokalu · **C** Status · **D** Klient · **F** Budynek · **G** Klatka · **H** Kondygnacja · **I** Pokoje · **K** Powierzchnia · **M** Cena brutto · **P** Data wystawienia (opcjonalna)
- Pomijane: E (kolejka), J (piętro display), L (cena/m²), N (cechy), O (umowa). Cena netto i cena/m² liczone automatycznie.
- **I „Pokoje"** → `Unit.rooms` (Int, puste/0 → null). Zasila „co schodzi najszybciej" (mieszkania rozbite po liczbie pokoi). Backfill też przy update istniejących lokali.
- **P „Data wystawienia"** (opcjonalna) → `Unit.createdAt`, żeby statystyka „czas do sprzedaży" działała dla historii.

Żeby heatmapa pokazała sprzedane:
1. **Włącz przełącznik „synchronizuj status i klientów"** w importerze — domyślnie jest **WYŁĄCZONY**. Bez niego status nie jest importowany (nowe lokale → `WOLNY`), więc heatmapa = 0% sprzedanych.
2. **Kolumna C (Status)** musi mieć dokładnie jedną z etykiet: `Wolny` | `Sprzedany` | `Rezerwacja` | `Wyłączony ze sprzedaży`.
3. **Kolumna B (Typ)** musi pasować dokładnie: `Lokal mieszkalny` | `Lokal usługowy` | `Miejsce postojowe` | `Miejsce garażowe` | `Komórka lokatorska` (inaczej wiersz jest pomijany).
4. **Kolumna F/G (Budynek/Klatka)** → grupowanie wierszy heatmapy (importer zapisuje np. `B1 / Klatka 2`). Gdy puste — fallback na prefiks numeru (`B1.1.M3` → `B1`).
5. **Kolumna H (Kondygnacja)** → kolumny heatmapy (liczba; 0=Parter, -1=Podziemie).

## Backfill umów (import) — `lib/contracts-import.ts` + `/sales/import`

Importer umów (UI: lista `/sales` → „Import z Excela") ożywia statystyki czasowe.
Wzorzec preview/commit jak przy lokalach. Format xlsx (nagłówek w 1. wierszu):

`A` Nr umowy* · `B` Typ · `C` Status · `D` Klient(zy, przecinkami) · `E` Telefon · `F` Email ·
`G` Lokale (numery, przecinkami) · `H` Inwestycja · `I` Data wprowadzenia · `J` Data podpisania ·
`K` Wartość netto · `L` Wartość brutto · `M` Kaucja · `N` Rabat · `O` Notatki · `P` Źródło

Zachowanie:
- **Idempotentny po „Nr umowy"** (istniejąca → update, nowa → create).
- **Klient**: dopasowanie po imię+nazwisko; brakujący tworzony (opcja `createMissingClients`, domyślnie ON) z tel/email/źródłem. Status nowego klienta pochodny z umowy (PODPISANA→`UMOWA`, inaczej `REZERWACJA`) — **ożywia też lejek i ROI źródeł dla historii**.
- **`Data wprowadzenia` → `client.createdAt`** nowego klienta → **cykl sprzedaży liczy się też dla historii** (= signedAt − introducedAt).
- **Lokale**: dopasowanie po numerze; brakujące → ostrzeżenie (importuj lokale wcześniej). **NIE zmienia statusu lokali** (to robi import lokali — rozdział źródeł prawdy).
- **Nie** ustawia `unit.createdAt` (to robi import lokali). Aby **„czas do sprzedaży / typ"** liczył się też dla historii, w imporcie lokali jest opcjonalna kolumna **P „Data wystawienia"**, która backfill-uje `unit.createdAt` (`lib/units-import.ts`, create + update). Bez niej lokale mają `createdAt` = data importu i ten stat ożywa dopiero dla nowych transakcji.

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
