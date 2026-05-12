# PDF generator — status pracy (niedokończone)

**Ostatnia aktualizacja**: 2026-05-09  
**Status**: 🔴 nie działa na produkcji — Chrome pada przy launch

## Cel

Wysyłka oferty mailem (`/api/oferty/[id]/email`) dołącza PDF jako załącznik. PDF generowany przez Puppeteer + headless Chrome z HTML string (`lib/offer-pdf-html.ts`). Wszystko ma być automatyczne — user klika „Wyślij mailem", klient dostaje mail z PDF.

## Bieżący błąd (po wszystkich próbach naprawy)

Endpoint `/api/oferty/[id]/pdf` zwraca:

```
"Failed to launch the browser process!
mkdir: cannot create directory '/home/nextjs': Permission denied
touch: cannot touch '/home/nextjs/.local/share/applications/mimeapps.list': No such file or directory
chrome_crashpad_handler: --database is required"
```

Plus błąd w socket IPC crashpad:
```
ERROR:third_party/crashpad/crashpad/util/linux/socket.cc:120
recvmsg: Connection reset by peer (104)
```

## Co już sprawdzone — NIE powtarzaj

### Próby naprawy crashpad (wszystkie nie pomogły)

1. **Dodanie flag** do puppeteer.launch:
   - `--disable-crash-reporter`, `--disable-breakpad`, `--disable-features=Crashpad`
   - `--crash-dumps-dir=/tmp/chrome-crashes`, `--user-data-dir=/tmp/chrome-user-data`
   - `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`
   - Usunięcie `--single-process` i `--no-zygote`
2. **Zmiana headless mode**: `'new'` → `true` (legacy single-process)
3. **Zamiana Debian chromium → Google Chrome stable**: instalacja przez oficjalne repo Google, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable`
4. **Stworzenie HOME directory** dla user nextjs: `useradd -m -d /home/nextjs` + pre-create `~/.config`, `~/.local/share/applications` + chown

**Każda próba**: deploy → otwórz `/api/oferty/[id]/pdf` → identyczny błąd. Coolify deploy `b00ed31` (HOME fix) **też** padł z tym samym błędem mimo zmiany w Dockerfile.

### Niewiadome (do zbadania w nowej sesji)

❓ **Czy mój fix HOME directory w ogóle się zdeployował?** Możliwe że:
- Coolify cache layer dla `RUN groupadd && useradd` nadal serwuje stary (mało prawdopodobne — git diff wyraźny, layer hash powinien być inny)
- Coolify build padł cicho i serwuje stary obraz
- Coolify wziął inny commit

❓ **Czy `/home/nextjs` istnieje w aktualnym kontenerze?**
- Diagnostyka w `app/api/oferty/[id]/pdf/route.ts` (ostatnio dodana, commit `5fb4a73`) zwraca obiekt `diag` z `homeExists`, `homeContents`, `chromeBinExists` przy błędzie
- **Następny krok**: Po deployu `c27984a` (lub aktualnym) — sprawdzić ten diag w odpowiedzi `/api/oferty/[id]/pdf`

## Co zrobić w nowej sesji — checklist

### Krok 1: diagnostyka stanu produkcji

1. **Coolify → Deployments**: czy najnowszy commit ma status **Success**? Jeśli Failed → wklej logi build, naprawiam.
2. **Coolify → Terminal** (gdy deploy Success):
   ```bash
   whoami
   echo "HOME=$HOME"
   ls -la /home/ 2>&1
   cat /etc/passwd | grep nextjs
   ls -la /usr/bin/google-chrome-stable /usr/bin/chromium 2>&1
   ```
   Wklej output — pokaże czy fix HOME wszedł.
3. Otwórz w przeglądarce: `https://crm.maraf.pl/api/oferty/{id}/pdf` (ID realnej oferty). Odpowiedź to JSON ze ścieżką `diag` przy błędzie:
   ```json
   {
     "error": "...",
     "diag": {
       "user": "nextjs",
       "uid": 1001,
       "home": "/home/nextjs",
       "homeExists": true/false,  ← KLUCZOWE
       "homeContents": [...],
       "chromeBinExists": true/false  ← KLUCZOWE
     }
   }
   ```

### Krok 2: scenariusze (zależnie od diag)

**Scenariusz A — `homeExists: false`**:
- Mój Dockerfile fix się nie zaaplikował. Sprawdź `git log Dockerfile` — czy commit `b00ed31` jest na origin/main. Wymuś **rebuild bez cache** w Coolify.

**Scenariusz B — `homeExists: true`, ale błąd ten sam**:
- HOME jest, ale Chrome nadal pada. Wtedy:
  - Sprawdź czy `chromeBinExists: true` — czy Chrome zainstalowany
  - Plus `ls -la /home/nextjs/.config` w Coolify Terminal — może permissions
  - Alternatywa: **przerzucenie na pełen `puppeteer`** (bundled Chromium 119, znany jako działający w Docker). Plan poniżej.

**Scenariusz C — `chromeBinExists: false`**:
- Apt install Google Chrome padł cicho. Sprawdź build log — error w `apt-get install google-chrome-stable`. Fallback: zostać przy chromium ALE jednoczesnie rozwiązać HOME (powinno wystarczyć).

### Krok 3 (jeśli A-C nie pomogą): przerzucić się na pełen `puppeteer`

Plan:
1. `npm uninstall puppeteer-core && npm install puppeteer@^21`
2. Dockerfile (builder stage):
   - Usunąć `--ignore-scripts` z `npm ci` LUB dodać osobny `RUN npx puppeteer browsers install chrome`
   - Ustawić `ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer`
3. Dockerfile (runner stage):
   - Usunąć `apt-get install google-chrome-stable` + Google repo setup
   - Zachować libsy (libnss3, libdrm2, fonts, …)
   - Skopiować `--from=builder /app/.cache/puppeteer` do runner
   - Usunąć `ENV PUPPETEER_EXECUTABLE_PATH` (puppeteer wybiera bundled sam)
4. `lib/pdf-generator.ts`:
   - `import puppeteer from 'puppeteer'` (bez `-core`)
   - Usunąć `executablePath`, `findExecutablePath`
5. Image urośnie o ~150 MB, build dłuższy o 1-2 min

To **prawie pewnie zadziała** — puppeteer 21.x bundle'uje Chromium 119 który nie ma buga crashpad w Debianie.

### Krok 4: po naprawie

- Otwórz `/api/oferty/{id}/pdf` → PDF się pobiera ✅
- Wyślij ofertę mailem → mail z PDF attachment ✅
- Zaktualizuj `docs/oferty-decyzje.md` (sekcja „Otwarte sprawy" → usuń wpis o PDF)
- Dodaj wpis do `docs/changelog.md` (data + co finalnie zadziałało)
- Usuń ten plik (`docs/pdf-generator-status.md`) lub przemianuj na `pdf-generator-rozwiazanie.md` z opisem co finalnie zadziałało

## Pliki kluczowe

- `lib/pdf-generator.ts` — Puppeteer launch + setContent + page.pdf()
- `lib/offer-pdf-html.ts` — server-side HTML string z embedded obrazkami (base64)
- `app/api/oferty/[id]/pdf/route.ts` — endpoint diagnostyczny z `diag` w error response
- `app/api/oferty/[id]/email/route.ts` — wysyłka maila z PDF attachment (non-blocking)
- `Dockerfile` — runner stage z Google Chrome + libsy + user nextjs z HOME
- `components/oferty/OfferActions.tsx` — EmailDialog (subject + message default)

## Historia prób (z commitów)

| Commit | Co zmieniał | Wynik |
|---|---|---|
| `56c3f7e` | Initial: puppeteer-core + Debian chromium | crashpad fail |
| `2315e2a` | Usunął `--single-process`, dodał `--disable-crash-reporter` | crashpad fail |
| `843f4c2` | `headless: 'new'` → `true` (legacy) | crashpad fail |
| `d0ed015` | Zamiana chromium → Google Chrome stable | crashpad fail |
| `b00ed31` | Naprawa root cause: HOME dir dla user nextjs | crashpad fail (?? — może deploy nie wszedł) |
| `5fb4a73` | Diagnostyka `diag` w endpoincie /pdf | (czeka na deploy) |

## Workaround tymczasowy (jeśli PDF nie zadziała szybko)

Można wysłać mail **bez PDF**, dołączając w treści linki:
- **publiczny link do podglądu PDF** (osobny endpoint `/oferta-public/{token}` bez auth, signed URL z bazy)
- albo zachęcić klienta do otwarcia linku w przeglądarce (zalogowany handlowiec — print/PDF samodzielnie)

Endpoint `app/api/oferty/[id]/email/route.ts` już ma fallback: jeśli `generateOfferPdf()` throw, leci bez attachmentu — message templates trzeba by wtedy zmienić ale infrastruktura już to robi.
