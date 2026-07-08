# Moduł Zadania — decyzje projektowe

Centrum zadań „Do zrobienia" na pulpicie: przypomnienia generowane automatycznie
z danych systemu (wygasające rezerwacje, raty harmonogramu) + zadania ręczne.
Faza 1 wdrożona 2026-07-08. Koncepcja całości (fazy 1–4) niżej.

## Architektura (faza 1)

- **Model `Task`** (prisma/schema.prisma): typ, status (`OTWARTE | ZROBIONE | ANULOWANE`),
  `dueAt`, drzemka (`snoozedUntil`), przypięcie, relacje do Client/Unit/Contract/ContractPayment/Case.
- **Silnik reguł** `lib/tasks.ts` — serce modułu:
  - Reguły idempotentne przez unikalny `ruleKey` z datą źródła
    (`RES_EXPIRE:<unitId>:<yyyy-mm-dd>`, `PAYMENT_DUE:<paymentId>:<yyyy-mm-dd>`).
    Ręcznie odhaczone zadanie NIE odradza się (wiersz z ruleKey zostaje w bazie).
  - **Auto-domykanie (reconcile)** — otwarte zadania RULE zamykają się same:
    rata opłacona / rezerwacja przedłużona / lokal sprzedany → `ZROBIONE` (autoCompleted);
    rata przełożona / umowa nieaktywna / rezerwacja zwolniona → `ANULOWANE`.
    Stan liczony z bazy przy każdym przebiegu — zero hooków w endpointach mutacji.
  - Scoring priorytetu liczony przy odczycie (pilność + waga typu + wartość
    transakcji + przypięcie), koszyki: Przeterminowane / Dziś / Nadchodzące / Później.
- **Uruchamianie silnika** (dwutorowe):
  1. Oportunistycznie przy `GET /api/tasks` (throttling 10 min przez
     `Settings.tasks.lastGeneratedAt`) — działa bez żadnej konfiguracji.
  2. Opcjonalny cron Coolify → `POST /api/public/tasks/generate?secret=...`
     (env `TASKS_CRON_SECRET`, wzorzec jak CASES_CRON_SECRET). Przydatny, gdy
     nikt nie otwiera pulpitu + pod digest mailowy w fazie 2.
- **API**: `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/[id]`
  (akcje: complete / reopen / snooze / pin / unpin; DELETE dla RULE = ANULOWANE,
  żeby ruleKey blokował regenerację).
- **Widget** `components/dashboard/TaskWidget.tsx` — na pulpicie pod TopWidget.
  Odhaczanie, drzemka (2h / jutro / 3 dni), przypięcie, szybkie dodawanie,
  linki kontekstowe (klient / umowa / sprawa / `tel:`), chip „auto" dla zadań z reguł.

## Ustawienia (Settings, klucz-wartość)

- `tasks.reservationWarnDays` — ile dni przed wygaśnięciem rezerwacji (default 3)
- `tasks.paymentWarnDays` — ile dni przed terminem raty (default 7)
- Raty zaległe dawniej niż 90 dni są pomijane (stare importy = szum).

## Deploy

Schema przez `prisma db push` (konwencja projektu — patrz infrastruktura.md).
Po deployu kodu z nową tabelą: Coolify → Terminal kontenera aplikacji →
`node node_modules/prisma/build/index.js db push`. Do tego czasu widget
grzecznie się chowa (dashboard działa normalnie).

## Roadmapa (koncepcja 2026-07-08)

- **Faza 2 — pełny silnik**: reguły dla spraw (`Case.deadline` — uogólnienie
  crona przypomnień), stygnących leadów (ZAPYTANIE/OFERTA bez Activity od X dni),
  ofert bez odpowiedzi, usterek WYSOKA; dzwonek powiadomień w top-barze
  (model Notification); poranny digest mailowy przez istniejący mailer;
  domykanie zadania TELEFON po dodaniu Activity typu TELEFON dla klienta.
- **Faza 3 — Google Calendar**: `CalendarToken.userId` (dziś token globalny!),
  sync zadań z godziną do dedykowanego kalendarza „MARAF CRM" (`Task.googleEventId`
  już w schemie), odczyt wydarzeń dnia do widgetu, prywatny feed ICS per user.
- **Faza 4 — AI** (SDK `@anthropic-ai/sdk` już w projekcie): poranny briefing
  z uzasadnieniem kolejności („najpierw Kowalscy, bo..."), dodawanie zadań
  naturalnym językiem („zadzwoń do Nowaka jutro o 10"), szkice maili do zadań
  EMAIL, eskalacje przeterminowanych do admina.
