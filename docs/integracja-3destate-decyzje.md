# Integracja z 3D Estate — decyzje projektowe

**Status**: 🟡 mamy spec od 3DE (2026-05-18), projektujemy. **Aktualizacja**: 2026-05-19.

## Co dostaliśmy od 3DE

- **Model**: PULL — 3DE odpytuje nasz endpoint co 15-30 min. Mogą też wyzwolić ręczny pull po swojej stronie (per integracja).
- **Format**: JSON / XML / CSV (do wyboru po naszej stronie). **Wybieramy JSON.**
- **Autoryzacja**: do wyboru po naszej stronie (API key / OAuth / Basic). Mogą wołać z **stałego IP 213.189.56.203**.
- **Brak sandboxa** — 3DE testuje na danych prod po naszej stronie.
- **Brak wymogu paginacji** (rekomendują filtrowanie per inwestycja / etap).
- **Kontakt**: support@3destate.pl, kod zgłoszenia `86c9vnnau`.
- Sam mail i PDF spec: zachowane w wątku z userem (data 2026-05-18).

## Wymagane pola — mapowanie 3DE ↔ CRM

| # | 3DE pole | Nasz model | Status | Notatka |
|---|---|---|---|---|
| 1 | ID lokalu (unikalne w firmie) | `Unit.id` (cuid) lub `Unit.number` | ✅ mamy | `number` jest `@unique` i czytelny ("B1.1.M3"). **Decyzja: użyć `number`** — stabilniejszy semantycznie niż cuid. |
| 2 | Typ lokalu | `Unit.type` | ✅ mamy | Mapowanie: `MIESZKALNY` → "Mieszkanie", `USLUGOWY` → "Lokal usługowy", `PARKING` → "Miejsce postojowe", `KOMORKA` → "Komórka lokatorska". |
| 3 | Nazwa lokalu (wyświetlana) | `Unit.number` | ✅ mamy | To samo co ID — proste i czytelne dla użytkownika 3D. |
| 4 | Status | `Unit.status` | ✅ mamy | Mapowanie: `WOLNY`→`Dostępny`, `ZAREZERWOWANY`→`Zarezerwowany`, `SPRZEDANY`→`Sprzedany`, `NIEDOSTEPNY`→`Niedostępny w sprzedaży`. |
| 5 | Metraż | `Unit.area` | ✅ mamy | |
| 6 | Liczba pokoi | `Unit.rooms` | ✅ mamy | Null dla parkingów/komórek — przefiltrować lub zwrócić 0. |
| 7 | Piętro | `Unit.floor` | ✅ mamy | |
| 8 | Karta mieszkania (PDF) | `Unit.floorPlanUrl` | ✅ mamy | URL absolutny (`https://novastaffa.pl/uploads/...`). |
| 9 | Prospekt informacyjny (PDF) | **brak** | 🔴 do dodania | Prawdopodobnie 1 PDF na całą inwestycję. Pole w `Settings` (klucz `prospektInformacyjnyUrl`) albo jako stała w env. **Decyzja do potwierdzenia z userem.** |
| 10 | Widoczność na makiecie (bool) | **brak** | 🔴 do dodania | Nowe pole `Unit.visibleOnMatrix` (Boolean @default(true)). |

### Ceny

| # | 3DE pole | Nasz model | Status | Notatka |
|---|---|---|---|---|
| 1 | Cena podstawowa | `Unit.priceGross` | ✅ mamy | |
| 2 | Cena podstawowa za metr | `Unit.pricePerSqmGross` | ✅ mamy | |
| 3 | Cena promocyjna | **brak** | 🟡 opcjonalne | Pole `Unit.promoPriceGross` lub null gdy bez promocji. |
| 4 | Cena promocyjna za metr | **brak** | 🟡 opcjonalne | j.w. — `Unit.promoPricePerSqmGross`. |
| 5 | Promocja aktywna (bool) | **brak** | 🟡 opcjonalne | `Unit.promoActive` (default false). |
| 6 | Omnibus: najniższa cena 30 dni przed promocją | **brak** | 🟡 wymaga `PriceHistory` | Computed on-the-fly z `PriceHistory`. |
| 7 | Omnibus: najniższa cena/m² 30 dni przed promocją | **brak** | 🟡 wymaga `PriceHistory` | j.w. |

### Historia cen (opcjonalna)

| # | 3DE pole | Nasz model | Notatka |
|---|---|---|---|
| 1 | Data początku obowiązywania ceny | `PriceHistory.startDate` | Logujemy zmiany w `app/api/units/[id]/route.ts`. |
| 2 | Cena | `PriceHistory.priceGross` | |
| 3 | Cena za metr | `PriceHistory.pricePerSqmGross` | |
| 4 | Niedostępność w danym okresie (bool) | `PriceHistory.wasUnavailable` | Czy lokal był `NIEDOSTEPNY` w danym okresie. |

**Wspólne z dane.gov.pl** — `PriceHistory` jest niezbędny dla obowiązku ustawowego, więc i tak musimy go zbudować. Patrz `docs/raportowanie-dane-gov-rozpoczecie.md`.

## Architektura — propozycja

### Endpoint

```
GET /api/integrations/3destate/units?investment=<slug>
Headers:
  X-API-Key: <klucz>           # autoryzacja
Response: 200 OK
Content-Type: application/json
[
  {
    "id": "B1.1.M3",
    "type": "Mieszkanie",
    "name": "B1.1.M3",
    "status": "Dostępny",
    "area": 48.5,
    "rooms": 2,
    "floor": 1,
    "kartaUrl": "https://novastaffa.pl/uploads/floorplans/M3-...pdf",
    "prospektUrl": "https://novastaffa.pl/uploads/prospekt.pdf",
    "visibleOnMatrix": true,
    "priceBase": 412250,
    "priceBasePerSqm": 8500,
    "pricePromo": null,
    "pricePromoPerSqm": null,
    "promoActive": false,
    "omnibusLowest30d": null,
    "omnibusLowest30dPerSqm": null,
    "priceHistory": [...]
  },
  ...
]
```

### Autoryzacja — propozycja

**API key w nagłówku `X-API-Key`** + opcjonalna walidacja IP (213.189.56.203). Klucz generowany jednorazowo, trzymany w `Settings` (klucz `threeDEstateApiKey`) lub env (`THREE_DESTATE_API_KEY`). Walidacja w `app/api/integrations/3destate/units/route.ts` (middleware nie potrzebne, sprawdzenie inline).

### Filtrowanie

Parametr `?investment=<slug>` — na MVP zwracamy wszystko, slug jest opcjonalny (mamy jedną inwestycję). Przyszłościowo, gdy dodamy model `Investment`, filtruje listę.

### Plik kluczowe (gdy rusza implementacja)

- `prisma/schema.prisma` — dodać `Unit.visibleOnMatrix`, ewentualnie `promo*`, model `PriceHistory`
- `lib/3destate.ts` — `STATUS_MAP`, `TYPE_MAP`, `serializeUnit(unit)` zwracający kształt z response'u
- `app/api/integrations/3destate/units/route.ts` — endpoint z auth
- `app/api/units/[id]/route.ts` + `app/api/units/route.ts` — logowanie zmian cen do `PriceHistory`
- `app/(app)/settings/integrations/page.tsx` (nowa) — UI do wygenerowania/zobaczenia API key + opcji
- `docs/changelog.md` — wpis po wdrożeniu

## Fazowanie — propozycja

### Faza 1 — MVP endpoint (bez promocji, bez Omnibus)
- Dodać pole `Unit.visibleOnMatrix` (default true)
- Dodać pole `Settings.threeDEstateApiKey` (lub env) + `prospektInformacyjnyUrl`
- Endpoint `/api/integrations/3destate/units` z `X-API-Key` + JSON
- Mapowanie statusu i typu w `lib/3destate.ts`
- Bez promocji (pola `pricePromo*` zwracamy `null`, `promoActive: false`)
- Bez Omnibus (`omnibusLowest30d*: null`)
- Bez historii cen (zwracamy `priceHistory: []` lub pomijamy pole)
- **Daje minimalny ciągły feed do 3DE — wystarczy do uruchomienia systemu.**

### Faza 2 — `PriceHistory` + Omnibus + dane.gov.pl
- Model `PriceHistory` (cena, cena/m², startDate, wasUnavailable, unitId)
- Logowanie zmian w `app/api/units/[id]/route.ts` (po updates cen) i `app/api/units/route.ts` (po create)
- Backfill: dla istniejących lokali jednorazowy wpis z aktualną ceną i `startDate = Unit.createdAt`
- Computed Omnibus w endpoint 3DE
- Reuse modelu dla raportowania dane.gov.pl

### Faza 3 — promocje (opcjonalne)
- Pola `promoPriceGross`, `promoPricePerSqmGross`, `promoActive` w `Unit`
- UI w `/units/[id]/edit` (sekcja "Promocja")
- Endpoint 3DE zwraca rzeczywiste wartości promocyjne
- Tylko jeśli Maraf planuje używać promocji — na razie bez

### Faza 4 — listy przynależności (opcjonalne)
- Model `Investment` / `Stage` / `Building` z relacjami
- Endpoint listy inwestycji `/api/integrations/3destate/investments`
- Wymaga spotkania technicznego 3DE — odkładamy aż będzie potrzeba (np. drugi etap inwestycji)

## Decyzje (ustalone z userem 2026-05-19)

1. **ID lokalu**: ✅ `Unit.number` (np. `B1.1.M3`) — czytelne, `@unique`, stabilne.
2. **PriceHistory + Omnibus**: ✅ **NIE wysyłamy historii z CRM**. 3DE deklarują że obsłużą historię cen po swojej stronie (z maila: „możliwa jest również ich obsługa po naszej stronie ( np. historia cen )"). Endpoint zwraca tylko aktualne wartości, `priceHistory` w response pomijamy. ⚠️ **Ryzyko operacyjne**: pierwsza promocja włączona zaraz po starcie integracji może nie wyświetlić poprawnego Omnibus po stronie 3DE (nie mają jeszcze 30 dni historii naszych odczytów). Trzeba przekazać userowi przy promocji żeby uważał w pierwszym miesiącu.

   `PriceHistory` po naszej stronie nadal będzie potrzebny — ale dla **dane.gov.pl** (obowiązek ustawowy), nie dla 3DE. Projektowany osobno (`docs/raportowanie-dane-gov-rozpoczecie.md`).
3. **Promocje**: ✅ TAK — dodajemy pola promo od razu (`promoPriceNet/Gross`, `promoPricePerSqmNet/Gross`, `promoActive`) + sekcja w `/units/[id]/edit`.
4. **Klucz API**: ✅ Settings UI — `/settings`, sekcja „Integracje". Klucz w tabeli `Settings` (klucz `threeDEstateApiKey`). Admin może go zrotować bez redeployu.
5. **Prospekt informacyjny PDF**: 🟡 odłożone — pole `Settings.prospektInformacyjnyUrl` jako string, user wgra plik (np. do `/public/uploads/prospekt.pdf`) i wklei URL. Dopóki puste, endpoint zwraca `null` w polu `prospektUrl`. Nie blokuje MVP.

## Architektura — finalne ustalenia

### Endpoint

`GET /api/integrations/3destate/units` (opcjonalny `?investment=<slug>` na przyszłość)

```
Headers:
  X-API-Key: <klucz z Settings.threeDEstateApiKey>
Response: 200 OK / 401 Unauthorized
Content-Type: application/json
[
  {
    "id": "B1.1.M3",
    "type": "Mieszkanie",
    "name": "B1.1.M3",
    "status": "Dostępny",
    "area": 48.5,
    "rooms": 2,
    "floor": 1,
    "kartaUrl": "https://crm.maraf.pl/uploads/floorplans/M3-...pdf",
    "prospektUrl": "https://crm.maraf.pl/uploads/prospekt.pdf",
    "visibleOnMatrix": true,
    "priceBase": 412250,
    "priceBasePerSqm": 8500,
    "pricePromo": null,
    "pricePromoPerSqm": null,
    "promoActive": false
  }
]
```

### Autoryzacja

- API key w nagłówku `X-API-Key`. Klucz generowany w UI Settings (button „Wygeneruj nowy klucz" → 32 bajty hex).
- IP allowlist (`213.189.56.203`) — **opcjonalnie**, pole w Settings `threeDEstateAllowedIp` (jeśli puste, brak walidacji IP). Trzeba zwracać uwagę na X-Forwarded-For za reverse proxy (Coolify).
- Brak session check (publiczny endpoint integracyjny — to **POZA** route group `(app)`, nie ma redirect do `/auth/signin`).

### Schema zmiany

```prisma
model Unit {
  // ... istniejące pola ...
  visibleOnMatrix         Boolean   @default(true)
  promoPriceNet           Float?
  promoPriceGross         Float?
  promoPricePerSqmNet     Float?
  promoPricePerSqmGross   Float?
  promoActive             Boolean   @default(false)
}
```

Nowe klucze w `Settings`: `threeDEstateApiKey`, `threeDEstateAllowedIp`, `prospektInformacyjnyUrl`.

### Mapowanie

`lib/3destate.ts`:

```ts
const STATUS_MAP = {
  WOLNY: 'Dostępny',
  ZAREZERWOWANY: 'Zarezerwowany',
  SPRZEDANY: 'Sprzedany',
  NIEDOSTEPNY: 'Niedostępny w sprzedaży',
}

const TYPE_MAP = {
  MIESZKALNY: 'Mieszkanie',
  USLUGOWY: 'Lokal usługowy',
  PARKING: 'Miejsce postojowe',
  GARAZ: 'Miejsce garażowe',
  KOMORKA: 'Komórka lokatorska',
}
```
