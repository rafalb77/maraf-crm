# Moduł Sprzedaż — decyzje projektowe

Umowy z klientami: **rezerwacyjne**, **deweloperskie**, **przeniesienia własności**. Konwersja z zaakceptowanej oferty + generowanie DOCX z szablonu.

## Co JUŻ DZIAŁA

### Schema danych

```
Contract (status: W_PRZYGOTOWANIU | PODPISANA | ROZWIAZANA | ANULOWANA)
  ├── number (unique, format M/YYYY/L — np. "1/2026/R")
  ├── type (REZERWACYJNA | DEWELOPERSKA | PRZENIESIENIA)
  ├── clientId → Client (główny klient)
  ├── contractClients: ContractClient[] — wszyscy klienci umowy (np. małżeństwo, position 1/2)
  ├── contractUnits: ContractUnit[] — lokale (z walidacją limitów per typ)
  ├── attachments: ContractAttachment[] — pliki
  ├── history: ContractHistory[] — audit
  ├── plannedSignDate, signedAt
  ├── reservationFee / maxReservationFee
  ├── discount / maxDiscount
  ├── valueNet, valueGross
  ├── landSharePrice
  ├── salesChance (procent — szansa sprzedaży)
  ├── caretaker (opiekun)
  └── form (forma — np. „aktem notarialnym")
```

### Funkcjonalność istniejąca

- **`/sales`** — lista umów (komponenty `ContractStatusChanger`, `DeleteContractButton`)
- **`/sales/new`** — tworzenie nowej umowy ręcznie
- **`/sales/[id]`** — szczegóły umowy (klient, lokale, attachments, history)
- **Konwersja oferty → umowa rezerwacyjna** — przycisk w widoku oferty (`/oferty/[id]`) gdy oferta `ZAAKCEPTOWANA` + ma klienta + lokale. Endpoint `POST /api/oferty/[id]/convert-to-contract` tworzy `Contract` typu REZERWACYJNA + oznacza lokale jako `ZAREZERWOWANY`.
- **Numerowanie**: `lib/contracts.ts → generateContractNumber()` — format `{M}/YYYY/{L}` (M=miesięczny licznik, L=litera typu: R/D/P). Resetuje się co miesiąc per typ.
- **Walidacje limitów** (`lib/types.ts → RESERVATION_CONTRACT_LIMITS`): umowa rezerwacyjna może mieć max 1 MIESZKALNY + 2 PARKING + 2 GARAZ + 1 KOMORKA.
- **Generacja DOCX z szablonu** — endpoint `GET /api/contracts/[id]/generate` zwraca podpisalną umowę. Używa `docxtemplater` + `lib/contract-generator.ts`. Szablon w `templates/umowa-rezerwacyjna.docx` (+ `-original.docx` jako backup). Zmienne dynamiczne: dane klientów (imię, ojciec, matka, PESEL, ID, adres), lokale (numer, powierzchnia, cena, piętro), kwoty słownie (przez `lib/numberToWordsPl.ts`).
- **Auto-expire soft reservations** — `lib/reservations.ts → expireSoftReservations()` automatycznie zwalnia rezerwacje typu MIEKKA których czas wygasł. Wywoływane przy każdym fetch lokali.
- **Status flow** w `ContractStatusChanger`:
  `W_PRZYGOTOWANIU` → `PODPISANA` (po klikniecie) → `ROZWIAZANA` / `ANULOWANA`

### Status lokali podczas cyklu

- `WOLNY` → (umowa rezerwacyjna utworzona) → `ZAREZERWOWANY`
- Plus `reservationType`: `MIEKKA` (z `reservationExpiresAt`) lub `REZERWACJA` (twarda)
- `ZAREZERWOWANY` → (umowa podpisana / aktem notarialnym) → `SPRZEDANY`

## Następny krok — **podpisywanie umów rezerwacyjnych**

User chce żeby można było **podpisywać** umowy bezpośrednio z aplikacji. Obecnie:
- Aplikacja generuje DOCX (gotowy do druku)
- Klient drukuje, podpisuje fizycznie
- Brak ścieżki „wgraj podpisany skan" / „podpisz cyfrowo"
- Status `PODPISANA` ustawiany manualnie bez weryfikacji

### Opcje implementacji (do uzgodnienia z user'em)

#### A. Najprościej — wgranie skanu (MVP, ~1 dzień)

1. Generowanie DOCX (już działa) → klient drukuje, podpisuje
2. **Nowy przycisk** w `/sales/[id]`: „Wgraj podpisaną kopię"
3. Upload PDF/JPG do `ContractAttachment` (z flagą `isSignedCopy: true` — wymaga drobnej zmiany schema)
4. Po uploadzie: auto-ustawia `Contract.signedAt = now()`, `status = PODPISANA`
5. W `ContractHistory` wpis kto, kiedy wgrał

**Zalety**: minimalna zmiana, prawnie OK (papier z podpisem).  
**Wady**: ręczny workflow (drukowanie + skan).

#### B. Podpis online — własna implementacja (~3-5 dni)

1. **Publiczny link** do podpisu (signed URL z tokenem, bez auth) — generowany przy „Wyślij do podpisu"
2. **Strona** `/podpis/{token}` — klient widzi treść umowy (PDF z `lib/contract-generator.ts` lub HTML) + canvas do **narysowania podpisu** myszą/dotykiem
3. Klient klika „Podpisz" → podpis (PNG base64) zapisywany w bazie + `signedAt = now()`
4. Wygenerowany finalny PDF z wstawionym podpisem → mail do klienta + do firmy

**Zalety**: pełen workflow online, dobry dla zdalnej obsługi.  
**Wady**: prawne pytanie — czy odręczny podpis myszą jest wystarczający? W PL można argumentować jako „oświadczenie woli w formie elektronicznej" (Art. 78 KC), ale dla aktu notarialnego (DEWELOPERSKA) i tak trzeba notariusza. Dla **rezerwacyjnej** zwykle wystarcza.

#### C. Profesjonalne e-signing — integracja zewnętrznego serwisu (~2-3 dni + koszt)

Integracja z **Autenti** (PL), **DocuSign** (US), **Adobe Sign**, **SignNow**:
1. Wysyłka DOCX/PDF do API serwisu
2. Klient dostaje mail → klika link → podpisuje na ich stronie
3. Webhook do CRM gdy podpisana → auto status `PODPISANA` + signed PDF w attachments

**Zalety**: prawnie 100% OK (kwalifikowany podpis przy Autenti), audit trail, certyfikat czasu.  
**Wady**: koszt (~2-5 zł/dokument), API key, dependency.

#### D. Hybrydowo (najlepiej praktycznie)

- **Rezerwacyjne** → wariant A (skan) lub B (canvas) — szybko, tanio
- **Deweloperskie / przeniesienia własności** → tradycyjnie u notariusza, ale wciąż DOCX z systemu jako baza

### Co zdecydować przed pisaniem kodu

❓ **Pytanie 1**: Który wariant chcesz dla rezerwacyjnych? (A / B / C)

❓ **Pytanie 2**: Czy potrzebny **„wyślij umowę mailem"** workflow?
- TAK → klient dostaje link, podpisuje, system się dowiaduje
- NIE → handlowiec sam wgrywa skan po podpisaniu przez klienta osobiście

❓ **Pytanie 3**: Co z **PDF zamiast DOCX**?
- Obecnie `generateContractDocx()` zwraca .docx. Może warto też mieć .pdf (przez puppeteer jak dla ofert — gdy temat z `docs/pdf-generator-status.md` zostanie rozwiązany)
- Klient woli PDF (nie wszyscy mają Worda)

❓ **Pytanie 4**: Co z **wielokrotnym podpisem**?
- Małżeństwo → 2 podpisy
- Każdy klient ContractClient widzi inną wersję linku
- Status `PODPISANA` dopiero gdy WSZYSCY podpiszą

### Pliki kluczowe (do edycji przy implementacji)

| Cel | Plik |
|---|---|
| Schema (np. `isSignedCopy` na ContractAttachment, `signatureImage` base64) | `prisma/schema.prisma` |
| Status flow | `components/sales/ContractStatusChanger.tsx` |
| Generacja DOCX/PDF | `lib/contract-generator.ts` |
| Endpoint generate (nowy: signed URL, upload skanu) | `app/api/contracts/[id]/*` |
| Public sign page | nowy `app/(public)/podpis/[token]/page.tsx` (osobna grupa route bez auth) |
| Audit | wpisy w `ContractHistory` |

## Pułapki

- **Walidacja limitów lokali per typ** — obecnie tylko REZERWACYJNA ma limit (1+2+2+1). Inne typy nie. Sprawdź `RESERVATION_CONTRACT_LIMITS` w `lib/types.ts` zanim zmieniasz.
- **Soft reservation** (MIEKKA) — auto-expire jest wywoływane przy każdym fetch lokali. Jeśli klient ma umowę a soft reservation expirowała → niespójność. Po podpisaniu umowy `reservationType` zmień na `REZERWACJA` (twarda, bez expiry) albo na `SPRZEDANY`.
- **Konwersja oferty** ustawia lokale na `ZAREZERWOWANY` ale `reservationType` może być null — uzgodnić co dokładnie ustawić (MIEKKA z expiry 7 dni? REZERWACJA?).
- **Numer kontraktu** generowany przy create — jeśli stworzysz i skasujesz, numer leci „dziurawo". To OK dla audytu.

## Generowanie umów rezerwacyjnych — otwarte sprawy

User zgłosił chęć **dokończenia generatora umów rezerwacyjnych** w nowej sesji. Aktualnie generator DZIAŁA (przycisk „Pobierz" w `/sales/[id]` → endpoint `GET /api/contracts/[id]/generate` → DOCX z szablonu). Co może być „niedokończone":

### Potencjalne kierunki — **zapytaj usera w nowej sesji** który chce

1. **Brakujące pola w szablonie** — czy są zmienne które wychodzą jako `...` zamiast wartości? Patrz `lib/contract-generator.ts` — wszystkie placeholdery z fallback'iem `'...'`. User może chcieć wypełnić te które są pomijane (np. nr aktu notarialnego, nr KW, sprzedawca itp.)

2. **PDF zamiast DOCX** — klient woli PDF (nie wszyscy mają Worda). Rozwiązanie: reuse Puppeteer setupu z ofert (`lib/pdf-generator.ts` + Google Chrome w Dockerfile — już skonfigurowane i działające). Można renderować umowę jako HTML (analogicznie do `lib/offer-pdf-html.ts`) i przepuścić przez ten sam wrapper, ALBO LibreOffice w Docker (`apt install libreoffice`) — wtedy DOCX → PDF jedną komendą `soffice --headless --convert-to pdf`.

3. **Preview w UI przed pobraniem** — obecnie endpoint zwraca plik bezpośrednio. Można dorobić stronę `/sales/[id]/preview` z renderem zawartości umowy (DOCX → HTML preview) + przycisk „Pobierz".

4. **Generator dla pozostałych typów umów** — endpoint odrzuca dla `DEWELOPERSKA` i `PRZENIESIENIA` (linia 23 w `app/api/contracts/[id]/generate/route.ts`: „Generowanie z szablonu dostępne na razie tylko dla umów rezerwacyjnych"). Potrzeba nowych szablonów `templates/umowa-deweloperska.docx`, `templates/umowa-przeniesienia.docx` + rozszerzenie `generateContractDocx` o branch per typ.

5. **Customizable klauzule** — user może chcieć **edytować treść** umowy przed pobraniem (np. dodać specjalną klauzulę dla tego klienta). Wymagałoby UI z polem textarea „dodatkowe zapisy" + placeholder `{#additionalClauses}...{/}` w szablonie DOCX.

6. **Wysyłka mailem do klienta** — analogicznie do ofert. Email z umową w załączniku (DOCX + PDF). Endpoint `POST /api/contracts/[id]/email`. Reuse `lib/mailer.ts`.

7. **Auto-generacja przy konwersji oferty** — obecnie konwersja oferty tworzy `Contract` ale nie generuje DOCX. Może warto auto-wygenerować i zapisać do `ContractAttachment`.

8. **Wersjonowanie wygenerowanych dokumentów** — track zmian w czasie (np. „wygenerowane 5.05, zaktualizowane 12.05 po zmianie ceny"). Wymaga `ContractAttachment` z polem `version: Int`.

9. **Sprzedawca / opiekun** — pole `Contract.caretaker` istnieje (`String?`), ale czy jest używane w szablonie i UI? Może chodzi o podpinanie usera-handlowca jako sprzedawcy umowy.

10. **Konkretny bug** — może user widzi błąd w wygenerowanym DOCX (np. zła odmiana, błędna data, źle sformatowana kwota). Wtedy zapytaj **co dokładnie nie pasuje w PDF**.

### Co zrobić w nowej sesji

1. **Najpierw doprecyzuj z userem** — który z 10 punktów ma na myśli. Pytania:
   - Czy generator zwraca błąd / błędny dokument? (wtedy bug fix)
   - Czy chcesz nowych typów umów (deweloperska, przeniesienia)?
   - Czy potrzebujesz PDF zamiast/obok DOCX?
   - Czy chcesz wysłać umowę mailem z systemu?
   - Czy podpisywanie cyfrowe (osobny temat — sekcja „Następny krok — podpisywanie" wyżej)?

2. Po wyborze kierunku — sprawdź konkretny plik (`lib/contract-generator.ts` lub szablon DOCX) i zaproponuj plan.

## Jak rozpocząć w nowej sesji

```
"Przeczytaj docs/sprzedaz-decyzje.md. Chcę dokończyć generator umów
rezerwacyjnych. Zadaj mi pytania z sekcji 'Generowanie umów — otwarte
sprawy', wybierzemy kierunek, potem plan."
```

Lub jeśli wiesz że to konkretna sprawa, np. PDF:

```
"Z docs/sprzedaz-decyzje.md — chcę żeby umowa była PDF, nie DOCX.
Plan implementacji?"
```

Lub jeśli chodzi o podpisywanie (osobny temat):

```
"Z docs/sprzedaz-decyzje.md sekcja 'Następny krok — podpisywanie'.
Robimy wariant A (wgranie skanu)."
```
