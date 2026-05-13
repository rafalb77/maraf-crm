# Import kart mieszkań (floor plan PDF) — status

**Stan na 2026-05-13 koniec sesji**: kod wgrany na `main` (commit `d05a50f`), Coolify rebuilduje. User ma odpalić **dry-run** w Coolify Terminal i wkleić output do Claude'a przed właściwym importem.

## Kontekst

Maraf ma 59 kart mieszkań w PDF (po jednej na lokal MIESZKALNY). Pliki leżą lokalnie u usera w `C:\Users\Rafał\Desktop\Karty` — zostały zcommitowane do repo jako `data/karty/` (18MB pushed) i są w obrazie Dockera pod `/app/data/karty` (Dockerfile ma `COPY data/ ./data/`). Wewnątrz są podfoldery `Pietro 1/`, `Pietro 2/`, `Pietro 3/`, `Pietro 4/` z plikami `nr1.pdf` … `nr59.pdf` (globalna numeracja, nie per-piętro).

**Cel**: dla każdego `Unit` typu `MIESZKALNY` ustawić `floorPlanUrl = /uploads/floorplans/<numer>-<ts>.pdf`, a sam PDF skopiować do persistent volume `/app/public/uploads/floorplans/` żeby był serwowany przez Next.js statycznie po deployu.

## Co próbowaliśmy najpierw (NIE DZIAŁA)

Pierwsza wersja `scripts/import-floorplans.js` (commit `cc444bf`) parsowała PDF przez **pdf-parse**, wyciągała tekst typu `40,48 m² … I PIĘTRO` i mapowała na `Unit` po `floor + area (±0.05)`.

**Wynik dry-run u usera**: `0 OK, 59 błąd parsowania`. Karty mieszkań mają fonty osadzone **bez CMap** — pdf-parse zwraca pusty tekst albo śmieci. Nie da się tej drogi uratować bez OCR (a OCR dla 59 plików to overkill na jednorazowy import).

## Aktualna strategia (DETERMINISTYCZNA — commit `d05a50f`)

Skrypt **nie parsuje PDF w ogóle**. Mapowanie po nazwach plików:

1. **Folder name → numer piętra**: regex `/Pi[ęe]tro\s*(\d+)/i` na każdym segmencie ścieżki względnej (np. `Pietro 1` → 1, `Pietro 4` → 4). Fallback dla rzymskich (`I pietro`, `II pietro`) — niepotrzebny dla aktualnych danych ale zostawiony.
2. **Filename → globalny numer pliku**: regex `/nr(\d+)/i` (np. `nr1.pdf` → 1, `nr59.pdf` → 59).
3. **Z bazy**: `SELECT Unit WHERE type='MIESZKALNY' ORDER BY number ASC`.
4. **Mapowanie**: N-ty plik (po globalnym numerze) = N-ty `Unit` z posortowanej listy. Czyli `nr1.pdf` → pierwszy lokal MIESZKALNY w bazie (po `number ASC`), `nr59.pdf` → 59-ty.
5. **Weryfikacja**: jeśli `Unit.floor !== folderFloor` → warning w outpucie (nie zatrzymuje skryptu, ale flaguje).

**WAŻNE — sort numeryczny (poprawione commit `7955943`)**: Prisma `orderBy: { number: 'asc' }` sortuje stringami → `M1, M10, M11, M12, M13, M14, M15, M2, M3, ..., M9`. Maraf numerował pliki PDF intuicyjnie (`M1=nr1, M2=nr2, ..., M15=nr15`) więc sortujemy w JS przez `extractTrailingNumber(unitNumber)` — wyciągamy końcowy `\d+` z `"B1.1.M2"` (→ `2`) i sortujemy numerycznie. Na piętrach 2-4 problemu nie było (wszystkie 2-cyfrowe `M16..M59`, alfabetycznie = numerycznie), tylko piętro 1 wymagało fixa.

**Dwie literówki w `Unit.floor` w bazie** (znalezione w dry-run, NIE wpływają na mapowanie PDF→Unit):
- `B1.2.M18` ma `floor=3` (powinno 2, sąsiednie M16/M17/M19 mają 2) — pewnie błąd przy imporcie xlsx
- `B1.4.M59` ma `floor=5` (powinno 4, sąsiednie M46..M58 mają 4) — j.w.

Po imporcie kart user musi w `/lokale/<id>/edit` poprawić te dwa. Nie blokuje importu PDF (PDF jest poprawnie sparowany z lokalem, tylko `floor` w bazie ma typo).

**Plik**: [scripts/import-floorplans.js](../scripts/import-floorplans.js).

## Co user ma zrobić (next session start tu)

### 1. Dry-run

W **Coolify Terminal** kontenera CRM (po deployu commit `d05a50f`):

```bash
node scripts/import-floorplans.js /app/data/karty --dry-run
```

Spodziewany output:
- `📂 Katalog: /app/data/karty`
- `🔍 Dry-run: TAK (bez zmian)`
- `📄 Znaleziono 59 plików PDF`
- `🏠 Mieszkań w bazie: 59` (lub ile jest faktycznie — sprawdzić!)
- 59 linii `✓ Pietro X/nrY.pdf → <number> (floor=<n>, <area> m²)`
- Podsumowanie: `✅ Zmapowane: 59`, `⚠️ Niezgodne piętro: ?`, `❌ Poza zakresem: ?`

**User wkleja output do Claude'a** — weryfikujemy:
- Czy 59 plików zmapowanych na 59 lokali (bez „poza zakresem")?
- Czy `Niezgodne piętro` = 0? Jeśli >0 to znak, że założenie z punktu 4 jest błędne — wtedy mówimy STOP i zmieniamy strategię.
- Czy `nr1.pdf` faktycznie mapuje się na lokal z parteru/piętra 1, `nr59.pdf` na najwyższe piętro?

### 2. Właściwy import (po akceptacji)

```bash
node scripts/import-floorplans.js /app/data/karty
```

Skrypt:
- Tworzy `/app/public/uploads/floorplans/` (volume).
- Dla każdego mapping'u kopiuje plik jako `<safeNumber>-<timestamp>.<ext>` (np. `M3-1715551234567.pdf`).
- `UPDATE Unit SET floorPlanUrl = '/uploads/floorplans/<filename>'` po `id`.
- Po 10 plikach loguje progress.

### 3. Weryfikacja w UI

Po imporcie wejść na dowolny `/lokale/<id>` w UI — powinien być widoczny link/preview do karty PDF. Jeśli 404 → sprawdzić czy volume w Coolify jest faktycznie zamontowany na `/app/public/uploads` (powinno być, ale potwierdzić).

### 4. Cleanup (opcjonalnie, po sukcesie)

Po pomyślnym imporcie folder `data/karty/` w repo nie jest już potrzebny (PDF-y są w volume produkcyjnym). Można go usunąć:

```bash
git rm -r data/karty
git commit -m "Lokale: usuwam tymczasowe karty z repo (zaimportowane do volume)"
git push
```

Tymczasowy commit `9f8521f tmp: karty mieszkan do importu` zostaje w historii — nie warto rewriteować, repo nie jest publiczne.

## Co może pójść nie tak — checklist

- **Coolify nie zrebuildował** → komenda zwróci stary skrypt (parsujący PDF). Sprawdzić w Coolify że deployment commit `d05a50f` zakończył się `Healthy`. W ostateczności manualny redeploy.
- **`Mieszkań w bazie: 0`** → nie zaimportowane lokale (skrypt `import-units.js` lub UI `/lokale/import`). Patrz [docs/lokale-decyzje.md](lokale-decyzje.md).
- **`Mieszkań w bazie: ≠59`** → albo są lokale których nie ma w PDF, albo brakuje lokali w bazie. Wkleić output, ustalimy które.
- **„Niezgodne piętro" > 0** → założenie globalnej numeracji `nr1..nr59 ↔ Unit.number ASC` jest błędne. Możliwe że Maraf numerował per-piętro, nie globalnie — wtedy `nr1.pdf` z folderu `Pietro 1` to inny lokal niż `nr1.pdf` z folderu `Pietro 2`. Wtedy trzeba przepisać skrypt na sortowanie `ORDER BY floor ASC, number ASC` + osobny licznik per piętro.
- **PDF nie ładuje się w UI po imporcie** → 404 na `/uploads/floorplans/...`. Patrz `/lokale/[id]/page.tsx` — czy faktycznie używa `floorPlanUrl` w `<a>`/`<embed>`. Jeśli komponent nie był dodany w MVP, to trzeba dorobić (osobny task).

## Pliki kluczowe

- [scripts/import-floorplans.js](../scripts/import-floorplans.js) — skrypt importera (deterministyczny)
- `data/karty/Pietro {1..4}/nr{1..59}.pdf` — źródło (zcommitowane, w obrazie pod `/app/data/karty`)
- `/app/public/uploads/floorplans/` — docelowy volume na produkcji
- `prisma/schema.prisma` — `Unit.floorPlanUrl String?`
- [Dockerfile](../Dockerfile) — `COPY data/ ./data/` w runner stage, scripts/ kopiowane razem z @prisma/client + bcryptjs
