# Raportowanie cen na dane.gov.pl — status i otwarte sprawy

**Status: 🟢 moduł technicznie skończony i wdrożony (2026-05-21). Czeka tylko rejestracja u ministerstwa — user dokończy gdy system będzie w pełni funkcjonalny przed startem.**

Obowiązek ustawowy: Dz.U.2025.758 (ustawa o jawności cen mieszkań, w mocy od 11.07.2025). Codzienne publikowanie cen ofertowych lokali na dane.gov.pl. Kara do 10% obrotu rocznego za niewywiązanie się.

## Co jest gotowe (kod + DB)

| Element | Status | Plik |
|---|---|---|
| Modele Prisma | ✅ wdrożone | `prisma/schema.prisma` — `PriceHistory`, `DaneGovSnapshot` |
| Generator CSV (55 kolumn wg wzorca BPI Piano Forte) + MD5 | ✅ działa | `lib/dane-gov-export.ts` |
| Generator katalogu XML (otwarte_dane_latest.xsd) | ✅ działa | `lib/dane-gov-export.ts` `generateCatalogXml()` |
| Lista ~35 pól Settings dewelopera/biura/inwestycji | ✅ działa | `lib/dane-gov-fields.ts` |
| Hook `recordPriceHistory` (zapis przy create/edit lokalu) | ✅ wired | `app/api/units/route.ts` + `[id]/route.ts` |
| Panel admina (snapshoty + edycja pól + ręczna generacja) | ✅ działa | `/settings/dane-gov`, `components/settings/DaneGovPanel.tsx` |
| Endpoint cron (zamrażanie snapshotu na dzień) | ✅ działa | `POST /api/public/dane-gov/snapshot?secret=...` |
| Endpoint pliku CSV (zamrożona treść per dzień + .md5) | ✅ działa | `GET /api/public/dane-gov/file/[date].csv[.md5]` |
| Endpoint katalogu XML (URL rejestrowany u ministerstwa) | ✅ działa | `GET /api/public/dane-gov/catalog` |
| Tabele w bazie (`prisma db push`) | ✅ wykonane na produkcji | — |
| ENV `DANEGOV_CRON_SECRET` | ✅ ustawiony w Coolify | — |

**Architektura snapshotów (kluczowe!):** harvester ministerstwa pobiera też zasoby historyczne, więc CSV z danego dnia MUSI być niezmienny. Dlatego `DaneGovSnapshot` trzyma wygenerowany CSV + MD5 w bazie (nie generujemy w locie). Endpoint `file/[name]` serwuje zamrożoną treść. Cron upsertuje idempotentnie po dacie — można uruchomić wielokrotnie tego samego dnia.

## ❗ Co zostało do zrobienia (po stronie usera, NIE kod)

### 1. 🟡 Rejestracja katalogu u ministerstwa
- **Mail na `kontakt@dane.gov.pl`** z:
  - URL katalogu: `https://crm.maraf.pl/api/public/dane-gov/catalog`
  - Nazwa dewelopera: MARAF Development Sp. z o.o.
  - NIP, KRS/REGON (te same wartości co w panelu `/settings/dane-gov`)
  - Krótki opis: „Codzienny wykaz cen ofertowych lokali zgodnie z ustawą o jawności cen (Dz.U.2025.758)"
- Po pozytywnej odpowiedzi: ministerstwo dodaje URL do harvestera, który zaczyna pobierać zasoby codziennie.
- Gotowy wzór maila prawdopodobnie w `docs/raportowanie-dane-gov-rozpoczecie.md` (research).
- **Plan usera**: zrobić to gdy CRM będzie w pełni funkcjonalny przed startem produkcyjnym (żeby pierwszy raport miał komplet danych).

### 2. 🟡 Coolify scheduled task (cron)
- **Coolify → Scheduled Tasks → Add**:
  - Command: `curl -X POST "https://crm.maraf.pl/api/public/dane-gov/snapshot?secret=$DANEGOV_CRON_SECRET"`
  - Schedule: codziennie, np. `0 23 * * *` (23:00 — koniec dnia raportowego)
  - 7 dni w tygodniu, nawet bez zmian cen (wymóg ustawowy)
- Po dodaniu sprawdzić w `/settings/dane-gov` że snapshoty się pojawiają.

### 3. 🟡 Wypełnienie kompletu danych dewelopera w panelu
- `/settings/dane-gov` → ~35 pól (3 sekcje: Deweloper / Biuro sprzedaży / Inwestycja).
- Niewypełnione pola trafiają do CSV jako literalne `"X"` (konwencja dane.gov.pl).
- Kluczowe: `companyName`, `devNip`, `devKrs` / `devCeidg`, `devRegon`, adres siedziby, adres biura sprzedaży, lokalizacja inwestycji, `prospektUrl` (PDF prospektu informacyjnego — wgrać i wkleić URL).

## 🟠 Otwarte sprawy techniczne (do rozważenia w przyszłości)

### A. Logowanie cen przy reimporcie xlsx
**Problem**: `lib/units-import.ts` (commit/reimport `/units/import`) **NIE pisze** do `PriceHistory`. Przy reimporcie ze zmienionymi cenami „Data od" w raporcie spadnie do `Unit.updatedAt` (mniej dokładne niż wpis historii).
**Fix**: w `commitImport` przed `tx.unit.update(...)` odczytać `before` (ceny+status) i po update wywołać `recordPriceHistoryIfChanged(tx, unitId, before, after)`. Per row w transakcji. Patrz wzorzec w `app/api/units/[id]/route.ts` (już zaimplementowany dla PUT).
**Priorytet**: średni — dopóki nie ma znaczącej reedycji cen z xlsx, niezbyt istotne.

### B. Weryfikacja nagłówków ze wzorcem ministerstwa
Schemat 55 kolumn został odwzorowany z **realnego, przyjętego pliku** dewelopera BPI Piano Forte (`https://api.dane.gov.pl/media/resources/...csv`). Artykuły mówią o „58 kolumnach" — wzorzec może być aktualizowany.
**Plan**: po pierwszym harveście (gdy ministerstwo zacznie pobierać) sprawdzić czy portal nie zgłasza błędów walidacji.
**Awaryjnie**: porównać z najnowszym przyjętym plikiem innego dewelopera; aktualizować `CSV_HEADERS` w `lib/dane-gov-export.ts` i `buildRow()`.

### C. Wielo-inwestycyjność
Dzisiaj raportujemy **jeden zbiór** = wszystkie lokale w bazie. Jeśli MD będzie miało kolejną inwestycję (drugi etap Nova Staffa albo nowe miejsce), trzeba zdecydować:
- jeden zbiór dla wszystkich (prościej), lub
- osobny zbiór per inwestycja (więcej raportów, większa precyzja kategorii ECON).
Decyzja będzie zależeć od wytycznych ministerstwa po pierwszych odczytach.

### D. Format alternatywny (XML/JSON)
Aktualnie eksportujemy CSV. Format **XML** i **JSON** są też dozwolone przez ustawę. Gdyby ministerstwo wymagało XML — `lib/dane-gov-export.ts` ma już generator XML (dla katalogu); dorobienie XML per-snapshot to ~1 dzień pracy. Na razie CSV (najczęściej używany, sprawdzony).

## Źródła prawdy (do dalszej pracy)

- **`docs/raportowanie-dane-gov-decyzje.md`** — pełne decyzje projektowe, pułapki schematu (puste pola = `"X"`, daty z timezone, parking/komórki jako osobne wiersze), architektura snapshotów.
- **`docs/raportowanie-dane-gov-rozpoczecie.md`** — research formatu, wzorzec BPI, ustalenia 2026-05-15.
- **`lib/dane-gov-export.ts`** — pełna implementacja generatora (55 kolumn CSV + katalog XML).
- **`docs/changelog.md`** wpis pod 2026-05-21 — historia wdrożenia.

## Jak wznowić w nowej sesji

```
Przeczytaj docs/raportowanie.md. Moduł raportowania na dane.gov.pl
jest technicznie skończony — zostały do zrobienia kroki operacyjne:
[wymień który z punktów 1/2/3 chcesz zamknąć]
```

albo (gdy chcesz dorobić logowanie cen przy reimporcie xlsx — punkt A):

```
Z docs/raportowanie.md — dorób logowanie do PriceHistory w
lib/units-import.ts (commitImport), wzorzec jak w
app/api/units/[id]/route.ts PUT.
```
