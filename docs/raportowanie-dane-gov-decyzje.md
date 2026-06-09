# Raportowanie cen do dane.gov.pl — decyzje projektowe

**Status**: 🟡 MVP wdrożony 2026-05-15. Działa generowanie pliku + endpointy harvestera + panel. Otwarte: rejestracja u ministerstwa, komplet danych dewelopera, cron.

Obowiązek ustawowy — ustawa o jawności cen (Dz.U.2025.758, w mocy od 11.07.2025). Codzienne publikowanie cen ofertowych lokali na dane.gov.pl. Kara do 10% obrotu rocznego.

## Research — jak to działa (ustalone 2026-05-15)

- **Model przekazania = harvester**. Deweloper hostuje plik pod stałym, publicznym URL-em; dane.gov.pl odpytuje go sam. Każdy dzień = nowy „zasób" w zbiorze. Obok pliku — plik **MD5** (weryfikacja integralności). Rejestracja **jednorazowo mailem** na `kontakt@dane.gov.pl` (nazwa firmy, NIP, KRS/REGON, URL-e do pliku/katalogu).
- **Harmonogram**: plik aktualizowany codziennie, 7 dni w tygodniu, nawet bez zmian cen.
- **Format**: CSV (UTF-8, separator `,`), XML lub JSON. Wybrano **CSV** — oficjalny wzorzec ministerstwa, najczęściej używany.
- **Schemat** odwzorowany z **realnego, przyjętego pliku** dewelopera BPI Piano Forte (pobrany z `https://api.dane.gov.pl/media/resources/...csv`) — 55 kolumn. Pełna lista nagłówków w `lib/dane-gov-export.ts` (`CSV_HEADERS`). Generyczny XSD `otwarte_dane_latest.xsd` z dane.gov.pl opisuje tylko **katalog** zbiorów/zasobów, nie schemat samych cen.

### Kluczowe pułapki schematu

- **Brak kolumny „status"**. Plik zawiera tylko lokale **aktualnie w ofercie**. Sprzedany = znika z pliku. → raportujemy status `WOLNY` + `ZAREZERWOWANY`, pomijamy `SPRZEDANY`/`NIEDOSTEPNY`. Stała `OFFER_STATUSES` w export lib.
- **Puste pola = literalny `"X"`** (nie pusty string) — konwencja przyjęta przez dane.gov.pl, zgodna ze znakiem umownym `X` z XSD.
- **Daty oferty** w ISO z timezone: `2025-10-31 19:09:53+01:00`. „Data od której obowiązuje oferta" = `changedAt` najnowszego wpisu `PriceHistory`. „Data do" = koniec dnia raportowego (23:59:59 czasu PL).
- **Parking/komórki — decyzja: osobne wiersze** (user 2026-05-14). Ale kolumna 35 „Rodzaj nieruchomości" dopuszcza tylko „lokal mieszkalny"/„dom jednorodzinny" — więc parking/garaż/komórka mają własny wiersz opisany w kolumnach **„części nieruchomości"** (40-42) lub **„pomieszczenia przynależne"** (43-45), a kol. 35-39 zostają puste.
- Ceny z kropką dziesiętną, bez separatora tysięcy.

## Co zostało wdrożone (MVP)

| Element | Plik |
|---|---|
| Modele `PriceHistory` + `DaneGovSnapshot` | `prisma/schema.prisma` |
| Generator CSV + MD5 + katalog XML | `lib/dane-gov-export.ts` |
| Lista pól Settings (bez zależności serwerowych) | `lib/dane-gov-fields.ts` |
| Hook logowania zmian cen | `lib/price-history.ts` + `app/api/units/route.ts`, `app/api/units/[id]/route.ts` |
| Endpointy publiczne (harvester) | `app/api/public/dane-gov/{catalog,file/[name],snapshot}/route.ts` |
| Panel admina | `app/(app)/settings/dane-gov/page.tsx`, `components/settings/DaneGovPanel.tsx`, `app/api/settings/dane-gov/route.ts` |

**Architektura snapshotów**: harvester pobiera też zasoby historyczne, więc plik z danego dnia musi być **niezmienny**. Dlatego `DaneGovSnapshot` trzyma wygenerowany CSV + MD5 w bazie (nie generujemy w locie). Cron generuje raz dziennie (idempotentny upsert po dacie). Endpoint `file/[name]` serwuje zamrożoną treść.

**`PriceHistory`** — model wspólny z planowaną integracją 3D Estate (patrz `docs/integracja-3destate-rozpoczecie.md`). Loguje każdą zmianę ceny/statusu lokalu.

## Otwarte sprawy

- [ ] **Tryb rejestracji Maraf na dane.gov.pl** — user sprawdzi. Endpointy zaprojektowane pod katalog XML (`/api/public/dane-gov/catalog`) jako tryb docelowy; jeśli rejestracja jest na pojedynczy URL lub ręczny upload — dostosować.
- [ ] **Komplet danych dewelopera/inwestycji** — wpisać w `/settings/dane-gov` (~35 pól: KRS, REGON, CEIDG, pełne adresy siedziby/biura sprzedaży/inwestycji, URL prospektu informacyjnego). Niewypełnione → `"X"` w raporcie.
- [ ] **Cron w Coolify** — scheduled task POST na `/api/public/dane-gov/snapshot?secret=...` raz dziennie. Ustawić `DANEGOV_CRON_SECRET` w env.
- [ ] **Logowanie cen przy bulk imporcie** — `lib/units-import.ts` (reimport xlsx) NIE pisze do `PriceHistory`. Przy reimporcie ze zmienionymi cenami „Data od" spadnie do `Unit.updatedAt`. Dorobić wpis do historii w transakcji commitu importu.
- [ ] **Weryfikacja nagłówków ze wzorcem ministerstwa** — schemat odwzorowano z pliku BPI (przyjęty przez portal). Artykuły mówią o „58 kolumnach" — wzorzec bywa aktualizowany. Po pierwszym harveście sprawdzić czy portal nie zgłasza błędów walidacji.
- [ ] Decyzja czy raportować kolejne inwestycje/etapy (dziś: jeden zbiór, wszystkie lokale w bazie).
