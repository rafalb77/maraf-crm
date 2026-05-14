# Moduł Przeroby — decyzje projektowe

Kontroling protokołów przerobowych podwykonawców. Porównanie **obmiaru inżyniera (Maraf)** z **przedmiarem kierownika (Konrad)** per kondygnacja → generowanie protokołów rozliczeniowych.

## Architektura danych

```
WorkScope ("Konstrukcja żelbetowa", slug=konstrukcja-zelbetowa)
  └── WorkCategory (Fundamenty, Piony 0, Belki nad 0, Strop nad 0, ...)
       └── WorkItem (Łf-01, S-P.04, Tr-N-01, ...) — POJEDYNCZE elementy z xlsx Marafu

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

| Kondygnacja | Pozycja Konrada | Reguła mapowania Marafu | Tryb |
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

Strona `/przeroby/porownanie/[floor]` liczy `autoValue` Marafu dla **każdej** pozycji z `mappingRule`, niezależnie od `matchMode`. `matchMode` opisuje wyłącznie stan po stronie Konrada (czy ma detal w xlsx, czy nie), nie obecność danych Marafu.

- parsuje `mappingRule` (JSON), filtruje `WorkItem` z reguły, agreguje (`volumeSum` / `areaSum`)
- jeśli reguła nie dopasowała żadnej pozycji obmiaru → `autoValue = null` (UI „—" + warning ⚠ w panelu szczegółów); nie pokazujemy `0,00` jako fałszywej wartości Marafu
- breakdown po `elementType` w panelu szczegółów — przydatne dla pozycji typu „Belki nad I piętro" gdzie reguła bez filtra `elementType` zlicza belki/wieńce/nadproża/wsporniki razem
- porównanie z wartością Konrada: `laborQty` dla `areaSum` (m²), `concreteVol` dla `volumeSum` (m³)
- różnica > 5% → wymaga akceptacji ręcznej (toggle `accepted`)
- pozycja „gotowa do protokołu" = `accepted || manualValue != null || (AUTO_OK && różnica ≤ 5%)` — czyli `AUTO_OK` nadal warunkuje auto-zaliczenie, bo dla pozycji `MANUAL_*` bez ręcznej akcji kierownika nie ma porównania

Label `MANUAL_NOT_FOUND` w UI brzmi „brak u kierownika" — żeby nie mylił z brakiem danych Marafu (Maraf zawsze jest jeśli ma `WorkItem` pasujące do reguły).

`ProtocolGenerator` (komponent) tworzy szkic protokołu na podstawie gotowych pozycji.

### 11. `% kontraktu` — umowna wartość vs wyliczona z protokołów

`SubContract` ma **dwa** pola wartości:
- **`valueNet`** — wyliczana przez `import-protokoly.js` jako `Σ(plannedQty × unitPrice)` pozycji umownych. Pozycje to unia z dotychczasowych protokołów → `valueNet` obejmuje TYLKO zafakturowany zakres. Nadpisywana przy każdym imporcie. Semantycznie: „suma zafakturowanych pozycji".
- **`agreedValueNet`** — umowna wartość netto **całego** zakresu robót (wszystkie kondygnacje + dach). Wpisywana **ręcznie** w UI (`KontraktStat`, kafelek „% kontraktu" w widoku protokołu). Importer jej NIE dotyka.

Wskaźnik `% kontraktu = cumulativeTotal / agreedValueNet`. Gdy `agreedValueNet` nie ustawione → kafelek pokazuje „—" + zachętę do wpisania. **Nie używać `valueNet` jako mianownika `%`** — był to pierwotny błąd (pokazywał 96,5% przy ~60% budynku, bo arkusze obejmowały tylko 3 sekcje). Endpoint zapisu: `PATCH /api/przeroby/contracts/[id]`.

## Pułapki

- **`floor` w FloorSummary** to enum-string: `PARTER`, `I_PIETRO`, ..., `IV_PIETRO`, `V_PIETRO`, `DACH`. Unique `[scopeId, floor]` — nie da się mieć dwóch FloorSummary tej samej kondygnacji w tym samym zakresie (np. dwóch źródeł). Jeśli będziemy chcieli porównanie Konrad vs inny kierownik dla tej samej kondygnacji → trzeba rozszerzyć schema.
- **W pliku Konrada XLS** nazwa arkusza musi być DOKŁADNIE `Ściany i słupy żelb.` (z polskim ż). Inne arkusze (Mury, Posadzki, Elewacja) ignorujemy — nie pasują do obmiaru żelbetu Marafu.
- **Nadziemia Maraf nie ma „Słupów"** — tylko „Trzpienie nadziemia". Słupy są tylko na parterze (`Słupy 0`). Mapowanie to uwzględnia (parter: array `[Słupy 0, Trzpienie 0]`, piętra: tylko `Trzpienie nadziemia`).
- **Maraf `Ścianki fund.` są na parterze** (Kondygnacja 0), nie pod-fundamentowe — Maraf liczy je jako część `Piony 0`. Dlatego mapowanie ścian parteru łączy `[Ściany 0, Ścianki fund.]`.

### 8. Per-user permissions (zastępuje rolę `CONTRACTOR`)

Globalny system dostępu — każdy user ma listę sekcji do których ma dostęp. Konrad ma `['przeroby']`. Maraf-sprzedawca może mieć `['clients', 'oferty', 'sales']`. Admin (z env) zawsze ma wszystko (override).

- **Definicja sekcji**: `lib/permissions.ts` → `ALL_PERMISSIONS` = `['dashboard','clients','units','oferty','sales','service','mailing','calendar','przeroby']` (9 top-level). `settings` jest hardcoded admin-only.
- **Mapowanie URL → permission**: `getRequiredPermission(pathname)` — pokrywa strony `(app)/*` i API `/api/*`. Zwraca `Permission`, `'admin'` (settings/users) lub `null` (auth, statics).
- **Schema**: `User.permissions String[] @default([])`. Default pusty — nowy user ma 0 dostępu, admin nadaje w `/settings`.
- **Server-side gate**: `middleware.ts` czyta `token.permissions` (z JWT). Admin override; brak permission → 403 JSON dla API, redirect na `getFirstAvailableUrl(permissions)` dla stron.
- **Client-side gate**: `Sidebar` filtruje `items` per-section po `session.user.permissions`. Sekcja bez żadnego dostępnego item-a znika.
- **NextAuth callbacks** (`lib/auth.ts`): `jwt()` przy logowaniu (i `trigger === 'update'`) pobiera permissions z DB → token. `session()` propaguje do `session.user.permissions`. Typy w `types/next-auth.d.ts`.

**Zarządzanie w UI**: `/settings` → karta per-user z checkboxami sekcji + „Zaznacz/Odznacz wszystkie" + przycisk zapisu (pojawia się tylko gdy dirty). Endpoint `PATCH /api/users/[id]/permissions` (tylko admin).

**Pułapka snapshot-u**: permissions są snapshot w JWT przy logowaniu (nie czytane co request, żeby uniknąć dodatkowej DB query). Po zmianie w `/settings` user musi się **wylogować i zalogować ponownie**. UI o tym informuje po zapisie.

**Setup nowego usera (np. Konrada)**:
1. `/settings` → „Dodaj użytkownika" (mail + imię) → admin dostaje link aktywacyjny mailem albo kopiuje go ręcznie
2. Po aktywacji w tej samej karcie usera zaznacz checkboxy sekcji (np. „Przeroby" dla Konrada) → „Zapisz uprawnienia"
3. User loguje się → automatycznie ląduje na pierwszej dostępnej sekcji (preferred order: dashboard → przeroby → ...)

**Cleanup**: stary `NEXT_PUBLIC_CONTRACTOR_EMAIL` + `isContractor()` + `contractorCanAccess()` zostały usunięte. Jeśli nadal jest w env Coolify — można usunąć (ignorowane).

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

**Kto edytuje co**: każdy z permission `przeroby` (i admin) edytuje obie wartości — `manualValue` (Maraf) i `konradManualValue` (Konrad). Granularne rozróżnienie (np. `przeroby:edit-maraf` jako osobna permission) **nie jest** zaimplementowane — historia zmian (`FloorSummaryItemHistory.userEmail`) wystarczy do auditingu. Jeśli kiedyś biznesowo trzeba zablokować Konradowi edycję Marafu — wprowadzić osobny permission.

**Pozycja „gotowa do protokołu"** (`totalReady` w page.tsx) — rozszerzona: zaliczona jest też pozycja z `konradManualValue` jeśli Δ ≤ 5% **lub** wpisane jest uzasadnienie. Plus oryginalne kryteria (`accepted`, `manualValue`, `AUTO_OK` w tolerancji).

### 10. Kolumna porównawcza „Maraf (obmiar)" w widoku protokołu (próbna)

Niezależnie od porównania per kondygnacja (`/przeroby/porownanie`), widok pojedynczego protokołu (`/przeroby/protokoly/[id]`) ma **kolumnę „Maraf (obmiar)"** — przy każdej pozycji rozliczenia wykonawcy pokazuje odpowiadającą wartość z obmiaru inżynierskiego Maraf.

**Tryb**: auto-dopasowanie liczone **na żywo** przy renderze + **ręczna korekta** zapisywana w bazie. Pierwotnie miało być pure read-only, ale po feedbacku usera doszła edytowalność:
- `ProtocolItem.marafManualValue` + `marafManualNote` — ręczna wartość **nadpisuje** auto-match
- endpoint `PATCH /api/przeroby/protocols/items/[id]` (gate `przeroby` przez middleware)
- `components/przeroby/MarafCompareCell.tsx` — client component, klik w komórkę → edycja inline (input + komentarz) → zapis + `router.refresh()`
- priorytet wyświetlania: `marafManualValue` > auto-match > zachęta „wpisz ręcznie"

**Mapper** `lib/protokol-maraf-match.ts` — `matchProtocolItemToMaraf(name, section, unit, workItems)`:
- sekcja protokołu → `level` + kondygnacja Maraf (`FUNDAMENTY`/`PARTER` → Kondygnacja 0 ale różne kategorie; piętra → Kondygnacja N)
- reguły keyword-based (`RULES[]`) — nazwa pozycji zawiera słowa kluczowe → kategoria + `elementType` + agregacja (`volumeSum`/`areaSum`)
- **konserwatywne**: mapuje tylko pewne dopasowania. Reszta → `MANUAL` z konkretnym powodem
- **wykluczenia** (`EXCLUSIONS[]`, sprawdzane przed regułami) → od razu `MANUAL`: stal zbrojeniowa (jednostka T/kg — Maraf nie mierzy stali), chudy beton/podkład, roboty ziemne, izolacje, murowanie, dźwig, łączniki, daszki, jednostki mb/stopni/kpl
- **konwersja m³→m²** dla ścian: Maraf liczy ściany objętościowo, wykonawca powierzchniowo → `m³ ÷ 0,18 m` (`WALL_THICKNESS_M`, jak w module Konrada)

**Statusy**: `AUTO` (jednostka zgodna), `CONVERTED` (przeliczona m³→m²), `APPROX` (nazwa w obmiarze nie 1:1 — trzpienie/rdzenie/wieńce/belki), `MANUAL` (porównaj ręcznie).

**UI**: kolumna po „Łącznie", wyróżniona lewą ramką (nie kolorowym tłem — opacity-variant `bg-amber-50/30` źle renderował się w dark mode). Komórka `MarafCompareCell` — wartość + status badge (`bg-X-50/text-X-700`, pattern jak `StatusBadge`) + `Δ%` względem „Łącznie" wykonawcy (czerwone gdy |Δ| > 10%). Pełny opis dopasowania w `title` (tooltip). Banner gdy brak obmiaru Maraf w bazie.

**Status**: próbne (1 protokół). Jeśli reguły się sprawdzą — rozszerzyć/dostroić listę `RULES[]`. Persystencja ręcznych korekt już jest (`marafManualValue`). Możliwe rozszerzenia: historia zmian ręcznych wartości, ujęcie kolumny w generatorze protokołu, próg ostrzegawczy Δ%.

## Otwarte sprawy

- Protokoły przerobowe — **zaimportowane na produkcji 2026-05-13** (7 protokołów, wrzesień 2025 → kwiecień 2026, `scripts/import-protokoly.js`). Kolumna „Maraf (obmiar)" — patrz sekcja 10, status próbny.
- Per-zakres porównanie — obecnie obsługujemy tylko `konstrukcja-zelbetowa`. Inne zakresy (mury, instalacje) — kierunek na przyszłość, schema już to umożliwia.
- Konrad „Przedmiar prac" (główny arkusz, kpl/zł) — nie importowany; mógłby trafić jako `ContractWorkItem` w SubContract z generalnym wykonawcą (do rozważenia)

## Pliki kluczowe

- `lib/przedmiar-konrad-import.ts` — parser xlsx + diff + commit z preservacją
- `app/api/przeroby/przedmiary/upload/route.ts` — endpoint POST FormData
- `components/przeroby/PrzedmiarKonradUploader.tsx` — UI modal
- `app/(app)/przeroby/porownanie/[floor]/page.tsx` — widok porównania per kondygnacja (logika auto-dopasowania)
- `components/przeroby/ComparisonTable.tsx` — tabela z edycją manualValue + accept + historia
- `scripts/import-obmiar.js` — CLI dla obmiaru Marafu (jednorazowy import)
- `scripts/import-protokoly.js` — CLI dla protokołów przerobowych wykonawcy (pełny reimport idempotentny)
- `lib/protokol-maraf-match.ts` — mapper pozycja protokołu → obmiar Maraf (sekcja 10)
- `app/(app)/przeroby/protokoly/[id]/page.tsx` — widok protokołu z kolumną „Maraf (obmiar)"
