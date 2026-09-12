# Moduł Odbiory — decyzje projektowe

Stan: **MVP zbudowane 2026-09-12** (sesja z Rafałem), niewdrożone na produkcję.
Koncepcja + research rynku i prawa: artefakt „Odbiory MARAF" (rewizja A, 12.09.2026,
https://claude.ai/code/artifact/e0ff6673-ff53-4adc-bdbb-3c34a4765d11).

## Po co

Odbiory robót od wykonawców (najpierw **stan surowy**), później odbiory techniczne
lokali, odbiory z nabywcą (art. 41 ustawy deweloperskiej) i przeglądy gwarancyjne.
Dziś: wydruk rzutu, numer w kółku, legenda ręcznie, skan do wykonawcy mailem.
Cel: to samo cyfrowo — pinezka na rzucie, zdjęcie, wykonawca, termin, status;
pakiet poprawek dla wykonawcy po prywatnym linku; protokół, który składa się sam.

## Decyzje Rafała (12.09.2026)

1. **Priorytet: odbiór robót od wykonawcy** (stan surowy), nie odbiór z nabywcą.
2. Działa na iPadzie, Androidzie, telefonie i komputerze — jedna aplikacja webowa,
   widok terenowy w route group `(mobile)` (bez sidebara), biurowy w `(app)`.
3. Wybór zakresu: **Projekt → Budynek → Klatka → Kondygnacja**; rzuty całych
   kondygnacji (PNG z modułu Rzuty, `public/rzuty/markers.json`).
4. Dotknięcie rzutu = natychmiast pinezka z numerem; **mini-menu**, nie wielki formularz.
5. Zdjęcie + mowa/tekst; **AI proponuje** kategorię, wykonawcę, termin — człowiek
   zatwierdza. **AI nigdy nie uznaje usterki za usuniętą ani nie stwierdza zgodności robót.**
6. **Tryb serii**: raz wybrany typ/wykonawca, kolejne dotknięcia tworzą 13, 14, 15…
7. Legenda generuje się sama z usterek (nic nie przepisujemy).
8. Protokół: uczestnicy z „książki projektu" (użytkownicy CRM + wykonawcy),
   znacznik **„nie stawił się"**; data, inwestycja, zakres i liczba usterek wypełniają się same.
9. „Zakończ odbiór" → formalny protokół PDF + osobny załącznik z rzutem i listą wad.
10. **Wykonawca dostaje link tylko do swoich usterek** — bez licencji, bez aplikacji;
    dodaje zdjęcie „po" i naciska „Gotowe do ponownego odbioru";
    **„ZGŁOŚ N POZYCJI DO PONOWNEGO ODBIORU"** = jedno zbiorcze powiadomienie.
11. Ponowny odbiór: tylko pozycje oczekujące; **Odebrano / Nie odebrano**;
    **tylko osoba odbierająca zamyka usterkę**.
12. Kolory obwódek: czerwony do poprawy, pomarańczowy zgłoszona jako poprawiona,
    zielony odebrana, szary anulowana, fioletowy sporna. Wydruk kolor albo cz-b.
13. Kod usterki `STA-01-A-2-012` = inwestycja-budynek-klatka-kondygnacja-numer.
14. **Offline-first**: w garażu/piwnicy odbiór działa bez internetu i synchronizuje
    się po odzyskaniu zasięgu.

## Jak to zbudowano (MVP)

### Modele (`prisma/schema.prisma`, sekcja MODUŁ: ODBIORY)
`PlanSheet` (arkusz rzutu = klucz z markers.json), `DefectType` (słownik/legenda, kod
stały dla firmy), `Inspection` (odbiór, numer `ODB/2026/0001`), `InspectionAttendee`
(obecni, `present=false` = nie stawił się), `Defect` (pinezka; **`seq` ciągły per
arkusz, nigdy nie reużywany**; `code`; statusy jw.), `DefectPhoto` (PRZED/PO),
`DefectEvent` (oś zdarzeń), `Dispatch` + `DispatchItem` (pakiet wykonawcy; token
w URL, w bazie `tokenHash`, ważność 90 dni). Kod inwestycji (STA) wynika z nazwy — `investmentCode()` w `lib/odbiory/codes.ts`; celowo bez kolumny na `Investment`, żeby deploy przed `db push` nie psuł zapytań modułu Budowa.
Relacje zwrotne: `Investment`, `Subcontractor`, `Unit`.

### Uprawnienie i trasy
- `odbiory` w `ALL_PERMISSIONS`; `/odbiory*` i `/api/odbiory*` → `odbiory`;
  `/w/*` = publiczne (gate = token w handlerze). Sidebar: workspace Budowa → „Odbiory robót".
- Biuro `(app)`: `/odbiory` (lista), `/odbiory/nowy` (kreator), `/odbiory/[id]` (karta:
  usterki / wykonawcy i pakiety / protokół i obecni), `/odbiory/slownik`.
- Teren `(mobile)`: `/odbiory/teren/[id]` (`?tryb=weryfikacja`, `?usterka=<id>`).
- Druk `(print)`: `/odbiory/[id]/protokol` (`?zdjecia=1`, `?kolor=0`) — protokół +
  załącznik z rzutem (SVG nad PNG) + legenda + zestawienie wg wykonawców + zdjęcia.
- Wykonawca `(public)`: `/w/[token]` → `ContractorPortal`.
- API: `app/api/odbiory/**` (structure, inspections, snapshot, attendees, dispatch,
  defects upsert/action/photos, types, subcontractors, ai/parse) oraz
  `app/api/public/odbiory/w/[token]/**` (pakiet, zgłoszenie pozycji, zbiorcze
  zgłoszenie, zdjęcia po tokenie — catch-all `/uploads` wymaga sesji).

### Widok terenowy (`components/odbiory/FieldInspection.tsx` + PlanCanvas/DefectEditor/DefectCard)
- Zoom/pan: `react-zoom-pan-pinch` (pinezki kontr-skalowane — stały rozmiar na ekranie).
- Dotknięcie (bez przesunięcia >8 px) = nowa usterka: lokal z hit-testu obwiedni/konturu
  z markers.json (`lib/odbiory/geometry.ts`), numer = max(seq)+1 lokalnie.
- Mini-menu: chipy typów (ostatnio używane), pole „mów albo pisz" (Web Speech API,
  `useSpeech`), „Uporządkuj (AI)", pomieszczenie, wykonawca (+szybkie dodanie), termin
  (3/7/14 dni, piątek, data), priorytet, zdjęcia (`<input capture>`, kompresja
  `lib/compress-image.ts`). Przyciski: Odrzuć/Anuluj · **Seria** · Zapisz.
- Karta usterki: kod, status, lokal/pom., wykonawca, termin, zdjęcia przed/po;
  **Zdjęcie – Głos – Gotowe**; przy POPRAWIONA/SPORNA: **Odebrano / Nie odebrano** (z uwagą);
  menu: edytuj, poprawiona w imieniu wykonawcy, sporna, anuluj, przywróć.
- Tryb weryfikacji: filtr „do odbioru", po decyzji przeskok do następnej oczekującej.
- Legenda: panel z listą, klik centruje pinezkę.

### Offline-first (`lib/odbiory/offline-store.ts`, `sync.ts`)
- IndexedDB (`idb`): `snapshots` (pełny pakiet odbioru), `outbox` (operacje),
  `blobs` (zdjęcia). Id usterek i zdjęć nadaje klient → API robi **upsert po id**
  (idempotentne ponowienia). Kolejka odtwarzana po `online`, co 20 s i po każdej zmianie.
- Numer usterki proponuje klient; przy kolizji (dwa urządzenia offline na tym samym
  arkuszu) serwer przenumerowuje i klient pokazuje toast.
- **Czego jeszcze NIE ma**: service workera (app shell po przeładowaniu bez sieci).
  Dziś offline działa w ramach otwartej karty + kopia snapshotu; PWA z SW = następny krok.

### AI (`app/api/odbiory/ai/parse/route.ts`)
`claude-opus-5`, structured outputs (`messages.parse` + `jsonSchemaOutputFormat`),
`effort: low`; kontekst: słownik, wykonawcy, dziś (Europe/Warsaw), zakres odbioru.
Zwraca wyłącznie propozycję (`AiDefectSuggestion`). Klucz: `ANTHROPIC_API_KEY` (env).
SDK 0.91.1 nie zna parametru `fallbacks` — nie użyto.

### Pakiet wykonawcy (`createDispatch` w `lib/odbiory/server.ts`)
„Wyślij poprawki" = wszystkie otwarte usterki firmy z odbioru → nowy `Dispatch`
(poprzednie otwarte pakiety tej firmy w tym odbiorze → ZAMKNIETY), token base64url
(24 B), mail HTML z tabelą i linkiem (`lib/mailer.ts`), link zwracany zawsze (SMS/WhatsApp).
Wykonawca: POPRAWIONA (+zdjęcie PO), SPORNA (z uwagą), KOMENTARZ; zbiorcze zgłoszenie →
`Dispatch.status=ZGLOSZONY`, `Task` (ruleKey `ODBIORY_PONOWNY:<dispatchId>:<data>:<n>`)
+ mail do prowadzącego.

## Deploy (checklista)
1. `git push` → Coolify build (zmienione: `next.config.js` — nagłówek Permissions-Policy
   `camera=(self), microphone=(self)`; nowe zależności `react-zoom-pan-pinch`, `idb`).
2. **`prisma db push`** w kontenerze (9 nowych tabel; istniejące tabele nietknięte).
3. Nadać uprawnienie `odbiory` użytkownikom w `/settings`; przelogować.
4. Kod inwestycji STA wynika z nazwy „Nova Staffa" (ostatnie słowo, 3 litery).
5. Wgrać słownik startowy w `/odbiory/slownik` (41 pozycji) i dopisać legendę Rafała.
6. Sprawdzić wykonawców (`Subcontractor.email`) — adresaci pakietów.
7. Wolumen `public/uploads/odbiory/` (persistent volume już obejmuje `public/uploads`).

## Pułapki
- `next.config.js` Permissions-Policy: bez `microphone=(self)` dyktowanie nie działa.
- Middleware przepuszcza anonimowe requesty — publiczne trasy `/api/public/odbiory/w/*`
  mają własny gate (token). `/w/*` jest w `getRequiredPermission` → `null`.
- Ten sam prefiks `/odbiory` w trzech route groups: `(app)/odbiory/[id]`,
  `(mobile)/odbiory/teren/[id]`, `(print)/odbiory/[id]/protokol` — ścieżki różne, OK.
- Karty mieszkań (`Unit.floorPlanUrl`) to PDF bez warstwy tekstowej — MVP używa rzutów
  kondygnacji; rzuty pojedynczych lokali = render PDF→PNG (następny krok).
- Lokalna baza dev: `Unit.building` puste → brak klatek w kreatorze (na prod „B1 / Klatka C").
- Reguły zadań: `ODBIORY_PONOWNY:*` tworzone eventowo (nie przez `generateTasks`), więc
  `reconcileRuleTasks` ich nie dotyka — zamykane ręcznie z pulpitu.

## Następne kroki
1. Test na tablecie na budowie (LTE) + pierwszy prawdziwy odbiór „na dwa tory".
2. Service worker (Serwist) + manifest dla `/odbiory/teren` → pełny offline po przeładowaniu.
3. PDF protokołu zapisywany na serwerze (puppeteer z `lib/pdf-generator.ts`) i mail do wykonawcy z PDF.
4. Odbiór z nabywcą (art. 41): obecni z umowy, liczniki, klucze, podpis na tablecie,
   zadania 14/30 dni, pisma.
5. Dashboard jakości + heatmapa na `/rzuty`; kod QR na drzwiach; checklisty pomieszczeń.
