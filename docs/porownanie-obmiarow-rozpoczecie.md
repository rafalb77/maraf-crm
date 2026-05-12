# Porównanie obmiarów — punkt startowy

**Status**: 🟡 user zgłosił chęć rozpoczęcia, ale **zakres nie jest jasny**. Pierwszy krok w nowej sesji = doprecyzować co user ma na myśli.

## Co już istnieje w aplikacji

Pod nazwą „porównanie obmiarów" działa już jedna funkcjonalność:

**`/przeroby/porownanie`** (część modułu Przeroby) — porównuje **obmiar inżyniera Maraf** (z xlsx `Nova Staffa - konstrukcja żelbetowa Przedmiar (Maraf).xlsx`) z **przedmiarem kierownika Konrad** (z xlsx `Przedmiar prac - Staffa - Etap I(konrad).xlsx`), per kondygnacja (parter, I-IV piętro, dach).

Pełen opis: **`docs/przeroby-decyzje.md`**.

## Co user może mieć na myśli (4 interpretacje)

W nowej sesji **najpierw doprecyzuj** który scenariusz. Pytanie do usera:

> „Mówisz o porównaniu obmiarów — chodzi o:
> (1) rozszerzenie istniejącego /przeroby/porownanie (Maraf↔Konrad),
> (2) porównanie wersji obmiaru w czasie (np. Konrad kwiecień vs maj),
> (3) porównanie obmiaru z xlsx z obmiarem z rysunku (gdy ruszy moduł Drawings),
> (4) zupełnie nowe podejście — opisz?"

### Scenariusz (1): Rozszerzenie istniejącego porównania

**Możliwe kierunki**:
- **Eksport do PDF** porównania (jeden dokument zbiorczy dla wszystkich kondygnacji z różnicami)
- **Wykresy / wizualizacje** różnic (pie chart pozycji AUTO/MANUAL, bar chart różnic %)
- **Notyfikacje** gdy różnica przekracza próg (np. mail do kierownika gdy >10%)
- **Snapshot przy każdym imporcie Konrada** — historia „jak wyglądało porównanie 1.04.2026"
- **Bulk akceptacja** różnic w zakresie tolerancji (zamiast klikać każdą pozycję)

**Czas**: 1-3 dni zależnie od scope.

### Scenariusz (2): Porównanie wersji obmiaru w czasie

Konrad dostarcza nowy przedmiar **co miesiąc** (~5 razy w roku). Każdy reimport zastępuje istniejące dane (zachowując `manualValue` przez nasz mechanizm w `lib/przedmiar-konrad-import.ts`).

**Pytanie**: czy user chce **historię** — żeby porównać „Konrad z 1.04 vs Konrad z 1.05"? Np. „W kwietniu Konrad podał 597 m² ścian I piętra, w maju 605 m² — co się zmieniło?".

**Implementacja**:
- Dodać `FloorSummarySnapshot` (nowa tabela) — przy każdym imporcie zapisuje pełen snapshot poprzedniego stanu z timestamp + importedBy
- Strona `/przeroby/porownanie/historia` — lista snapshotów + diff między dwoma wybranymi
- Plus może export do PDF

**Czas**: 2-3 dni.

### Scenariusz (3): Obmiar z xlsx vs obmiar z rysunku

To **logiczna kontynuacja** modułu Drawings (zob. `docs/obmiary-rozpoczecie.md`). Gdy moduł obmiarów z rysunków będzie gotowy:
- Maraf wykona obmiar w xlsx (istniejący → WorkItem)
- Plus moduł Drawings pozwoli klikać na rysunku → DrawingElement
- **Porównanie**: gdzie inżynier się pomylił? Czy automat z rysunku pokazuje to samo?

**Warunek wstępny**: moduł Drawings musi być gotowy (przynajmniej wariant A z `obmiary-rozpoczecie.md`).

**Czas**: 3-5 dni po Drawings.

### Scenariusz (4): Coś innego

Doprecyzuj z userem.

## Powiązania z istniejącym kodem

Niezależnie od scenariusza, **prawie pewnie** dotkniemy:

- `lib/przedmiar-konrad-import.ts` — funkcja `buildPreview()` i `commitImport()`. Już ma logikę zachowania `manualValue` + odtworzenia historii przy reimporcie. To dobry punkt startowy dla historii snapshotów.
- `app/(app)/przeroby/porownanie/[floor]/page.tsx` — widok porównania per kondygnacja, używa `aggMethod` / `mappingRule` z FloorSummaryItem.
- `prisma/schema.prisma`:
  - `FloorSummary`, `FloorSummaryItem`, `FloorSummaryItemHistory` — istniejące tabele
  - `FloorSummaryItem.matchMode` (AUTO_OK | MANUAL_NOT_FOUND | MANUAL_FLOOR_SPLIT | MANUAL_DIFF_UNIT | MANUAL_OUT_OF_SCOPE | MANUAL_OVERRIDE) — może być nowy stan `SNAPSHOT` dla historycznych?

## Co NIE robić od razu

- **Nie dotykaj** istniejącego mechanizmu reimportu Konrada bez przemyślenia migracji — `manualValue` + history są chronione, łatwo to zepsuć (patrz `docs/przeroby-decyzje.md`, sekcja „Idempotencja reimportu").
- **Nie twórz nowych tabel** Drawing* bez konsensusu — schema już ma `DrawingProject`/`Drawing`/`DrawingElement` (`docs/obmiary-rozpoczecie.md`), ale to inny moduł.

## Jak rozpocząć w nowej sesji

```
"Przeczytaj docs/porownanie-obmiarow-rozpoczecie.md. Zapytaj mnie który
ze scenariuszy 1-4 robimy. Po wyborze przedstaw plan implementacji
zanim zaczniesz kodować."
```

Albo jeśli wiesz że to konkretny scenariusz:

```
"Robimy scenariusz 2 z docs/porownanie-obmiarow-rozpoczecie.md
(historia wersji Konrada). Przedstaw plan."
```

## Pliki do potencjalnego dotknięcia (zależnie od scenariusza)

| Scenariusz | Główne pliki |
|---|---|
| 1 (rozszerzenie) | `app/(app)/przeroby/porownanie/**`, `components/przeroby/ComparisonTable.tsx` |
| 2 (historia) | nowa tabela w schema, `lib/przedmiar-konrad-import.ts` (snapshot przed delete), nowa strona `app/(app)/przeroby/porownanie/historia/` |
| 3 (xlsx vs rysunek) | wymaga modułu Drawings, plus nowa strona porównania międzymodułowego |
| 4 | otwarte |
