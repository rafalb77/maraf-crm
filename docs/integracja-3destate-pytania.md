# 3D Estate — mail wysłany 2026-05-18

**Status**: ✉️ wysłane do 3D Estate 2026-05-18. Czekamy na odpowiedź.

Framing (ustalony z userem): **nie** ujawniamy, że budujemy własny CRM. Komunikat: „rozważamy zmianę systemu CRM (z Develogic na inny) i pytamy o wymagania integracji". Pytania techniczne są tak sformułowane, żeby odpowiedź dała nam wszystko, co potrzeba do napisania integracji po naszej stronie — bez ujawniania, że to my będziemy ją pisać.

Po stronie 3D Estate brak publicznej dokumentacji API (sprawdzone — nie ma online), więc komplet pytań idzie mailem.

---

## Treść wysłanego maila

> **Temat:** Nova Staffa — zapytanie o wymagania integracji matrycy 3D z systemem CRM
>
> Dzień dobry,
>
> piszę w sprawie inwestycji **Nova Staffa** (matryca 3D na novastaffa.pl/mieszkania).
>
> Po stronie Maraf Development **rozważamy zmianę systemu CRM** — zastanawiamy się nad odejściem od obecnie używanego Develogic na inne rozwiązanie. Decyzja jeszcze nie jest podjęta, ale jednym z kluczowych czynników jest dla nas to, żeby przyszły system płynnie współpracował z Państwa matrycą 3D — bez przerwy w aktualizacji cen i statusów lokali.
>
> Żebyśmy mogli rzetelnie ocenić, które rozwiązania na rynku będą się nadawać, bylibyśmy wdzięczni za informację, jakie wymagania techniczne musi spełniać CRM, żeby zintegrować się z Państwa matrycą. Konkretnie interesuje nas:
>
> **1. Sposób integracji**
> - W jaki sposób przyjmują Państwo dane o lokalach z CRM dewelopera — czy odbierają je Państwo (push / webhook do Państwa API), czy raczej odpytują Państwo CRM pod wskazanym przez niego URL (pull)?
> - Czy istnieje dokumentacja techniczna integracji / portal deweloperski / specyfikacja API, którą moglibyśmy udostępnić rozważanym dostawcom CRM?
> - Jaki rodzaj autoryzacji Państwo stosują (klucz API, OAuth, basic auth)?
> - Czy jest dostępne środowisko testowe / sandbox?
>
> **2. Format danych — czego oczekują Państwo dla pojedynczego lokalu**
> - Lista pól, które Państwo przyjmują lub wymagają (numer lokalu, cena netto/brutto, cena za m², powierzchnia, piętro, liczba pokoi, budynek, status itp.).
> - Format poszczególnych pól (typ, jednostki, kodowanie cen, format daty).
> - Dopuszczalne wartości statusu lokalu (np. jak dokładnie zapisać „wolny" / „zarezerwowany" / „sprzedany").
> - Po jakim kluczu identyfikują Państwo lokal — po numerze lokalu, czy po wewnętrznym identyfikatorze nadanym przez Państwa? Jeśli to drugie, czy moglibyśmy poprosić o listę identyfikatorów lokali Nova Staffa Etap 1 po Państwa stronie oraz identyfikator samej inwestycji?
>
> **3. Operacyjne**
> - Sugerowana lub wymagana częstotliwość aktualizacji oraz ewentualne limity zapytań.
> - Czy aktualizacje mogą iść per-lokal, czy oczekują Państwo pełnej paczki naraz?
> - Czy historia zmian cen prowadzona jest po Państwa stronie, czy oczekują Państwo, żeby CRM coś dodatkowo wysyłał/logował?
>
> **4. Kontakt techniczny**
> - Osoba lub adres, do której moglibyśmy kierować ewentualne dalsze pytania techniczne.
>
> Z góry bardzo dziękuję za pomoc — te informacje pozwolą nam podjąć decyzję świadomie i zapewnić, że ewentualna zmiana nie wpłynie na ciągłość prezentacji oferty na matrycy.
>
> Pozdrawiam serdecznie,
> Rafał Boruch
> Maraf Development
> tel. 501 629 619

---

## Co robić gdy przyjdą odpowiedzi (notatka dla Claude'a)

User wkleja maila zwrotnego → projektujemy. Kluczowe rozgałęzienia:

- **Pull** (oni odpytują nas) → wystawiamy `app/api/integrations/3destate/units` (autoryzowany endpoint, klucz w nagłówku), zwracamy listę lokali w ich formacie. Brak crona po naszej stronie — oni odpytują.
- **Push** (my wysyłamy do nich) → `lib/3destate.ts` (klient API) + trigger w `app/api/units/[id]/route.ts` (po update) oraz `app/api/units/route.ts` (po create). Ewentualnie cron jako fallback / pełna resynchronizacja.
- Pole `external3dEstateId` w modelu `Unit` — dodać tylko jeśli mapują po własnym ID (nie po `number`).
- Model `Unit` ma dziś: `number`, `type`, `area`, `pricePerSqmNet/Gross`, `priceNet/Gross`, `vatRate`, `floor`, `rooms`, `building`, `status`, `reservationType`, `reservationExpiresAt`. Pokrywa typowe potrzeby matrycy.
- Mapowanie statusu (CRM → 3D Estate) — zapisać w `lib/3destate.ts` jako stałą `STATUS_MAP`, na podstawie odpowiedzi 3D Estate.
- Historia cen (`PriceHistory`) — **wspólny temat z raportowaniem dane.gov.pl**, projektować razem (patrz `docs/raportowanie-dane-gov-rozpoczecie.md`).

**Pamiętać o framingu**: w komunikacji z 3D Estate dalej trzymamy się legendy „rozważamy zmianę CRM" — nie ujawniamy że to my piszemy system. Nazwa docelowego CRM pozostaje nieujawniona ("inne rozwiązanie") dopóki sami nie zdecydujemy.
