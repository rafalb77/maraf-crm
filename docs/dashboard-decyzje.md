# Dashboard — decyzje projektowe

Strona `/dashboard` — pierwszy widok po zalogowaniu. KPI cards + listy aktywności + **TopWidget** (powitanie + news dnia + pogoda) na samej górze.

## TopWidget — banner u góry

Zastępuje stary tytuł „Dashboard / Witaj X". 3 kolumny w jednym banner'ze:
**[Powitanie]  [News dnia]  [Pogoda]**

Gold-gradient tło z brand tokens (NAVY + GOLD), responsive (1 kolumna na mobile).

### 1. Powitanie po porze dnia + admin name override

`lib/greeting.ts` → funkcja `getGreeting({email, name})`:
- `hour 5-12` → poranek 🌅
- `hour 12-18` → popołudnie ☀️
- `hour 18-22` → wieczór 🌆
- `hour 22-5` → noc 🌙

**Imię**: dla admina (email = `NEXT_PUBLIC_ADMIN_EMAIL`) zawsze **„Rafał"** — hardcoded w `ADMIN_DISPLAY_NAME` w `greeting.ts`, bo w bazie `name = 'Administrator'`. Dla innych userów — pierwsze słowo z `User.name` lub email.

### 2. News dnia — polskie RSS + fallback

`lib/news-feed.ts` — agreguje RSS z polskich źródeł, deterministyczny wybór per data.

**Topic rotuje per dzień tygodnia** (deterministycznie):
- poniedziałek, czwartek → 🚀 tech (Spider's Web, Antyweb, Niebezpiecznik)
- wtorek, sobota → 🌍 świat (TVN24, Onet, WP)
- środa, niedziela → 🧬 biohacking (fallback)
- piątek → 💪 motywacja (fallback)

**Fallback do lokalnej bazy** — `motivation` i `biohacking` nie mają stabilnych polskich RSS, więc rotujemy 8-10 ciekawostek/cytatów per topic (Mark Manson, James Clear, Marek Aureliusz, fakty o śnie/zimnie/L-teaninie). Plus jak RSS się wykrzaczy → fallback.

**Cache 6h** w pamięci serwera (per-proces, nie persistent). Deterministyczny wybór po dacie (YYYY-MM-DD hash) — wszyscy zalogowani widzą ten sam news danego dnia.

Parsuje RSS regex'em (bez biblioteki) — obsługuje RSS 2.0 i Atom 1.0, dekoduje HTML entities, strip CDATA.

### 3. Pogoda — Open-Meteo (free, no API key)

`lib/weather.ts` — Open-Meteo dla **Zgierza** (51.86°N, 19.41°E) domyślnie. Konfigurowane przez env:
- `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_CITY` (Coolify env)

Zwraca: temperatura aktualna + min/max dnia + warunek (emoji + opis PL) + wiatr + kierunek (N/NE/.../NNW) + wschód/zachód słońca.

Cache 30 min. Fallback do ostatniego znanego stanu jeśli API padnie.

### 4. Ikona pogody — duża SVG z animacją

`components/dashboard/WeatherIcon.tsx` — 56px lucide-react icon zamiast emoji. Mapowanie WMO weather code → ikona:
- 0-1 (słonecznie) → `Sun` z animacją `weather-spin` (30s linear) + gold glow
- 2 (częściowe zachmurz.) → `CloudSun` z `weather-float` (±4px Y / 4s)
- 3 (pochmurno) → `Cloud` z `weather-float`
- 45, 48 (mgła) → `CloudFog` z `weather-pulse`
- 51-55 (mżawka), 61-65 (deszcz) → `CloudDrizzle` / `CloudRain` z `weather-pulse`
- 71-75 (śnieg) → `CloudSnow` z `weather-spin` (powolny obrót)
- 95-99 (burza/grad) → `CloudLightning` / `CloudHail` z `weather-flash` (migania)

Keyframes w `app/globals.css`. Plus `@media (prefers-reduced-motion: reduce)` wyłącza animacje (a11y).

### 5. Admin vs non-admin

**Tylko admin** widzi news + weather. Pozostali userzy → tylko prosty banner z powitaniem („SimpleGreeting" — biały kafelek, bez gold gradientu).

Endpoint `/api/dashboard/widget` zwraca `{ greeting, news, weather, isAdmin }`. `news` i `weather` są `null` dla non-admin.

**Long-term TODO** (osobny task, ustalone z userem):
- UI w `/settings` → „Moje zainteresowania" per user (zaznacz tematy)
- Per-user wybór tematów newsów → wszyscy zalogowani widzą personalizowany feed
- Zamiast hardcoded „Rafał" — User.preferredName w schema

### 6. Bez kropek w tle

W pierwszej iteracji TopWidget miał subtelny dot pattern (`radial-gradient` w tle). User nie polubił — usunięte. Zostaje sam gradient gold→navy.

## Pułapki

- **NEXT_PUBLIC_ADMIN_EMAIL** — używane przez Sidebar (client) i layouty (server). Po zmianie wymagany **rebuild** w Coolify (nie restart) bo `NEXT_PUBLIC_*` jest inline'owane w buildtime.
- **Cache RSS** jest per-proces — restart kontenera (deploy) reset'uje. Jeśli WP/TVN24 padnie i my fallback'ujemy do bazy lokalnej, następny restart spróbuje znowu live.
- **Topic rotuje per dzień, NIE per użytkownik** — wszyscy widzą ten sam tematycznie news danego dnia. Per-user wybór = TODO.

## Pliki kluczowe

- `app/(app)/dashboard/page.tsx` — strona dashboard (KPI cards + listy + `<TopWidget />` u góry)
- `components/dashboard/TopWidget.tsx` — klient component, fetchuje `/api/dashboard/widget`
- `components/dashboard/WeatherIcon.tsx` — animowana ikona pogody
- `app/api/dashboard/widget/route.ts` — endpoint zwracający dane
- `lib/greeting.ts` — powitanie + admin name
- `lib/news-feed.ts` — RSS aggregator + fallback
- `lib/weather.ts` — Open-Meteo
- `app/globals.css` — keyframes `weather-spin`, `weather-float`, `weather-pulse`, `weather-flash`
