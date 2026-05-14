# Codzienne raportowanie cen do dane.gov.pl — punkt startowy

**Status**: 🔴 niezaczęte. **Priorytet: WYSOKI** — wymagane przed faktycznym odpaleniem systemu (ustalone z userem 2026-05-14). To **obowiązek ustawowy**, nie funkcja opcjonalna.

## Kontekst

Polska ustawa o **jawności cen ofertowych mieszkań** nakłada na deweloperów obowiązek codziennego publikowania cen wszystkich lokali na rządowym portalu **dane.gov.pl** — w określonym formacie i harmonogramie. Niezgłaszanie / błędne dane = kary.

Maraf Development musi raportować ceny lokali inwestycji Nova Staffa. CRM ma być źródłem tych danych i wysyłać je automatycznie (cron codzienny).

## ⚠️ PIERWSZY KROK nowej sesji — research formatu

Wymagania dane.gov.pl są **publiczne** — Claude może (i powinien) je zbadać na starcie nowej sesji, bez czekania na usera:
- dokładny **schemat danych** (jakie kolumny/pola: cena m², cena całkowita, powierzchnia, status, daty zmian cen, dane dewelopera, lokalizacja inwestycji…)
- **format** — CSV wg wzoru / API / harvester
- **harmonogram** — codziennie? przy każdej zmianie? do której godziny?
- **sposób przekazania** — upload pliku, endpoint API, czy CRM wystawia publiczny URL który dane.gov.pl odpytuje (harvesting)
- aktualne **rozporządzenie wykonawcze** określające szczegóły techniczne

Dopiero po tym researchu można zaprojektować implementację.

## Czego potrzeba od usera (BLOKERY)

- [ ] Czy Maraf Development jest **już zarejestrowany** jako dostawca danych na dane.gov.pl? Jeśli nie — to formalność po stronie usera (rejestracja firmy/instytucji na portalu), pierwsza rzecz do zrobienia.
- [ ] **Identyfikator dostawcy / dane dostępowe** do konta dane.gov.pl (jeśli portal wymaga API key / logowania do uploadu).
- [ ] Potwierdzenie **kompletu danych dewelopera + inwestycji** wymaganych przez schemat (NIP, nazwa, adres inwestycji, pozwolenie na budowę itp. — zależnie od tego co schemat wymaga).
- [ ] Decyzja czy raportujemy tylko Nova Staffa Etap 1, czy system ma być gotowy na kolejne inwestycje/etapy.

## Otwarte decyzje (do uzgodnienia po researchu)

1. **Mechanizm wysyłki** — zależny od tego co dane.gov.pl wspiera:
   - CRM generuje plik (CSV/XML) i wysyła go API/uploadem cronem
   - CRM wystawia publiczny endpoint (np. `/api/public/ceny-dane-gov`) który portal odpytuje (harvesting) — wtedy „codzienne" znaczy „zawsze aktualne"
2. **Historia cen** — ustawa wymaga raportowania **dat zmian cen**. Obecnie `Unit` ma tylko bieżące ceny, **brak modelu `PriceHistory`**. Trzeba go dodać — i logować każdą zmianę `priceNet/priceGross/pricePerSqm*`. **Ten sam model przyda się integracji 3D Estate** (patrz `docs/integracja-3destate-rozpoczecie.md`) — zaprojektować wspólnie.
3. **Cron** — gdzie uruchamiać? Coolify ma scheduled tasks, albo endpoint + zewnętrzny cron, albo `node-cron` w aplikacji. Do ustalenia.
4. **Zakres lokali** — czy raportujemy wszystkie typy (`MIESZKALNY`, `USLUGOWY`, `PARKING`, `KOMORKA`...) czy tylko mieszkania? Ustawa precyzuje — sprawdzić w researchu.

## Co już mamy w CRM (punkt wyjścia)

Model `Unit` (`prisma/schema.prisma`): `number`, `type`, `area`, `pricePerSqmNet/Gross`, `priceNet/Gross`, `vatRate`, `floor`, `rooms`, `building`, `status`. Bieżące ceny są — **brak historii zmian cen** (kluczowy brak dla tego obowiązku).

Dane firmy (NIP, adres) — częściowo w tabeli `Settings` (konfiguracja firmy w `/settings`). Sprawdzić czy komplet wymagany przez schemat dane.gov.pl.

## Pliki kluczowe (gdy ruszy implementacja)

- `prisma/schema.prisma` — nowy model `PriceHistory` (wspólny z 3D Estate), ewentualne dodatkowe pola dewelopera/inwestycji
- `app/api/units/[id]/route.ts` + `app/api/units/route.ts` — tu logować zmiany cen do `PriceHistory`
- nowy: `lib/dane-gov-export.ts` — generator pliku w formacie portalu
- nowy: `app/api/public/*` lub cron job — wysyłka/wystawienie danych
- `docs/changelog.md` — wpis po wdrożeniu
- `docs/infrastruktura.md` — dopisać dane konta dane.gov.pl + harmonogram crona
