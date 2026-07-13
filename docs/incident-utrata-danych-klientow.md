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

**BŁĄD**: skrypt przenosił tylko POWIĄZANIA, a NIE pola skalarne (phone, phone2,
adres, pesel, nip, …). Jeśli keeper (bogatszy w powiązania) miał pusty telefon, a
kasowany duplikat go miał — **telefon ginął bezpowrotnie** przy `delete`. Gdy
keeper był ubogi we wszystkie dane, klient zostawał „bez żadnych danych".

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

## Naprawa kodu (2026-07-12)

`scripts/dedupe-clients.js`: przed `delete` każdego duplikatu **uzupełniamy PUSTE
pola keepera** wartościami z duplikatu (`scalarFill`, pola: email/phone/phone2/
pesel/nip/idNumber/fatherName/motherName/address/city/zipCode/source/notes/ownerId).
Nigdy nie nadpisujemy pola niepustego. Wartości kopiowane 1:1 (pola szyfrowane =
ciphertext, ten sam klucz → dalej odczytywalne). Raport (dry-run) i `--apply`
pokazują `→ scali: <pola>` / `MERGE …`, żeby operator widział zachowywane dane.
Zweryfikowane lokalnie: keeper bez telefonu + duplikat z telefonem → po scaleniu
keeper ma telefon, duplikat skasowany, powiązania przepięte.

## Odtworzenie UTRACONYCH danych (do zrobienia — wymaga backupu)

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
