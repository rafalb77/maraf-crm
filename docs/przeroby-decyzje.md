# Moduł Przeroby — decyzje projektowe

Kontroling protokołów przerobowych podwykonawców. Porównanie **obmiaru inżyniera (Maraf)** z **przedmiarem kierownika (Konrad)** per kondygnacja → generowanie protokołów rozliczeniowych.

## Architektura danych

```
WorkScope ("Konstrukcja żelbetowa", slug=konstrukcja-zelbetowa)
  └── WorkCategory (Fundamenty, Piony 0, Belki nad 0, Strop nad 0, ...)
       └── WorkItem (Łf-01, S-P.04, Tr-N-01, ...) — POJEDYNCZE elementy z xlsx Marafa

FloorSummary (per kondygnacja: PARTER, I_PIETRO, ..., DACH)
  └── FloorSummaryItem (Ściany żelbetowe parteru, Strop nad parterem, ...)
       └── FloorSummaryItemHistory (audit: kto, kiedy, co zmienił)

Subcontractor → SubContract → ContractWorkItem → Protocol → ProtocolItem
```

## Kluczowe decyzje

### 1. Maraf vs Konrad — porównanie w **m³**, nie m²

Maraf w bazie ma `areaM2` = **footprint** (rzut poziomy ściany, np. 35.91 m² dla I piętra). Konrad podaje **powierzchnię szalunku** ścian (jedna strona, netto otworów, np. 597.32 m²). To **zupełnie różne metryki** — porównanie m² vs m² dało +1563% różnicy (przed naprawą).

**Rozwiązanie**: Konrad m² × grubość (0.18 m) = m³ → porównujemy z Maraf `volumeM3`. Dla I piętra: 597.32 × 0.18 = 107.5 m³ vs Maraf 104.85 m³ = różnica 2.5% (sensowna).

Grubość ścian czytana z xlsx Konrada (kol „gr", indeks 4), fallback `DEFAULT_WALL_THICKNESS_M = 0.18`.

### 2. Mapowanie pozycji Konrada → Maraf

| Kondygnacja | Pozycja Konrada | Reguła mapowania Marafa | Tryb |
|---|---|---|---|
| **PARTER** | Ściany żelbetowe | `Piony 0` + elementType `[Ściany 0, Ścianki fund.]` + Kondygnacja 0 (volumeSum) | AUTO_OK |
| | Słupy/trzpienie | `Piony 0` + `[Słupy 0, Trzpienie 0]` + Kondygnacja 0 (volumeSum) | AUTO_OK |
| | Fundamenty | `Fundamenty` (cała kategoria, volumeSum) | MANUAL_NOT_FOUND |
| | Strop nad parterem | `Strop nad 0` + elementType `Płyta stropowa` (areaSum) | MANUAL_NOT_FOUND |
| | Belki nad parterem | `Belki nad 0` (cała kategoria, volumeSum) | MANUAL_NOT_FOUND |
| | Biegi schodowe | `Biegi schodowe` + Kondygnacja 0 (volumeSum) | MANUAL_NOT_FOUND |
| | Szyby windowe | `Szyby windowe` (cała konstrukcja) | MANUAL_FLOOR_SPLIT |
| **I-IV PIĘTRO** | Ściany żelbetowe | `Piony nadziemia` + `Ściany nadziemia` + Kondygnacja N | AUTO_OK |
| | Trzpienie | `Piony nadziemia` + `Trzpienie nadziemia` + Kondygnacja N | AUTO_OK |
| | Strop / Belki / Biegi | (jak parter, ale `Stropy nadziemia` / `Belki nadziemia`) | MANUAL_NOT_FOUND |
| **DACH** | Atyki | `Belki nadziemia` + Kondygnacja Dachu | MANUAL_NOT_FOUND |
| | Płyta dachu | `Stropy nadziemia` + `Płyta stropowa` + Kondygnacja Dachu | MANUAL_NOT_FOUND |

**Razem 29 pozycji w 6 kondygnacjach** (7 na parterze, 5 na każdym piętrze, 2 na dachu).

**Uwaga semantyczna**: Konrad nazywa „słupy" to co Maraf nazywa „trzpienie nadziemia" (na piętrach). W arkuszu Konrada kolumna „typ" pokazuje TR (trzpień) — mimo nagłówka „słupy". Mapowanie to uwzględnia.

### 3. Pozycje bez detalu u Konrada — `MANUAL_NOT_FOUND`

Z 29 pozycji **tylko 8** ma detal u Konrada (ściany + słupy/trzpienie dla parteru i 4 pięter, do których plik xlsx ma sekcje). Reszta (stropy, belki, fundamenty, biegi, szyby, atyki) — Konrad podaje tylko globalnie w arkuszu „Przedmiar prac" jako kwoty kpl/zł, bez detalu per kondygnacja.

Dlatego: dla tych pozycji `matchMode = 'MANUAL_NOT_FOUND'` + `matchReason` opisuje dlaczego. Maraf jest wyliczany automatycznie z reguły (`autoValue`). Kierownik wpisuje **ręczną wartość Konrada** przez `manualValue` w UI.

### 4. Idempotencja reimportu + zachowanie historii

Reimport pliku Konrada (co miesiąc) wykonuje `prisma.floorSummary.delete()` per kondygnacja, co cascade kasuje `FloorSummaryItem` → `FloorSummaryItemHistory`. **Tracimy historię.**

**Rozwiązanie w `commitImport()` (lib/przedmiar-konrad-import.ts)**:
1. Przed delete pobierz `manualValue`, `manualNote`, `accepted`, `acceptedAt`, `acceptedNote` + całą historię z istniejących itemów (mapa po `floor + normalizedName`)
2. Po recreate przywróć te pola
3. Odtwórz historię z `createMany` z oryginalnymi `createdAt`
4. Dodaj nowy wpis `REIMPORT` z poprzednią wartością Konrada → nową (jeśli się zmieniła) + `userEmail` z sesji

### 5. Audit trail — typy akcji

W `FloorSummaryItemHistory.action`:
- `SET_MANUAL_VALUE` / `CLEAR_MANUAL_VALUE` — user wpisał/wyczyścił wartość ręczną
- `EDIT_NOTE` — zmienił komentarz
- `ACCEPT` / `UNACCEPT` — zaakceptował/cofnął akceptację różnicy
- `REIMPORT` — nowy import xlsx zaktualizował wartość Konrada

Każdy wpis: `oldValue`, `newValue` (JSON serialized), `note`, `userEmail`, `createdAt`. Widoczne w panelu „📜 Historia zmian (N)" pod każdą pozycją w `/przeroby/porownanie/[floor]`.

### 6. Importy — dwa kanały

**Maraf** = jednorazowy → przez **git** (`data/przedmiary/maraf.xlsx` + `COPY data /app/data/` w Dockerfile). Po deployu w Coolify Terminal:
```bash
node scripts/import-obmiar.js konstrukcja-zelbetowa /app/data/przedmiary/maraf.xlsx
```

**Konrad** = co miesiąc → przez **UI** (`/przeroby/porownanie` → przycisk „Wgraj przedmiar Konrada"). Endpoint `POST /api/przeroby/przedmiary/upload` z trybami `preview`/`commit`. Konrad NIE jest commitowany do repo (zawiera ceny ofertowe; plus zmienia się często).

Wzorzec do replikacji w innych modułach (lokale → ten sam pattern w UnitsImporter).

### 7. Auto-dopasowanie i akceptacja różnic

Strona `/przeroby/porownanie/[floor]` liczy `autoValue` Marafa dla **każdej** pozycji z `mappingRule`, niezależnie od `matchMode`. `matchMode` opisuje wyłącznie stan po stronie Konrada (czy ma detal w xlsx, czy nie), nie obecność danych Marafa.

- parsuje `mappingRule` (JSON), filtruje `WorkItem` z reguły, agreguje (`volumeSum` / `areaSum`)
- jeśli reguła nie dopasowała żadnej pozycji obmiaru → `autoValue = null` (UI „—" + warning ⚠ w panelu szczegółów); nie pokazujemy `0,00` jako fałszywej wartości Marafa
- breakdown po `elementType` w panelu szczegółów — przydatne dla pozycji typu „Belki nad I piętro" gdzie reguła bez filtra `elementType` zlicza belki/wieńce/nadproża/wsporniki razem
- porównanie z wartością Konrada: `laborQty` dla `areaSum` (m²), `concreteVol` dla `volumeSum` (m³)
- różnica > 5% → wymaga akceptacji ręcznej (toggle `accepted`)
- pozycja „gotowa do protokołu" = `accepted || manualValue != null || (AUTO_OK && różnica ≤ 5%)` — czyli `AUTO_OK` nadal warunkuje auto-zaliczenie, bo dla pozycji `MANUAL_*` bez ręcznej akcji kierownika nie ma porównania

Label `MANUAL_NOT_FOUND` w UI brzmi „brak u kierownika" — żeby nie mylił z brakiem danych Marafa (Maraf zawsze jest jeśli ma `WorkItem` pasujące do reguły).

`ProtocolGenerator` (komponent) tworzy szkic protokołu na podstawie gotowych pozycji.

## Pułapki

- **`floor` w FloorSummary** to enum-string: `PARTER`, `I_PIETRO`, ..., `IV_PIETRO`, `V_PIETRO`, `DACH`. Unique `[scopeId, floor]` — nie da się mieć dwóch FloorSummary tej samej kondygnacji w tym samym zakresie (np. dwóch źródeł). Jeśli będziemy chcieli porównanie Konrad vs inny kierownik dla tej samej kondygnacji → trzeba rozszerzyć schema.
- **W pliku Konrada XLS** nazwa arkusza musi być DOKŁADNIE `Ściany i słupy żelb.` (z polskim ż). Inne arkusze (Mury, Posadzki, Elewacja) ignorujemy — nie pasują do obmiaru żelbetu Marafa.
- **Nadziemia Maraf nie ma „Słupów"** — tylko „Trzpienie nadziemia". Słupy są tylko na parterze (`Słupy 0`). Mapowanie to uwzględnia (parter: array `[Słupy 0, Trzpienie 0]`, piętra: tylko `Trzpienie nadziemia`).
- **Maraf `Ścianki fund.` są na parterze** (Kondygnacja 0), nie pod-fundamentowe — Maraf liczy je jako część `Piony 0`. Dlatego mapowanie ścian parteru łączy `[Ściany 0, Ścianki fund.]`.

### 8. Rola `CONTRACTOR` (kierownik podwykonawcy, np. Konrad)

Konrad ma własne konto w aplikacji ale widzi **tylko sekcję Przeroby**. Inne strony (klienci, oferty, sprzedaż, settings) są zablokowane:

- **Identyfikacja**: hardcoded email w env `NEXT_PUBLIC_CONTRACTOR_EMAIL` (analogicznie do `NEXT_PUBLIC_ADMIN_EMAIL`). Bez `User.role` w schema — jeden contractor obecnie, jeśli będzie więcej → zmienić na listę albo dodać `role` enum.
- **Server-side gate**: `middleware.ts` na root projektu, używa `next-auth/jwt` `getToken()`. Dla contractor poza białą listą → redirect `/przeroby` (strony) lub 403 JSON (API).
- **Client-side gate**: `components/layout/Sidebar.tsx` filtruje `visibleSections` — contractor widzi tylko grupę „Przeroby". Link Settings też ukryty (bo `isAdmin` zwraca false).
- **Biała lista** (`contractorCanAccess()` w `lib/auth-utils.ts`): `/przeroby/*`, `/api/przeroby/*`, `/api/auth/*` (logout/session).

**Pułapka rebuildu**: `NEXT_PUBLIC_CONTRACTOR_EMAIL` jest inline'owane w client bundle przy `next build` (jak każdy `NEXT_PUBLIC_*`). Po zmianie env w Coolify trzeba **rebuild deploy**, nie restart — inaczej Sidebar client-side nie zauważy roli (mimo że middleware server-side już blokuje).

**Setup nowego contractor'a (np. Konrada)**:
1. `/settings` → dodać usera (email + hasło)
2. Coolify env: `NEXT_PUBLIC_CONTRACTOR_EMAIL=konrad@...`
3. Coolify: redeploy (rebuild)
4. Konrad loguje się → automatycznie ląduje na `/przeroby` (middleware przekierowuje z `/dashboard`)

### 9. Wartość Konrada wpisana ręcznie + uzasadnienie >5%

Dla pozycji `MANUAL_NOT_FOUND` (Konrad nie ma detalu w xlsx „Ściany i słupy żelb.") kierownik (Konrad) wpisuje wartość ręcznie przez pola:

- **`konradManualValue`** — wartość kierownika (m² lub m³). Nadpisuje wyświetlanie w kolumnie „Kierownik" (`refValue()` traktuje to jako pierwszorzędne).
- **`konradManualReason`** — uzasadnienie. **Wymagane** w UI gdy `|Δ| > 5%` vs Maraf (próg `KONRAD_DIFF_THRESHOLD = 0.05` w `ComparisonTable.tsx`). Submit zablokowany do wpisania.

Walidacja progu jest **w UI** (`KonradEditor` ma `reasonMissing` flag). API endpoint NIE waliduje — bo Maraf-value zależy od reguły i bieżącego stanu `WorkItem` (musiałby wykonać query); na MVP wystarczy walidacja frontendowa.

**Audit trail**:
- `SET_KONRAD_VALUE` / `CLEAR_KONRAD_VALUE` w `FloorSummaryItemHistory.action`
- `note` z historii zawiera `konradManualReason`
- `userEmail` z sesji (kto wpisał)

**Reimport zachowuje** `konradManualValue` + `konradManualReason` (preserveMap w `lib/przedmiar-konrad-import.ts`) — analogicznie do `manualValue`. Łapane też w odtworzeniu historii.

**Kto edytuje co**:
| Rola | manualValue (Maraf) | konradManualValue (Konrad) | accepted |
|---|---|---|---|
| Admin | ✅ | ✅ | ✅ |
| Contractor (Konrad) | ❌ (403) | ✅ | ✅ |
| Zwykły user | ✅ | ✅ | ✅ |

Endpoint PATCH zwraca 403 dla contractor który próbuje edytować `manualValue`/`manualNote`. UI ukrywa sekcję Maraf-editora dla contractor (`canEditMaraf` prop z page.tsx). UI pokazuje sekcję Konrad-editora dla admin + contractor (`canEditKonrad`).

**Pozycja „gotowa do protokołu"** (`totalReady` w page.tsx) — rozszerzona: zaliczona jest też pozycja z `konradManualValue` jeśli Δ ≤ 5% **lub** wpisane jest uzasadnienie. Plus oryginalne kryteria (`accepted`, `manualValue`, `AUTO_OK` w tolerancji).

## Otwarte sprawy

- Protokoły przerobowe — `app/(app)/przeroby/protokoly` i scripts `import-protokoly.js` istnieją, ale jeszcze nie zaimportowane dane na produkcji
- Per-zakres porównanie — obecnie obsługujemy tylko `konstrukcja-zelbetowa`. Inne zakresy (mury, instalacje) — kierunek na przyszłość, schema już to umożliwia.
- Konrad „Przedmiar prac" (główny arkusz, kpl/zł) — nie importowany; mógłby trafić jako `ContractWorkItem` w SubContract z generalnym wykonawcą (do rozważenia)

## Pliki kluczowe

- `lib/przedmiar-konrad-import.ts` — parser xlsx + diff + commit z preservacją
- `app/api/przeroby/przedmiary/upload/route.ts` — endpoint POST FormData
- `components/przeroby/PrzedmiarKonradUploader.tsx` — UI modal
- `app/(app)/przeroby/porownanie/[floor]/page.tsx` — widok porównania per kondygnacja (logika auto-dopasowania)
- `components/przeroby/ComparisonTable.tsx` — tabela z edycją manualValue + accept + historia
- `scripts/import-obmiar.js` — CLI dla obmiaru Marafa (jednorazowy import)
