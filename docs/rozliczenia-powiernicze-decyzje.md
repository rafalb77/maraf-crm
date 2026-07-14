# Moduł Rozliczenia powiernicze — decyzje

🟢 **Zbudowany 2026-07-14** (kod gotowy, zweryfikowany testami + E2E na lokalnej bazie). **WYMAGA na produkcji `prisma db push`** (3 nowe tabele + kolumny — patrz Deploy).

Kontrola wpłat nabywców z **rachunków powierniczych** (OMRP/ZMRP) wobec **harmonogramu z umowy deweloperskiej** (`ContractPayment`), na podstawie **wyciągu z bankowości ING Banku Śląskiego**. Rejestr wpłat + rejestr odsetek za opóźnienie + alerty.

Osadzony w module Finanse (`/finanse/powiernicze`), **tylko Maraf Development** (jak Finansowanie inwestycji). Buduje na istniejącym fundamencie z etapu 2 Finansowania (`EscrowAccount/Deposit`, `ContractPayment`, `lib/contract-escrow.ts`).

## Przepływ (jak to działa)

1. **Import wyciągu** (`/finanse/powiernicze` → zakładka *Import wyciągu*): user wgrywa plik z ING (MT940 / CSV / camt.053). Format wykrywany automatycznie. Tryb **podgląd** pokazuje sparsowane pozycje + wstępne dopasowanie, tryb **import** zapisuje.
2. **Auto-dopasowanie**: każdą wpłatę (CREDIT) system dopasowuje do raty `PLANOWANA` po sygnałach (subrachunek OMRP → nr umowy → nazwisko → kwota → nr lokalu). Wynik: `MATCHED` (pewne) / `SUGGESTED` (do przeglądu) / `UNMATCHED`.
3. **Zaksięgowanie** (zakładka *Dopasowanie*): Marta przegląda i księguje. Zaksięgowanie = rata `OPLACONA` + `EscrowDeposit` (source=BANK) + (gdy po terminie) naliczenie odsetek. Człowiek zatwierdza — automat nie księguje sam z siebie (można hurtowo „Zaksięguj dopasowane").
4. **Rejestry**: *Rejestr wpłat* (wszystkie zaksięgowane wpłaty + różnice + źródło), *Rejestr odsetek* (naliczenia okresowe z rozbiciem na stawki).
5. **Alerty** (zakładka *Przegląd*): zaległe raty (+narosłe odsetki), niedopasowane wpływy, niedopłaty, sugestie, nadchodzące terminy.

## Schema (nowe)

- **`BankStatement`** — zaimportowany wyciąg. Idempotencja po `fileHash` (sha256 pliku). Link do `EscrowAccount` (auto po IBAN lub ręcznie).
- **`BankTransaction`** — pozycja wyciągu. `side` CREDIT/DEBIT, `matchStatus`, `contractPaymentId`, `dedupeKey` (unikalny w obrębie wyciągu → re-import bez duplikatów). 1:1 z `EscrowDeposit`.
- **`PaymentInterest`** — rejestr odsetek (1:1 z `ContractPayment`). `breakdown` (Json) = rozbicie na okresy stawek.
- Rozszerzenia: `Contract.escrowSubaccount` (indywidualny subrachunek OMRP nabywcy — jeśli wypełniony, dopasowanie jest pewne), `Contract.interestType`/`interestCustomRate` (ustawowe vs umowne), `EscrowDeposit.bankTransactionId` + `source=BANK`, `ContractPayment.bankTransactions[]`/`interest`.

## Formaty ING (zweryfikowane z dokumentacją ING, 2026-07-14)

`lib/bank-import/` — dyspozytor + 3 parsery, wspólny znormalizowany `ParsedStatement`.

- **MT940** (`mt940.ts`) — ING BusinessOnLine / SIMP-MARS. **Pułapki ING** (potwierdzone z PDF-ów ING): kod transakcji `S`+3 cyfry (nie SWIFT `N`); **dwie linie `:86:` na transakcję**; podpola **tyldowe** `~20-28`=tytuł, `~32/~33`=nazwa, `~38`=IBAN, `~29`=NRB; techniczna pozycja `S940` z kwotą 0,00 (pomijana); po `//` w `:61:` identyfikator SIMP/MARS (rachunek wirtualny nabywcy) → `bankRef`.
- **CSV** (`csv.ts`) — Moje ING / ING Business. `;`, przecinek dziesiętny, CP1250, debet=minus, daty ISO. Preambuła + stopka pomijane. **Kolumny mapowane po NAZWACH nagłówków** (nie po pozycji) — odporne na warianty eksportu.
- **camt.053** (`camt.ts`) — ISO 20022 XML. Obsługa **v02** (wycofywany 11.2026) i **v08** (rekomendowany) — nawigacja po nazwach lokalnych. Wpływ (CRDT) → płatnik `Dbtr/Nm`, tytuł `RmtInf/Ustrd`. Obsługa przelewów zbiorczych (wiele `TxDtls`).

**Kodowanie** (`decode.ts`): XML→UTF-8; inne → UTF-8 jeśli poprawne, inaczej Windows-1250. **Ograniczenie:** pliki MT940 w CP852 (SIMP/MARS) dekodujemy jako 1250 — ASCII (IBAN/kwoty/nr umów) identyczne, różnią się tylko polskie znaki w nazwach (a te przy dopasowaniu normalizujemy). Do dostrojenia na realnym pliku.

## Silnik dopasowania (`lib/bank-reconcile.ts`)

Scoring pary (transakcja, rata), sygnały malejąco: subrachunek OMRP (+100, decydujący) → nr umowy w tytule (+55) → nazwa/nazwisko nabywcy (+40/+25) → kwota dokładna/w tolerancji (+30/+22) → nr lokalu (+12). Progi: `MATCHED` gdy sygnał decydujący/≥55 **i** kwota się zgadza **i** brak niejednoznaczności; `SUGGESTED` gdy ≥40; inaczej `UNMATCHED`. Niejednoznaczność (dwóch bliskich kandydatów) → nigdy auto-MATCHED. Tolerancja kwoty domyślnie ±0,5% (min. 1 zł). Niedopłata/nadpłata oznaczana w powodzie, nie blokuje sugestii.

## Odsetki (`lib/interest.ts`)

**Metoda okresowa** — stawka odsetek ustawowych za opóźnienie zmienia się z decyzjami RPP (art. 481 KC = stopa ref. NBP + 5,5 p.p.). Dla opóźnienia obejmującego kilka okresów naliczenie rozbijane na segmenty (`breakdown`). Baza actual/365, odsetki od dnia po terminie do dnia zapłaty włącznie. Obsługa odsetek **umownych** (`Contract.interestType=UMOWNE` + własna stawka).

**Tabela `DELAY_RATE_PERIODS`** — zweryfikowana 2026-07-14 (research + kontrola krzyżowa: taxmachine.pl, wskazniki.gofin.pl, art. 481 KC), 2020–2026, stan aktualny **9,25%** (od 2026-03-05). ⚠️ **Aktualizować przy każdej zmianie stopy referencyjnej NBP** (edycja tablicy w `lib/interest.ts` — źródło prawdy: obwieszczenia Ministra Sprawiedliwości).

## Pliki

```
prisma/schema.prisma                       — BankStatement, BankTransaction, PaymentInterest + rozszerzenia
lib/interest.ts                            — silnik odsetek + tabela stawek
lib/bank-import/{index,util,decode,mt940,csv,camt}.ts  — parsery wyciągów
lib/bank-reconcile.ts                      — dopasowanie + księgowanie (apply/unapply)
lib/bank-statement-import.ts               — commit wyciągu + auto-link konta
lib/escrow-alerts.ts                       — agregacja alertów
app/api/finanse/powiernicze/*              — statements, transactions/[id], reconcile, alerts, register, interest
app/(app)/finanse/powiernicze/page.tsx     — strona (bramka MD-only)
components/finanse/powiernicze/*           — PowiernniczeView (taby) + Alerty/Import/Dopasowanie/RejestrWplat/RejestrOdsetek
components/layout/Sidebar.tsx              — link „Rozliczenia powiernicze"
```

## Deploy (produkcja)

1. **`prisma db push`** w Coolify Terminal (`node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss`) — nowe tabele `BankStatement`/`BankTransaction`/`PaymentInterest` + kolumny na `Contract`/`EscrowDeposit`. Flaga `--accept-data-loss` bezpieczna: dotyczy tylko unikalnego indeksu na **nowej** (pustej, NULL) kolumnie `EscrowDeposit.bankTransactionId`.
2. **Rebuild** (nie restart) — nowe strony/API.
3. Uzupełnić `EscrowAccount.accountNumber` (IBAN) dla auto-przypisania wyciągów do kont.

## Testy (2026-07-14)

- Jednostkowe: parsery MT940/CSV/camt na syntetycznych próbkach ING; odsetki wielookresowe (100 000 zł, 89 dni przez 2 stawki = 2277,40 zł ✓); dopasowanie (auto-match przy nr umowy+nazwisko+kwota; odmowa przy samej kwocie; ignorowanie DEBIT).
- E2E na lokalnej bazie: import→reconcile→apply→(rata OPLACONA + deposit BANK + odsetki 152,05 zł)→unapply (pełne cofnięcie). Wszystko ✓.

## Otwarte kierunki

- **Subrachunki OMRP** — UI do wpisania `Contract.escrowSubaccount` na karcie umowy (`/sales/[id]`) — podniesie pewność dopasowań do 100% dla ING OMRP (bank nadaje każdemu nabywcy własny numer). Świadomie pominięte teraz, by nie ruszać współdzielonej strony sprzedaży.
- **Cron auto-importu** — jeśli ING udostępni API/webhook; obecnie import ręczny plikiem.
- **Wezwania do zapłaty** — generowanie PDF wezwania z naliczonymi odsetkami dla zaległych rat (jest już generator PDF w projekcie).
- **Uwolnienia (EscrowRelease)** — powiązanie zwolnień transz z milestone'ami budowy (moduł Budowa).
- **CP852** — dostroić dekodowanie MT940 na realnym pliku SIMP/MARS (obecnie 1250; polskie znaki w nazwach mogą wymagać korekty).
