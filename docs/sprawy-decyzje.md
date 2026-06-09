# Moduł Sprawy — decyzje projektowe

**Cel modułu**: repozytorium spraw z historią korespondencji. Prowadzenie reklamacji (rękojmia), spraw urzędowych i innych — z osią pism wysłanych/odebranych (skany), pilnowaniem terminów ustawowych i **przeszukiwalnym** archiwum skanów (OCR). Coś jak „EZD-lite" dla dewelopera.

Wdrożony: 2026-06-09 (MVP, 3 fazy w jednym zrzucie). Powiązane: `docs/changelog.md` (2026-06-09), `docs/architektura.md` (przepis na moduł), `CLAUDE.md`.

URL: `/cases` · permission: `cases` (etykieta „Sprawy", workspace CRM) · API: `/api/cases/*` + publiczne crony `/api/public/cases/*`.

---

## 1. Model danych (3 tabele)

```
Case (sprawa)
 ├─ CaseEntry[]    (oś korespondencji — wpisy chronologiczne)
 │   └─ CaseDocument[]  (skany podpięte do wpisu)
 └─ CaseDocument[] (archiwum skanów sprawy — entryId może być null)
```

- **`Case`** — `number` (sygnatura `@unique`), `type` (REKLAMACJA | URZEDOWA | INNE), `status` (NOWA | W_TOKU | OCZEKUJE | ROZSTRZYGNIETA | ZAMKNIETA), `priority`, `clientId?` / `unitId?` / `ownerId?` (relacje, onDelete SetNull), `counterparty?` (strona zewnętrzna — urząd/instytucja gdy brak klienta), `receivedAt?` (data wpływu = start terminu), `deadline?`, `reminderSentAt?` (idempotencja crona), `closedAt?`.
- **`CaseEntry`** — `direction` (PRZYCHODZACA | WYCHODZACA | WEWNETRZNA), `channel` (LIST | EMAIL | TELEFON | OSOBISCIE | EPUAP | INNE), `occurredAt` (data zdarzenia, ≠ createdAt), `subject?`, `body?`, `createdById?` (skalar bez FK).
- **`CaseDocument`** — `filename`/`url`/`mimeType`/`size`, `entryId?` (podpięcie do wpisu; onDelete SetNull → usunięcie wpisu NIE kasuje skanu), `ocrText?`, `ocrStatus` (PENDING | DONE | FAILED | SKIPPED), `uploadedById?` (skalar bez FK).

**Etykiety/kolory**: `lib/types.ts` (`CASE_*_LABELS/COLORS`, `CASE_DIRECTION_*`, `CASE_CHANNEL_*`, `CASE_CLOSED_STATUSES`).

### Decyzje
- **Osobny moduł obok Serwisu** (nie wchłania `ServiceRequest`/usterek) — decyzja Rafała 2026-06-09. Brak migracji, mniejsze ryzyko. Usterki można włączyć później jako kolejny `type` (wymaga migracji ServiceRequest→Case).
- **`createdById`/`uploadedById` jako zwykłe skalary** (bez relacji FK) — wzorzec `AuditLog`: log „kto" przeżywa usunięcie usera i nie zaśmieca modelu `User` back-relacjami. `ownerId` MA relację (`CaseOwner`) bo potrzebne do „moje sprawy" / grupowania przypomnień / przyszłych statystyk per prowadzący.
- **Skany dołączone do wpisu widoczne 2x** — na osi czasu (przy wpisie) i w „Archiwum skanów" (pełna lista). Świadome: oś = kontekst „co przyszło z którym pismem", archiwum = całość do przeszukania.

---

## 2. Sygnatura sprawy (`lib/case-number.ts`)

Format `<PREFIKS>/<ROK>/<NNNN>`, np. `REK/2026/0042`, `URZ/2026/0007`. Prefiks per typ (`CASE_TYPE_PREFIX`: REK / URZ / SPR). Numer kolejny liczony z **najwyższego istniejącego numeru** dla (prefiks, rok) — NIE z `count()` (count psuje się po usunięciu sprawy → kolizje). Zero-padding do 4 cyfr → porządek leksykalny = numeryczny (do 9999/rok). `number @unique` + **retry na P2002** w POST `/api/cases` (rzadki wyścig równoległego tworzenia).

---

## 3. Terminy ustawowe (`lib/case-deadlines.ts`)

- **Reklamacja (rękojmia)**: sprzedawca ma **14 dni** na ustosunkowanie się do żądania kupującego — brak odpowiedzi = **domniemanie uznania reklamacji** (KC). Przy tworzeniu sprawy typu REKLAMACJA z datą wpływu `deadline` ustawia się auto na `receivedAt + 14 dni` (edytowalne; w `CaseForm` jest podpowiedź na żywo). Stała `REKLAMACJA_RESPONSE_DAYS`.
- **Sprawy urzędowe / inne**: termin **ręczny** (różne podstawy prawne — nie zgadujemy).
- `deadlineState(deadline, status, soonDays=3)` → `NONE | OK | SOON | TODAY | OVERDUE`. Sprawy zamknięte → `NONE` (nie straszymy czerwienią). Kolory w `DEADLINE_STATE_COLORS`. Używane na liście i w szczegółach.

---

## 4. Przypomnienia (cron) — `/api/public/cases/reminders`

Wzorzec **dane-gov** (Coolify scheduled task + sekret, nie node-cron). Chroniony `CASES_CRON_SECRET` (query `?secret=` lub `Authorization: Bearer`). Obsługuje GET i POST (GET dla wygody testów).

Logika: bierze sprawy **otwarte** z `deadline ≤ dziś+N` (domyślnie N=3, też przeterminowane), którym dziś nie wysłano jeszcze przypomnienia (`reminderSentAt` null lub < początek dnia). Grupuje **per prowadzący** (`owner.email`; fallback `CASES_REMINDER_TO` → `ADMIN_EMAIL`), wysyła **jeden zbiorczy mail** przez `sendEmail()`, ustawia `reminderSentAt = teraz` → co najwyżej **1 przypomnienie/dzień/sprawę** (codzienny nudge dla terminów w oknie/po terminie). Sprawy bez odbiorcy → pominięte (spróbuje następnym razem, `reminderSentAt` nie ruszane).

**Kalendarz świadomie pominięty** w MVP — `createEvent()` istnieje, ale codzienny cron tworzyłby duplikaty eventów; czystsze byłoby tworzenie eventu raz przy ustawieniu terminu (kierunek na później).

Coolify scheduled task (przykład, codziennie 08:00):
```
curl -fsS -X POST "https://<host>/api/public/cases/reminders?secret=$CASES_CRON_SECRET"
```

---

## 5. OCR skanów — `lib/ocr.ts` (natywny Tesseract)

Decyzja Rafała: **Tesseract natywny w Dockerze** (nie tesseract.js). Dockerfile runner: `tesseract-ocr tesseract-ocr-pol poppler-utils`. `pdf-parse` był już kopiowany do obrazu (linia ~96).

Pipeline `runOcr(docId)`:
1. **obraz** (JPG/PNG/WEBP) → `tesseract <plik> stdout -l pol`.
2. **PDF cyfrowy** (z warstwą tekstu) → `pdf-parse` (import subpath `pdf-parse/lib/pdf-parse.js` — omija debug-mode `index.js`). Jeśli tekst ≥ 40 znaków → bierzemy go (szybkie).
3. **PDF skanowany** (bez warstwy) → `pdftoppm -png -r 200` → OCR per strona (limit `MAX_PAGES=15`).

Wynik → `CaseDocument.ocrText` (limit 100k znaków) + `ocrStatus`. Triggery:
- **fire-and-forget przy uploadzie** (`saveCaseDocument` → `void runOcr`) — działa bo serwer to długo żyjący proces Node (Coolify, nie serverless).
- **`/api/public/cases/ocr-sweep`** (sekret `CASES_CRON_SECRET`, `?limit=`) — dobiera zaległe `PENDING`/`FAILED` (catch-up po restarcie kontenera).
- **ręczny re-OCR** dla `FAILED` — przycisk „↻ OCR" w `CaseDocuments` → `POST /api/cases/[id]/documents/[docId]/ocr`.

### ⚠ Pułapki OCR
- **Lokalnie (Windows) OCR nie działa** — brak binariów `tesseract`/`pdftoppm` → `runOcr` łapie błąd i ustawia `FAILED`. OCR testujemy **na produkcji po rebuildzie**.
- **Zmiana Dockerfile wymaga REBUILD** (nie restart) — apt-packages są w obrazie.
- Skanowane PDF wielostronicowe są wolne (OCR per strona) — limit 15 stron + timeout 2 min/proces.

---

## 6. Uploady skanów

Wzorzec `ContractAttachment`. Pliki → `public/uploads/cases/<caseId>/<timestamp>-<safeName>`, serwowane przez istniejący catch-all `app/uploads/[...path]/route.ts` (MIME ma PDF/JPG/PNG). Limit **25 MB/plik**, dozwolone PDF/JPG/PNG/WEBP/HEIC. Zdjęcia kompresowane client-side (`compressImage`) przed wysłaniem. Logika zapisu wspólna w `lib/case-uploads.ts` (`saveCaseDocument`, `validateCaseFile`, `deleteCaseFile`). Usunięcie sprawy → cascade rekordów + best-effort `fs.rm` katalogu.

---

## 7. Wyszukiwanie

`GET /api/cases?q=` oraz pole na `/cases` (GET form — działa bez JS). ILIKE (`contains`, `mode: 'insensitive'`) po: `number`, `title`, `description`, `counterparty`, treści wpisów (`entries.subject/body`) i **`documents.ocrText`** (treść skanów). MVP. **Upgrade poza MVP**: Postgres `tsvector` z konfiguracją słownikową PL (lepsze rankowanie, odmiana) — wymaga rozszerzenia/słownika w bazie.

---

## 8. Deploy (checklist)

1. `git push` → Coolify auto-deploy.
2. **`prisma db push`** w Coolify Terminal: `node node_modules/prisma/build/index.js db push --skip-generate` (3 tabele: Case/CaseEntry/CaseDocument).
3. **Rebuild** obrazu (Dockerfile zmieniony — tesseract). Coolify: redeploy z rebuild, nie restart.
4. Env (restart wystarczy): **`CASES_CRON_SECRET`** (wygeneruj losowy), opcjonalnie `CASES_REMINDER_TO` (adres zbiorczy gdy sprawa bez prowadzącego; fallback `ADMIN_EMAIL`), opcjonalnie `OCR_LANG` (domyślnie `pol`).
5. **Coolify scheduled tasks** (2 szt.): codziennie 08:00 → `POST /api/public/cases/reminders?secret=…`; opcjonalnie co godzinę → `POST /api/public/cases/ocr-sweep?secret=…` (catch-up OCR).
6. Nadaj userom permission **`cases`** w `/settings` (po zmianie user musi się przelogować — permissions snapshot w JWT).

---

## 9. Otwarte kierunki (poza MVP)

- **Generowanie pism wychodzących z szablonów** (reuse `docxtemplater` + `templates/`) → auto-wpis WYCHODZACA.
- **Eksport „teczki sprawy" do jednego PDF** (merge skanów + osi czasu) — dla prawnika/sądu.
- **AI-streszczenie korespondencji** + klasyfikacja przychodzącego pisma + sugerowana odpowiedź (Claude API).
- **Inbox z maila** — forward na dedykowany adres → auto-wpis przychodzący.
- **e-Doręczenia / ePUAP** dla spraw urzędowych (od 2025 obowiązkowe dla firm).
- **Dashboard SLA** w `/statystyki` (otwarte, po terminie, średni czas zamknięcia).
- **Usterka → podwykonawca → kaucja gwarancyjna** (`Subcontractor` + `EscrowDeposit`) — domknięcie pętli finansowej, gdy włączymy usterki do modułu.
- **Event w kalendarzu** przy ustawieniu terminu (raz, nie z crona) — `createEvent()` gotowe.
- **Pełnotekst `tsvector` PL** zamiast ILIKE.
- **Wchłonięcie Serwisu** (`ServiceRequest` → `Case` type USTERKA) jeśli okaże się sensowne.
