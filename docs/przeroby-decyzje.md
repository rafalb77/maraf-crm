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

Strona `/przeroby/porownanie/[floor]` liczy automatycznie:
- Dla `matchMode === 'AUTO_OK'`: parsuje `mappingRule` (JSON), filtruje `WorkItem` z reguły, agreguje (`volumeSum` / `areaSum`), porównuje z wartością Konrada (laborQty dla m², concreteVol dla m³)
- Różnica > 5% → wymaga akceptacji ręcznej (toggle `accepted`)
- Pozycja „gotowa do protokołu" = `accepted || manualValue != null || (AUTO_OK && różnica ≤ 5%)`

`ProtocolGenerator` (komponent) tworzy szkic protokołu na podstawie gotowych pozycji.

## Pułapki

- **`floor` w FloorSummary** to enum-string: `PARTER`, `I_PIETRO`, ..., `IV_PIETRO`, `V_PIETRO`, `DACH`. Unique `[scopeId, floor]` — nie da się mieć dwóch FloorSummary tej samej kondygnacji w tym samym zakresie (np. dwóch źródeł). Jeśli będziemy chcieli porównanie Konrad vs inny kierownik dla tej samej kondygnacji → trzeba rozszerzyć schema.
- **W pliku Konrada XLS** nazwa arkusza musi być DOKŁADNIE `Ściany i słupy żelb.` (z polskim ż). Inne arkusze (Mury, Posadzki, Elewacja) ignorujemy — nie pasują do obmiaru żelbetu Marafa.
- **Nadziemia Maraf nie ma „Słupów"** — tylko „Trzpienie nadziemia". Słupy są tylko na parterze (`Słupy 0`). Mapowanie to uwzględnia (parter: array `[Słupy 0, Trzpienie 0]`, piętra: tylko `Trzpienie nadziemia`).
- **Maraf `Ścianki fund.` są na parterze** (Kondygnacja 0), nie pod-fundamentowe — Maraf liczy je jako część `Piony 0`. Dlatego mapowanie ścian parteru łączy `[Ściany 0, Ścianki fund.]`.

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
