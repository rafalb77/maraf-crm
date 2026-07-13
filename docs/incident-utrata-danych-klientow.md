# Incydent: utrata danych kontaktowych klientów (dedupe) — 2026-07-12

**Status**: 🔴 KOD NAPRAWIONY (nawrót zatrzymany), 🟡 DANE DO ODTWORZENIA z backupu.

Zgłoszenie (Rafał, 2026-07-12): „zginęły dane klientów, już raz to miało miejsce —
Katarzyna Kopacka nie ma nr telefonu, Monika Syguła też, Tomasz Soszyński nie ma
żadnych danych".

## Przyczyna źródłowa (potwierdzona lekturą kodu)

`scripts/dedupe-clients.js` (uruchamiany ręcznie w Coolify Terminal po importach
klientów, `--apply`). Skrypt grupuje duplikaty po `imię|nazwisko|email`, wybiera
„keepera" **po liczbie powiązań** (umowy/aktywności/lokale…), przepina powiązania
i **kasuje duplikaty** (`tx.client.delete`).

**BŁĄD #1 (utrata telefonu — Kopacka, Syguła)**: skrypt przenosił tylko
POWIĄZANIA, a NIE pola skalarne (phone, phone2, adres, pesel, nip, …). Jeśli keeper
(bogatszy w powiązania) miał pusty telefon, a kasowany duplikat go miał — **telefon
ginął bezpowrotnie** przy `delete`.

**BŁĄD #2 (cały rekord — Soszyński) — wykryty adwersaryjnie 2026-07-13**: klucz
grupy to `imię|nazwisko|email`. Gdy email jest PUSTY, redukuje się do
`imię|nazwisko` — a to za słaby identyfikator: **dwie RÓŻNE osoby o tym samym
nazwisku bez maila (homonimy) trafiały do jednej grupy i jedna była kasowana w
całości**. Stąd „Soszyński bez żadnych danych" — to nie był jego duplikat, tylko
inna osoba scalona z homonimem i skasowana. (Fix scalania pól z Błędu #1 tego NIE
naprawiał — keeper to inna osoba; przenoszenie jej telefonu na obcego byłoby wręcz
szkodliwe.)

Dlaczego pasuje do objawów:
- **konkretni klienci** — tylko ci, którzy mieli duplikaty scalane przez skrypt;
- **brak telefonu** (a nie PESEL) — telefon jest plaintext, ale ginął tak samo;
- **Soszyński bez wszystkiego** — jego keeper był rekordem ubogim w dane;
- **nawrotowość** — skrypt jest odpalany ręcznie po każdym imporcie tworzącym duplikaty.

## Co WYKLUCZONO (sprawdzone)

- **Import klientów** (`lib/clients-import.ts`) — add-only, pomija istniejących
  (dedup PESEL/tożsamość), nigdy nie nadpisuje. Nie mógł wyzerować telefonu.
- **Szyfrowanie** (`lib/crypto.ts`) — `phone` NIE jest szyfrowany
  (CLIENT_ENCRYPTED_FIELDS = pesel/nip/idNumber/fatherName/motherName/address).
  Brak/zmiana klucza nie tłumaczy braku telefonu.
- **Świeży deploy opiekuna klienta** (Client.ownerId, reservation-alerts) — żadna
  z tych ścieżek nie robi `client.update` na polach kontaktowych (tylko status w
  oferta/reserve, tylko ownerId w PUT). Timing zbieżny, ale to nie sprawca.
- **Umowy** (`contracts/[id]` updateMany) — ustawia tylko `status: UMOWA`.
- **Edycja klienta** (formularz + PUT) — MOŻE wyzerować telefon, ale tylko gdy
  użytkownik ręcznie wyczyści pole (świadome działanie); nie tłumaczy nawrotu.

## Naprawa kodu

`scripts/dedupe-clients.js` — trzy zabezpieczenia (zweryfikowane lokalnie):

1. **Scalanie pól (2026-07-12, na Błąd #1)**: przed `delete` każdego duplikatu
   **uzupełniamy PUSTE pola keepera** wartościami z duplikatu (`scalarFill`:
   email/phone/phone2/pesel/nip/idNumber/fatherName/motherName/address/city/
   zipCode/source/notes/ownerId). Nigdy nie nadpisujemy pola niepustego. Wartości
   kopiowane 1:1 (szyfrowane = ciphertext, ten sam klucz). `isEmpty` trimuje białe
   znaki (placeholder " " nie blokuje scalenia).
2. **Tylko rekordy z e-mailem (2026-07-13, na Błąd #2)**: rekordy z pustym mailem
   NIE są deduplikowane (skippedNoEmail w raporcie) — eliminuje kasowanie
   homonimów. Bez wspólnego silnego identyfikatora skrypt niczego nie usuwa.
3. **Snapshot do AuditLog przed delete**: pełny rekord kasowanego duplikatu ląduje
   w AuditLog (action=DELETE, userEmail='script:dedupe-clients') → każde przyszłe
   usunięcie jest ODWRACALNE i widoczne, kto/kiedy odpalił skrypt.

Test lokalny: (a) dwie różne osoby o tym samym nazwisku bez maila → obie
nietknięte; (b) prawdziwy duplikat po e-mailu, keeper bez telefonu + dup z
telefonem → keeper dostaje telefon, dup skasowany + snapshot w AuditLog.

## Zabezpieczenia systemowe (2026-07-13) — „żeby się nie powtórzyło"

Obrona wielowarstwowa, niezależna od konkretnego błędu w logice skryptu:

1. **Auto-backup przed każdą operacją masową** — `dedupe-clients.js --apply` zrzuca
   PEŁNĄ tabelę klientów do `scripts/backups/clients-before-dedupe-<ts>.json`
   ZANIM cokolwiek zmieni. Punkt przywracania niezależny od backupu OVH.
   (Katalog w `.gitignore` — zawiera PII, choć pola wrażliwe jako ciphertext.)
2. **Limit promienia rażenia** — jeśli operacja skasowałaby > `DEDUPE_MAX_DELETE`
   (domyślnie 25) rekordów → **ABORT** (chyba że świadome `--force`). Katastrofa
   (masowa kolizja kluczy) nie wykona się po cichu.
3. **Snapshot każdego usunięcia do AuditLog** — pełny rekord + kto/kiedy.
4. **Narzędzie odzysku** — `scripts/restore-clients-from-dump.js <plik> --apply`
   odtwarza WYŁĄCZNIE klientów o ID nieobecnym w bazie (twardo skasowanych),
   nigdy nie nadpisuje istniejących. Działa ze zrzutów z pkt 1.
5. **Usuwanie przez UI/API już bezpieczne** — `DELETE /api/clients/[id]` od dawna
   zapisuje pełny snapshot do AuditLog (odwracalne). Luka była tylko w skrypcie.

Zasada operacyjna: **skrypty uruchamiać z NAJNOWSZEGO deployu** (obraz z fixem),
zawsze najpierw RAPORT (bez `--apply`), i mieć backup. Zapisane w nagłówku skryptu.

## Odtworzenie UTRACONYCH danych (Rafał odzyskuje inaczej)

Skasowane rekordy to **hard delete** — danych nie ma już w żywej bazie. NIE da się
ich zgadnąć. Ścieżka odzysku:
1. Pobrać backup bazy z **OVH Object Storage** z daty PRZED ostatnim uruchomieniem
   `dedupe-clients.js --apply` (patrz `docs/system-core.md` → backup).
2. Odtworzyć snapshot do bazy tymczasowej (nie na produkcję!).
3. Wyciągnąć telefony/adresy dla dotkniętych klientów (Kopacka, Syguła, Soszyński
   i ewentualnie inni scaleni w tym przebiegu) po imieniu+nazwisku.
4. Uzupełnić na produkcji przez kartę klienta (edycja) lub skrypt jednorazowy
   wyłącznie na PUSTE pola.

Do ustalenia z Rafałem: kiedy ostatnio odpalał dedupe, czy jest backup z tej daty,
ilu klientów objął tamten przebieg (log skryptu, jeśli zachowany).
