# Rezerwacje — automatyczne powiadomienia przed wygaśnięciem (decyzje)

Stan: **wdrożone w kodzie 2026-07-10** (etap 1: e-mail + zadanie pulpitu; etap 2 SMS
gotowy w kodzie, czeka na konto SMSAPI). Deploy checklist na dole.

## Co robi

Na X godzin (Settings `reservationAlerts.hoursBefore`, default 48) przed wygaśnięciem
**rezerwacji miękkiej** system automatycznie:

1. wysyła **e-mail do klienta** (szablon z Settings, placeholdery `{imie} {nazwisko} {lokal} {data} {godzina}`),
2. wysyła **SMS do klienta** (bramka SMSAPI.pl, tylko w oknie `quietStart`–`quietEnd` czasu PL, default 8–20),
3. tworzy **zadanie „Zadzwoń do klienta"** na pulpicie (Task RULE, `ruleKey RES_CALL:<unitId>:<yyyy-mm-dd>`).

Wszystko w jednym przebiegu crona → „w tym samym momencie". Konfiguracja + wysyłka
testowa: `/settings` → sekcja „Powiadomienia o rezerwacjach" (admin-only).

## Architektura

- **`lib/reservation-alerts.ts`** — cała logika (`runReservationAlerts()`): selekcja
  przez `getExpiringSoftReservations(hoursBefore)`, grupowanie per klient (jeden
  mail/SMS z listą lokali zamiast N wiadomości), rendering szablonów, wysyłka,
  zadanie pulpitu.
- **`lib/sms.ts`** — klient SMSAPI.pl (czysty `fetch`, bez SDK; token w Settings
  `sms.apiToken`, nadawca `sms.from`) + `normalizePhonePl()` (Client.phone to wolny
  tekst → E.164 `+48…`; numer niepoprawny/stacjonarny = SMS pominięty).
- **`app/api/public/reservations/alerts/route.ts`** — endpoint crona, sekret
  `RESERVATIONS_CRON_SECRET` (współdzielony z digestem expiring-email).
- **Model `NotificationLog`** (schema) — rejestr wysyłek + idempotencja.
- **UI**: `components/settings/ReservationAlertsSection.tsx` + endpoint testowy
  `POST /api/settings/reservation-alerts-test` (`{channel, to}`).

## Kluczowe decyzje (dlaczego tak)

- **Idempotencja przez `NotificationLog.dedupeKey`** =
  `RES_ALERT:<unitId>:<EMAIL|SMS>:<expiresAt ISO>`, wpis **tylko po udanej wysyłce**
  (wzorzec `Case.reminderSentAt`). Błąd wysyłki → brak wpisu → automatyczny retry
  w kolejnym przebiegu. Klucz zawiera datę wygaśnięcia → **przedłużenie rezerwacji
  naturalnie odpala nowy cykl powiadomień**. Tabela zamiast pola na `Unit`, bo
  historia przeżywa zwolnienie lokalu (auto-expire zeruje pola rezerwacji) i
  rozdziela kanały. Skalary bez FK (wzorzec AuditLog).
- **Cron co 15 min, nie dzienny** — precyzja progu godzinowego; wysyłka wychodzi w
  pierwszym przebiegu po wejściu w okno `[now, now+X h]`, maks. ~15 min „po" idealnym
  momencie. Wzorzec Coolify Scheduled Task + sekret (świadomie NIE node-cron —
  patrz `docs/sprawy-decyzje.md`).
- **`RES_CALL` vs `RES_EXPIRE`**: istniejąca reguła RES_EXPIRE (3 dni, silnik zadań)
  zostaje jako wczesne przypomnienie. RES_CALL powstaje w cronie powiadomień i
  **anuluje otwarte RES_EXPIRE tego samego lokalu+terminu** (inaczej widget
  pokazywałby dwa wpisy o tej samej rezerwacji). Auto-domykanie RES_CALL: wspólna
  gałąź z RES_EXPIRE w `reconcileRuleTasks` (przedłużona → ZROBIONE, zwolniona →
  ANULOWANE) — bez tego byłyby zadania-zombie.
- **Grupowanie per klient** — rezerwacja z oferty blokuje kilka lokali z tą samą
  datą; klient dostaje JEDEN mail/SMS z listą (`{lokal}` = "B1.3.M45, B1.3.M46",
  `{data}/{godzina}` = najwcześniejszy termin). Log per lokal (dedup dalej działa).
- **SMS jako `Activity` typu `NOTATKA`** (tytuł „SMS: …"), e-mail jako `EMAIL` —
  nowy typ aktywności `SMS` wymagałby zmian w stats/ikonach w 6 plikach; nie warto.
- **Zadanie pulpitu tworzone też bez kontaktu/klienta** — handlowiec ma widzieć
  temat nawet gdy mail/SMS nie mógł wyjść.
- **RODO**: przypomnienie o własnej rezerwacji klienta = komunikacja obsługowa
  (nie marketing), bez osobnej zgody. Każda wysyłka w historii klienta (Activity)
  + audit log (`NOTIFY_EMAIL`/`NOTIFY_SMS`).
- **Defaulty**: e-mail ON, SMS OFF (do czasu konta SMSAPI), zadanie ON, 48 h.
  Bez skonfigurowanego crona w Coolify feature jest nieaktywny (to jest „włącznik"
  produkcyjny).

## Wyciszanie per rezerwacja (2026-07-11)

Przełącznik „Powiadomienia / Wyciszone" (dzwonek) przy każdej rezerwacji miękkiej
na `/rezerwacje` — pole `Unit.reservationAlertsMuted`, endpoint
`PATCH /api/reservations/[unitId]/alerts {muted}`. Wyciszona rezerwacja jest
pomijana przez cron we WSZYSTKICH kanałach (e-mail, SMS i zadanie „Zadzwoń");
licznik w wyniku przebiegu: `skipped.muted`. Powód: możliwość przetestowania
mechanizmu bez wysyłki do prawdziwych klientów + wyjątki ad-hoc.

Semantyka flagi: czyszczona przy zwolnieniu, auto-wygaśnięciu i zakładaniu nowej
rezerwacji (żaden lokal nie „dziedziczy" wyciszenia po poprzednim kliencie);
przenoszona przy zamianie lokalu (swap — to ta sama rezerwacja). Przedłużenie
NIE zmienia flagi — wyciszona rezerwacja po przedłużeniu pozostaje wyciszona.

## Pułapki

- `expireSoftReservations()` zwalnia rezerwację przy pierwszym odczycie po terminie
  i **zeruje dane klienta na Unit** — powiadomienie musi wyjść PRZED wygaśnięciem;
  selektor działa tylko na oknie przyszłym, więc nie ma wyścigu.
- Zamiana lokalu (swap) zachowuje termin, ale zmienia `unitId` → klient dostanie
  nowe powiadomienie z numerem nowego lokalu (celowe).
- Rezerwacja krótsza niż X h → powiadomienie przy pierwszym przebiegu po utworzeniu
  (treść podaje konkretną datę/godzinę, więc pozostaje prawdziwa).
- Polskie znaki w SMS = UCS-2 (segment 70 znaków zamiast 160) — domyślny szablon
  SMS bez ogonków; UI ostrzega.

## Deploy checklist

1. Push → auto-deploy. Po deployu **`prisma db push`** w Coolify Terminal
   (`node node_modules/prisma/build/index.js db push --skip-generate`) — nowa tabela
   `NotificationLog`.
2. Coolify → Scheduled Tasks → Add, Frequency `*/15 * * * *` (sekret już istnieje
   w env — ten sam co digest). **UWAGA: obraz produkcyjny NIE MA curla**
   (`sh: curl: not found` — potwierdzone 2026-07-11) — komenda przez node:
   ```
   node -e "fetch('https://crm.maraf.pl/api/public/reservations/alerts?secret='+process.env.RESERVATIONS_CRON_SECRET,{method:'POST'}).then(async r=>{const t=await r.text();console.log(t);if(!r.ok)process.exit(1)})"
   ```
3. `/settings` → „Powiadomienia o rezerwacjach": przejrzyj/dostosuj szablony,
   wyślij test e-mail.
4. **Etap 2 (SMS)**: konto firmowe na smsapi.pl → rejestracja nazwy nadawcy „MARAF"
   (1-3 dni robocze) → token API do `/settings` → test SMS → włącz kanał SMS.

## Otwarte kierunki

- Przypisanie opiekuna klienta/rezerwacji (`ownerId`) → zadanie i mail-alert do
  konkretnego handlowca zamiast wspólnej puli (temat wraca też w Statystykach).
- Drugi przypominacz (np. 6 h przed) — wymaga tylko drugiego klucza dedupe
  z sufiksem progu.
- Model `Notification` + dzwonek w topbarze (roadmapa Fazy 2 w
  `docs/zadania-decyzje.md`) — wtedy RES_CALL może dostać kanał in-app push.
