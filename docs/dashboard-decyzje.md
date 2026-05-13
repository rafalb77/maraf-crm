# Dashboard — decyzje projektowe

Strona `/dashboard` — pierwszy widok po zalogowaniu. KPI cards + listy aktywności + **TopWidget** (powitanie + news dnia + pogoda) na samej górze.

## TopWidget — banner u góry

Zastępuje stary tytuł „Dashboard / Witaj X". 3 kolumny w jednym banner'ze:
**[Powitanie]  [News dnia]  [Pogoda]**

Gold-gradient tło z brand tokens (NAVY + GOLD), responsive (1 kolumna na mobile).

### 1. Powitanie po porze dnia + preferredName per-user

`lib/greeting.ts` → funkcja `getGreeting({email, name, preferredName})`:
- `hour 5-12` → poranek 🌅
- `hour 12-18` → popołudnie ☀️
- `hour 18-22` → wieczór 🌆
- `hour 22-5` → noc 🌙

**Imię** (priorytet od 2026-05-13):
1. `User.preferredName` (każdy user ustawia w `/profil`)
2. pierwsze słowo z `User.name`
3. lokalna część e-maila (przed `@`, z `._-` zamienionym na spację)
4. fallback „Cześć"

Hardcoded `ADMIN_DISPLAY_NAME = 'Rafał'` zostało usunięte — admin ustawia sobie preferredName tak jak każdy inny user.

### 2. News dnia — per user.interests (RSS + Google News + fallback)

`lib/news-feed.ts` — agreguje newsy per zainteresowania usera, deterministyczny wybór per user-dzień.

**Predefiniowane tematy** (`PREDEFINED_TOPIC_IDS`, 2026-05-13):
- 🚀 `tech` — Spider's Web, Antyweb, Niebezpiecznik (dedykowane RSS)
- 🌍 `world` — TVN24, Onet, WP (dedykowane RSS)
- 💼 `business` — Google News query "biznes Polska"
- 💪 `motivation` — brak RSS, lokalna baza cytatów (Manson, Clear, Aureliusz, Goggins, Munger...)
- 🧬 `biohacking` — brak RSS, lokalna baza ciekawostek (sen, L-teanina, post 16/8, HRV...)
- 🏛️ `architecture` — Google News query "architektura" + lokalna baza ciekawostek (Burj, ENIAC, Sagrada Familia...)
- 🏘️ `real-estate` — Google News query "rynek nieruchomości" + lokalna baza statystyk rynku PL

**Custom tematy** (max 5 per user, max 50 znaków, free-form) — fetchowane przez **Google News RSS search**: `news.google.com/rss/search?q=<query>&hl=pl&gl=PL&ceid=PL:pl`. Sanityzacja w `lib/news-feed.ts` (`sanitizeCustom`) + dedup case-insensitive w `PATCH /api/users/me`.

**Wybór per user-dzień**: `hash(userId + YYYYMMDD + 'topic')` % count(interests) → temat dnia; `hash(userId + YYYYMMDD + 'item')` % count(items) → konkretny news. Czyli każdy user widzi inny news, ale ten sam przez cały dzień.

**Default gdy user ma puste interests + customInterests**: `['world', 'business', 'architecture', 'real-estate']`.

**Cache 6h** w pamięci serwera (per-proces). Klucze cache: `pre:<topic>` dla predefined, `gn:<query lowercased>` dla custom/Google. RSS parser regex'em (RSS 2.0 + Atom 1.0).

**Endpoint `/api/dashboard/widget`** czyta `interests` i `customInterests` z **DB query po session.user.id** (nie z JWT) — zmiany w `/profil` działają natychmiast bez relogu. Stary hardcoded `isAdmin` gate został usunięty 2026-05-13; jedyny gate to permission `dashboard` (middleware). Konrad/inni non-admin muszą mieć w `/settings` zaznaczone `dashboard` żeby zobaczyli widget.

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
