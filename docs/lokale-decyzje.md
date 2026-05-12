# Moduł Lokale — decyzje projektowe

Zarządzanie lokalami w inwestycji (mieszkania, parking, garaż, komórka, usługowe). Import z xlsx + ręczny CRUD + powiązania z klientami/ofertami/umowami.

## Schema

```
Unit (status: WOLNY | ZAREZERWOWANY | SPRZEDANY | NIEDOSTEPNY)
  ├── number (unique, np. "B1.1.M1")
  ├── type (MIESZKALNY | USLUGOWY | PARKING | GARAZ | KOMORKA)
  ├── area, vatRate (8% default)
  ├── pricePerSqmNet, pricePerSqmGross (liczone z brutto / area dla MIESZKALNY/USLUGOWY/KOMORKA)
  ├── priceNet, priceGross (priceNet = priceGross / 1.08)
  ├── floor (Int? — kondygnacja, 0 = parter)
  ├── building (String? — np. "B1 / Klatka A")
  ├── floorPlanUrl (String? — uploaded floor plan image/PDF)
  ├── reservationType (null | MIEKKA | REZERWACJA) + reservationExpiresAt + reservedById
  └── relacje: clientUnits, serviceRequests, contractUnits, offerItems
```

## Co JUŻ DZIAŁA

### UI

- **`/units`** — lista lokali z `UnitsTable` (sortowanie, filtry przez `UnitFilters`, kolumny togglable, persisted w localStorage)
- **`/units/new`** — ręczne dodanie lokalu (`UnitForm`)
- **`/units/[id]`** — szczegóły lokalu (klienci przypisani, service requests, floor plan upload)
- **`/units/[id]/edit`** — edycja
- **`/units/import`** — import z xlsx (UI: upload + preview 4 sekcji + commit z modalem potwierdzenia)

### Import z Excela (`lib/units-import.ts`)

Pattern **preview/commit** — endpoint `POST /api/units/import` z FormData + `mode: 'preview'|'commit'`. Preview zwraca diff (nowe / aktualizacje / pominięte / do usunięcia) bez zapisu, commit robi `prisma.$transaction`.

**Konwencja xlsx** (eksport z systemu kasowego):
- A=Numer, B=Typ, C=Status, D=Klient, F=Budynek, G=Klatka, H=Kondygnacja, K=Pow., M=Cena brutto
- Cena/m² wyliczana z brutto / area (dla MIESZKALNY/USLUGOWY/KOMORKA, nie parking/garaż)
- Building = `"B{nr} / Klatka {x}"`
- VAT 8% wymuszone

**Tryb „synchronizuj statusy/klientów"** (checkbox) — domyślnie OFF. Włączony **jednorazowo** mapuje statusy z xlsx (Wolny/Sprzedany/Rezerwacja/Wyłączony) i dopina klientów z kolumny D (po `firstName + lastName` z bazy; jeśli klient nie istnieje → warning, **nie tworzy**).

**Chronione lokale** (nie zostaną usunięte przy imporcie nawet jeśli ich brak w xlsx):
- z relacją do umowy (`contractUnits`)
- przypisane do klienta (`clientUnits`)
- mają zgłoszenie serwisowe (`serviceRequests`)
- są w ofercie (`offerItems`)

### Statusy + rezerwacje

- `WOLNY` → konwersja oferty / utworzenie umowy rezerwacyjnej → `ZAREZERWOWANY`
- `ZAREZERWOWANY` + `reservationType=MIEKKA` + `reservationExpiresAt` → po expiry: auto-zwolnienie do `WOLNY` (`lib/reservations.ts → expireSoftReservations()`, wywoływane przy każdym fetch lokali)
- `ZAREZERWOWANY` + `reservationType=REZERWACJA` → twarda, nie wygasa
- `ZAREZERWOWANY` → (umowa deweloperska podpisana) → `SPRZEDANY`
- `NIEDOSTEPNY` — wyłączony ze sprzedaży (np. zarezerwowany pod znajomych, używane przez firmę)

## Potencjalne kierunki rozwoju — **doprecyzuj z userem co konkretnie chce**

User powiedział „chcę edytować sekcję lokale" — bardzo szeroko. Pytania do nowej sesji:

### 1. Bulk operations
- Edycja **wielu lokali naraz** (np. „zmień status na NIEDOSTEPNY dla wszystkich w klatce A")
- Bulk import zmiany cen (xlsx tylko z numerami + nowymi cenami)
- Aktualnie: tylko per-rekord edycja

### 2. Wizualizacja
- **Mapa budynku / rzut piętra** zamiast tabeli — klikalne kafelki z kolorami statusów
- Filtry per kondygnacja / klatka jako wizualne pigułki
- Grafika łatwiej pokazuje „co zostało wolne" niż lista

### 3. Historia zmian per lokal
- Aktualnie brak audit trail dla Unit (kto zmienił status, cenę, przypisanie)
- Można dodać `UnitHistory` (analogicznie do `FloorSummaryItemHistory`) lub generic `Activity` event

### 4. Lepsze zarządzanie rezerwacjami
- UI „przedłuż rezerwację o X dni"
- Notyfikacje gdy rezerwacja wygasa za 24h (email/sidebar dot)
- Lista wszystkich aktywnych rezerwacji z deadline (osobna strona/widget)
- Aktualnie: tylko auto-expire w tle

### 5. Karta lokalu — co pokazujemy
Obecnie `/units/[id]` ma: dane, klientów, service requests, floor plan upload.

Możliwe rozszerzenia:
- Historia ofert dla tego lokalu (klient X dostał ofertę 12.04 — zaakceptowana / odrzucona)
- Historia rezerwacji w czasie
- Linki do dokumentów (umowy, faktury, akt notarialny)
- Notatki/komentarze (free-form lub typed)

### 6. Import — ulepszenia
- **Aktualizacja tylko niektórych pól** (np. „zaktualizuj tylko ceny, zostaw status") — checkboxy w UI uploadu
- Diff w preview pokazuje teraz całe wiersze; rozbudować do diff per pole („Cena: 345 000 → 360 000")
- Aktualnie: pole-po-polu diff działa dla updates, ale przyjazność można poprawić

### 7. Wyświetlanie cen
- Konfigurowalna kolumna „kosztów pozaceny" (np. miejsce postojowe gratis, garaż +30 000 zł)
- Pakiety: mieszkanie + komórka + parking = bundle z rabatem
- Aktualnie: każda pozycja Unit niezależnie wyceniona

### 8. Floor plan
- `floorPlanUrl` istnieje w schema, `FloorPlanUpload` komponent jest. Czy działa? (warto przetestować)
- Możliwe rozszerzenie: gallery (wiele rzutów per lokal — kondygnacja, balkon, widok), nie tylko jeden

### 9. Powiązanie z modułem Drawings (kiedy ruszy)
- Patrz `docs/obmiary-rozpoczecie.md` — w przyszłości rysunek konstrukcji → automatyczne mapowanie elementów na konkretne lokale
- Aktualnie: floor plan upload to tylko obraz/PDF, bez interakcji

### 10. Konkretny bug / dziwne zachowanie
- User może widzieć błąd w widoku lokali który chce naprawić
- Wtedy pytanie: **co dokładnie nie pasuje?**

## Powiązania z innymi modułami

- **Oferty** — `OfferItem.unitId` odwołuje się do Unit. Snapshot ceny przy dodaniu pozycji do oferty (jeśli Unit potem zmieni cenę, oferta zostaje ze starą — celowe).
- **Sprzedaż** — `ContractUnit` łączy Contract z Unit. Konwersja oferty → umowa ustawia Unit na `ZAREZERWOWANY`.
- **Klienci** — `ClientUnit` (many-to-many) — relacja „klient zainteresowany lokalem". Może mieć 2 klientów (małżeństwo).
- **Serwis** — `ServiceRequest.unitId` — zgłoszenia awarii powiązane z konkretnym lokalem.

## Pułapki

- **`number` jest unique** — przy zmianie numeru lokalu Prisma rzuci błąd jeśli duplikat. UI musi to obsłużyć przyjaźnie.
- **Cena za m²** — auto-liczona tylko dla MIESZKALNY/USLUGOWY/KOMORKA. PARKING/GARAZ mają `pricePerSqm = 0` (bo area = 0).
- **VAT zawsze 8%** zaszyte w `lib/units-import.ts` i UI. Jeśli kiedyś zmieni się stawka — `vatRate` jest w schema, ale UI go nie edytuje.
- **`reservedById`** — w schema istnieje pole (`String?`), ale nie wiem czy używane konsekwentnie. Sprawdź przed dodawaniem nowych ficzerów rezerwacji.
- **Import xlsx z opcją „synchronizuj klientów"** — szuka klienta po `firstName + lastName` (case-sensitive). Literówka w xlsx (np. „Jan Kowalski" vs „Jan kowalski") → klient nie znaleziony, warning. NIE tworzy nowych klientów (świadomie).

## Pliki kluczowe

| Plik | Co robi |
|---|---|
| `app/(app)/units/page.tsx` | Lista lokali z statystykami statusów + linki do importu/dodawania |
| `app/(app)/units/[id]/page.tsx` | Detail (dane, klienci, service requests, floor plan) |
| `app/(app)/units/[id]/edit/page.tsx` | Edycja przez `UnitForm` |
| `app/(app)/units/new/page.tsx` | Nowy lokal |
| `app/(app)/units/import/page.tsx` | Server wrapper dla importera |
| `app/api/units/route.ts` + `[id]/route.ts` | CRUD endpoints |
| `app/api/units/import/route.ts` | Import xlsx endpoint (preview/commit) |
| `lib/units-import.ts` | **Mózg importu** — parser xlsx + diff + commit transactional |
| `lib/reservations.ts` | Auto-expire soft reservations |
| `components/units/UnitsTable.tsx` | Tabela z sortowaniem, filtrami, togglable columns |
| `components/units/UnitFilters.tsx` | Filtry (typ, status, search) z query params w URL |
| `components/units/UnitsImporter.tsx` | UI importera (file picker, preview, commit, modal) |
| `components/units/UnitForm.tsx` | Formularz dodawania/edycji |
| `components/units/FloorPlanUpload.tsx` | Upload rzutu mieszkania |
| `components/units/DeleteUnitButton.tsx` | Akcja delete z confirmation |

## Jak rozpocząć w nowej sesji

```
"Przeczytaj docs/lokale-decyzje.md. Chcę edytować sekcję Lokale.
Zadaj mi pytania z sekcji 'Potencjalne kierunki rozwoju' i ustalmy
konkretny zakres zanim zaczniesz kodować."
```

Lub jeśli wiesz dokładnie czego chcesz:

```
"Z docs/lokale-decyzje.md punkt 2 (wizualizacja jako kafelki) —
zrób to. Przedstaw plan."
```

Lub jeśli to konkretny bug:

```
"W /units widzę problem X. Najpierw przeczytaj docs/lokale-decyzje.md
żeby znać architekturę, potem zdiagnozuj."
```
