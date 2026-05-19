# Integracja z 3D Estate (matryca 3D) — punkt startowy

**Status**: 🟡 projektujemy. **Priorytet: WYSOKI** — wymagane przed faktycznym odpaleniem systemu (ustalone z userem 2026-05-14).

**Stan na 2026-05-19**: ✅ mamy odpowiedź od 3DE + dokument techniczny "Smart Makieta — Jak integrujemy CRM". Spec, mapowanie pól na nasz model, fazowanie i decyzje do podjęcia → **`docs/integracja-3destate-decyzje.md`** (źródło prawdy od teraz). Plik `docs/integracja-3destate-pytania.md` zostaje jako archiwum (treść wysłanego maila).

**Kluczowe ustalenia od 3DE**: model PULL (oni odpytują nas co 15-30 min), my wybieramy autoryzację, format JSON/XML/CSV (wybieramy JSON), stałe IP 3DE: `213.189.56.203`, kontakt: support@3destate.pl, kod zgłoszenia `86c9vnnau`.

## Kontekst

3D Estate dostarcza interaktywną makietę 3D mieszkań osadzoną na stronie inwestycji:
**https://novastaffa.pl/mieszkania/?sm-media=BuildingView&sm-screen-type=UnitSearch&sm-viewer-view=1&sm-viewer-scene=1**

Cel integracji: **CRM staje się źródłem prawdy o cenach i statusach lokali**, a makieta 3D Estate odzwierciedla bieżący stan (cena, dostępność: WOLNY / ZAREZERWOWANY / SPRZEDANY). Dziś prawdopodobnie ktoś aktualizuje to ręcznie po stronie 3D Estate — integracja to automatyzuje.

**Dane historyczne cen** trzyma 3D Estate po swojej stronie — CRM dostarcza tylko bieżący stan, nie musi prowadzić własnej historii (choć patrz „Otwarte decyzje").

## Czego potrzeba od usera (BLOKERY — bez tego nie ruszy kod)

- [ ] **Dokumentacja API 3D Estate** — endpointy, format danych, metoda autoryzacji. **Najpierw zapytać 3D Estate czy mają publiczny portal deweloperski / API docs online** — jeśli tak, wystarczy link, Claude przeczyta sam (WebFetch).
- [ ] **Klucz / credentials API** — tego nigdy nie ma publicznie, trzeba zdobyć od 3D Estate (mailem/telefonicznie).
- [ ] **Kontakt techniczny** u 3D Estate — do pytań gdy dokumentacja niejasna.
- [ ] **Identyfikator inwestycji** w systemie 3D Estate (Nova Staffa Etap 1) — żeby wiedzieć którą inwestycję aktualizujemy.

## Model współpracy (ważne — ustalone z userem)

Claude **nie komunikuje się** bezpośrednio z 3D Estate (nie wysyła maili, nie dzwoni).
- **User = kanał** — przekazuje pytania do 3D Estate, zbiera odpowiedzi/dokumentację/klucze, wkleja Claude'owi.
- **Claude = inżynier** — przygotowuje listę pytań technicznych, analizuje dokumentację, projektuje i pisze integrację, testuje gdy są credentiale.

**Pierwszy krok nowej sesji**: Claude przygotowuje gotową **listę pytań technicznych do 3D Estate** (albo draft maila) — patrz „Pytania do 3D Estate" niżej.

## Otwarte decyzje (do uzgodnienia w nowej sesji)

1. **Kierunek synchronizacji**:
   - **Push** — CRM wysyła zmiany do API 3D Estate (po każdej zmianie ceny/statusu lokalu albo cyklicznie cronem)
   - **Pull** — 3D Estate odpytuje endpoint CRM (musimy wystawić publiczny, autoryzowany endpoint zwracający listę lokali)
   - zależy od tego co 3D Estate w ogóle wspiera — pytanie #1 do nich
2. **Trigger** — przy każdej zmianie w `Unit` (hook w API), czy cyklicznie (cron co X minut/godzin)?
3. **Czy CRM ma prowadzić własną historię cen?** Obecnie `Unit` ma tylko bieżące ceny — brak modelu `PriceHistory`. 3D Estate trzyma historię u siebie, ale historia cen jest też potrzebna do raportowania na dane.gov.pl (patrz `docs/raportowanie-dane-gov-rozpoczecie.md`) — **warto rozważyć wspólny model historii cen dla obu integracji**.

## Pytania do 3D Estate (do dopracowania w nowej sesji — szkielet)

- Czy macie publiczną dokumentację API / portal deweloperski? (link)
- Autoryzacja API — klucz w nagłówku, OAuth, basic auth?
- Kierunek: czy przyjmujecie push od nas (webhook/REST), czy odpytujecie nasz endpoint?
- Format danych lokalu — jakie pola (numer, cena, status, powierzchnia, piętro…)? Jakie wartości statusu rozpoznajecie?
- Jak mapujecie nasze lokale na wasze (po numerze lokalu? osobny identyfikator)?
- Rate limity, częstotliwość aktualizacji?
- Czy jest sandbox/środowisko testowe?
- Jak działa po waszej stronie historia cen — czy coś musimy wysyłać, czy sami logujecie zmiany?

## Co już mamy w CRM (punkt wyjścia)

Model `Unit` (`prisma/schema.prisma`) ma: `number`, `type`, `area`, `pricePerSqmNet/Gross`, `priceNet/Gross`, `vatRate`, `floor`, `rooms`, `building`, `status` (`WOLNY | ZAREZERWOWANY | SPRZEDANY | NIEDOSTEPNY`), `reservationType`, `reservationExpiresAt`. To pokrywa większość tego co makieta potrzebuje.

**Brak**: modelu historii cen, pola z identyfikatorem zewnętrznym (3D Estate ID), endpointu integracyjnego.

## Pliki kluczowe (gdy ruszy implementacja)

- `prisma/schema.prisma` — model `Unit`, ewentualny nowy `PriceHistory` / pole `external3dEstateId`
- `app/api/units/[id]/route.ts` — tu jest update lokalu; miejsce na trigger push
- nowy: `lib/3destate.ts` — klient API, `app/api/integrations/3destate/*` — endpointy (jeśli pull)
- `docs/changelog.md` — wpis po wdrożeniu
