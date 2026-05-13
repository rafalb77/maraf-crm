/**
 * RSS news aggregator z fallback do lokalnej bazy "fun-facts".
 *
 * Strategia:
 *  - User ma listę zainteresowań: `interests` (predefined IDs) + `customInterests` (free-form, max 50 char).
 *  - Wybór tematu na dzień jest deterministyczny: hash(userId+YYYYMMDD) % count(zainteresowań).
 *  - Gdy user nie ma żadnych zainteresowań → fallback default: ['world', 'business', 'architecture', 'real-estate'].
 *  - Fetch RSS dla wybranego tematu:
 *      • predefined z FEEDS → dedykowane RSS-y
 *      • predefined z PREDEFINED_QUERY → Google News RSS search (gdy brak dedykowanych RSS-ów)
 *      • custom → Google News RSS search z user-input jako query
 *  - Jeśli nic nie zwróci → fallback do lokalnej bazy ciekawostek (FALLBACK).
 *  - Cache w pamięci (per proces) na 6h.
 */

// =====================================================================
// Tematy predefined — ID-y używane w User.interests
// =====================================================================

export type PredefinedTopic =
  | 'tech'
  | 'world'
  | 'business'
  | 'motivation'
  | 'biohacking'
  | 'architecture'
  | 'real-estate'

export const PREDEFINED_TOPIC_IDS = [
  'tech',
  'world',
  'business',
  'motivation',
  'biohacking',
  'architecture',
  'real-estate',
] as const

export const TOPIC_META: Record<PredefinedTopic, { label: string; emoji: string }> = {
  tech: { label: 'Nowe technologie', emoji: '🚀' },
  world: { label: 'Ze świata', emoji: '🌍' },
  business: { label: 'Biznes & finanse', emoji: '💼' },
  motivation: { label: 'Motywacja & samorozwój', emoji: '💪' },
  biohacking: { label: 'Biohacking', emoji: '🧬' },
  architecture: { label: 'Architektura', emoji: '🏛️' },
  'real-estate': { label: 'Rynek nieruchomości', emoji: '🏘️' },
}

// Domyślny zestaw tematów gdy user nie ma żadnych ustawionych (ani predefined, ani custom).
export const DEFAULT_INTERESTS: PredefinedTopic[] = ['world', 'business', 'architecture', 'real-estate']

// Limity custom tematów
export const MAX_CUSTOM_INTERESTS = 5
export const MAX_CUSTOM_INTEREST_LENGTH = 50

// =====================================================================
// Dyskryminowana union — wybrany temat (predefined lub custom)
// =====================================================================

type ResolvedTopic =
  | { kind: 'predefined'; id: PredefinedTopic }
  | { kind: 'custom'; query: string }

// =====================================================================
// Public types — to dostaje TopWidget
// =====================================================================

export type NewsItem = {
  topic: string // 'tech' | 'world' | ... lub custom query
  topicLabel: string
  topicEmoji: string
  title: string
  url: string | null
  source: string
  publishedAt: string | null
  isLive: boolean // true = z RSS / Google News; false = z lokalnej bazy fallback
}

// =====================================================================
// FEEDS — dedykowane RSS per temat (gdzie mam stabilne źródła)
// Tematy bez FEEDS używają Google News search z PREDEFINED_QUERY.
// =====================================================================

const FEEDS: Partial<Record<PredefinedTopic, { url: string; source: string }[]>> = {
  tech: [
    { url: 'https://www.spidersweb.pl/feed', source: "Spider's Web" },
    { url: 'https://antyweb.pl/feed', source: 'Antyweb' },
    { url: 'https://niebezpiecznik.pl/feed/', source: 'Niebezpiecznik' },
  ],
  world: [
    { url: 'https://tvn24.pl/najwazniejsze.xml', source: 'TVN24' },
    { url: 'https://wiadomosci.onet.pl/.feed', source: 'Onet Wiadomości' },
    { url: 'https://wiadomosci.wp.pl/wszystkie.feed', source: 'WP Wiadomości' },
  ],
}

// Google News fallback query dla tematów bez dedykowanych RSS-ów.
// motivation/biohacking pomijamy bo lepiej działają lokalne cytaty/ciekawostki.
const PREDEFINED_QUERY: Partial<Record<PredefinedTopic, string>> = {
  business: 'biznes Polska',
  architecture: 'architektura',
  'real-estate': 'rynek nieruchomości',
}

// =====================================================================
// FALLBACK — lokalne kuratorowane ciekawostki gdy RSS padnie
// =====================================================================

const FALLBACK: Record<PredefinedTopic, string[]> = {
  tech: [
    'Pierwszy komputer ENIAC ważył 30 ton i zajmował 167 m² — Twój smartfon jest milion razy szybszy.',
    'GPT-4 ma ~1,76 biliona parametrów — 10× więcej niż GPT-3 z 2020.',
    'Chip M-class Apple wykonuje 11 bilionów operacji na sekundę przy zużyciu 5 W.',
    'Każdej sekundy na YouTube ładowane jest 500 godzin nowego wideo.',
    'Pierwsze zdjęcie czarnej dziury M87 wymagało teleskopu wielkości Ziemi i 4 PB danych.',
    'Pierwsza wiadomość przez ARPANET (1969) miała brzmieć "LOGIN" — system padł po "LO".',
    'Linuks działa dziś na 96% top serwerów świata oraz na ~70% smartfonów (Android).',
    'JavaScript powstał w 10 dni. Brendan Eich napisał pierwszy prototyp w maju 1995.',
  ],
  world: [
    'Co minutę na świecie rodzi się 250 dzieci, a około 100 osób umiera.',
    'Oceany pochłaniają około 30% CO₂ wyemitowanego przez ludzkość.',
    'Według WHO 99% ludności świata oddycha powietrzem niezgodnym z normami czystości.',
    'Najbogatszy 1% ludności posiada więcej majątku niż reszta razem wzięta.',
    'Jeden lot transatlantycki to średnio 1 tona CO₂ na pasażera.',
    'Lasy Amazonii produkują 6% światowego tlenu — wycinka to 100 boisk piłkarskich/dzień.',
    'Antarktyda ma ~70% wody pitnej świata zamkniętej w lodzie.',
    'Norwegia ma >80% aut elektrycznych w nowej sprzedaży — Polska ~5%.',
  ],
  business: [
    'Warren Buffett: „Cena to coś, co płacisz. Wartość to coś, co dostajesz."',
    'Reguła 72: dzieląc 72 przez stopę zwrotu (%) dostajesz lata do podwojenia kapitału.',
    'S&P 500 zwracał średnio ~10%/rok przez ostatnie 100 lat — przy 4% inflacji to 6% realnie.',
    'Naval Ravikant: „Specyficzna wiedza nie da się skopiować — buduj coś, czego nikt inny nie umie."',
    'Ray Dalio: „Cykl długiego długu trwa 75-100 lat — żyjemy w jego końcówce."',
    'Charlie Munger: „Pokaż mi zachęty, a pokażę ci wynik."',
    'Peter Thiel: „Konkurencja jest dla przegranych — celuj w monopol w niszowym rynku."',
    'Indeksy passywne pokonują 90% aktywnych funduszy w okresach >10 lat (badania SPIVA).',
  ],
  motivation: [
    'James Clear: „Codziennie 1% lepszy = 37× lepszy w skali roku."',
    'Mark Manson: „Wartość Twojego życia mierzy się nie ilością problemów, lecz ich jakością."',
    'Naval Ravikant: „Czytaj to, co Cię ekscytuje — nie to, co modne."',
    'Cal Newport: „Deep work to umiejętność XXI wieku, której większość już nie posiada."',
    'David Goggins: „Najbardziej niedoceniana umiejętność: konsekwencja w nudzie."',
    'Steve Jobs: „Twój czas jest ograniczony, więc nie marnuj go żyjąc życiem kogoś innego."',
    'Marek Aureliusz: „Masz władzę nad swoim umysłem — nie nad światem zewnętrznym."',
    'Peter Drucker: „Najlepszym sposobem przewidzenia przyszłości jest jej stworzenie."',
    'Naval: „Zazdrość to najgorszy z grzechów — nikt nie wygrywa."',
    'Charlie Munger: „Dzień, w którym przestałeś się uczyć — zacząłeś przegrywać."',
  ],
  biohacking: [
    'Ekspozycja na zimno (10 min, 14°C) zwiększa norepinefrynę o 200–300%.',
    'Sen krótszy niż 6 h zwiększa ryzyko demencji o ~30% (badanie z 2021 r.).',
    'Krótka 20-minutowa drzemka po południu poprawia uczenie się o ~30%.',
    '200 mg L-teaniny + 100 mg kofeiny daje lepszą koncentrację niż sama kofeina.',
    'Zone 2 cardio 3×/tydzień po 45 min = +12% mitochondrii w 8 tygodni.',
    'Światło słoneczne w pierwszych 30 min po przebudzeniu reguluje rytm dobowy lepiej niż melatonina.',
    'Post 16/8 obniża insulinę i zwiększa autofagię (sprzątanie uszkodzonych komórek).',
    'Magnez chelatowy (glicynian) przed snem podnosi jakość snu REM o ~15%.',
    '10-min spacer po posiłku obniża szczyt glukozy o 12–22% (Glucose Goddess).',
    'HRV (zmienność rytmu serca) to najlepszy pojedynczy wskaźnik regeneracji organizmu.',
  ],
  architecture: [
    'Złoty podział (1:1,618) pojawia się w Partenonie, katedrze w Chartres i Villa Savoye Le Corbusiera.',
    'Burj Khalifa (828 m) odchyla się od pionu nawet o 1,5 m podczas wiatru — to celowy efekt.',
    'Empire State Building zbudowano w 410 dni (1930-31) — średnio 4,5 piętra/tydzień.',
    'Brutalizm bierze nazwę od „béton brut" (surowy beton) z 1953 r. — Le Corbusier.',
    'Sydney Opera House budowano 14 lat — pierwotny budżet 7 mln $ urósł do 102 mln $.',
    'Najwyższy drewniany budynek świata to Mjøstårnet (Norwegia, 85 m, 18 pięter, 2019).',
    'Antoni Gaudí pracował nad Sagrada Familia przez 43 lata — kościół ukończą w 2026.',
    'Frank Lloyd Wright zaprojektował ponad 1000 budynków — 532 zbudowano.',
  ],
  'real-estate': [
    'Cena 1m² mieszkania w Warszawie wzrosła z ~6000 zł w 2010 do ~17 000 zł w 2025 (rynek wtórny).',
    'Średni czas sprzedaży mieszkania w Polsce w 2024: 89 dni (2021: 38 dni).',
    'Deweloperzy w Polsce wybudowali w 2024 ~225 tys. mieszkań — najmniej od 2017.',
    'Wskaźnik dostępności mieszkań w Polsce: średnia pensja kupuje ~0,8 m² (Niemcy: 1,1 m²).',
    'REIT-y w USA zwracały średnio 11,3% rocznie przez 50 lat — pokonywały S&P 500.',
    'Najdroższe biuro świata: Mayfair w Londynie, ~£200/sqft/rok (~£2150/m²/rok).',
    'Tokio ma 14 mln mieszkańców i ujemny wzrost cen mieszkań — efekt liberalnego planowania.',
    'Czynsz w Warszawie pochłania średnio 60% pensji brutto singla (DataNurse 2024).',
  ],
}

// =====================================================================
// Cache w pamięci (per proces serwera)
//  - klucz dla predefined: 'pre:tech' itp.
//  - klucz dla custom/Google: 'gn:<query lowercased>'
// =====================================================================

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h
type FetchedItem = { title: string; url: string; source: string; pubDate: string | null }
const cache = new Map<string, { items: FetchedItem[]; ts: number }>()

// =====================================================================
// Parser RSS — prosty regex, działa dla RSS 2.0 i Atom
// =====================================================================

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
}

function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[(.*?)\]\]>$/s, '$1').trim()
}

function parseRssOrAtom(xml: string): { title: string; url: string; pubDate: string | null }[] {
  const items: { title: string; url: string; pubDate: string | null }[] = []

  const rssPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = rssPattern.exec(xml)) !== null) {
    const block = m[1]
    const title = extractTag(block, 'title')
    const link = extractTag(block, 'link')
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date')
    if (title && link) {
      items.push({ title, url: link, pubDate: pubDate || null })
    }
  }
  if (items.length > 0) return items

  const atomPattern = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi
  while ((m = atomPattern.exec(xml)) !== null) {
    const block = m[1]
    const title = extractTag(block, 'title')
    const linkMatch = block.match(/<link\b[^>]*href=["']([^"']+)["']/i)
    const link = linkMatch ? linkMatch[1] : ''
    const pubDate = extractTag(block, 'published') || extractTag(block, 'updated')
    if (title && link) {
      items.push({ title, url: link, pubDate: pubDate || null })
    }
  }
  return items
}

function extractTag(block: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)</${escaped}>`, 'i')
  const match = block.match(re)
  if (!match) return ''
  return decodeHtmlEntities(stripCdata(match[1])).trim()
}

// =====================================================================
// Fetcher
// =====================================================================

const USER_AGENT = 'Mozilla/5.0 (compatible; MarafCRM/1.0; +https://crm.maraf.pl)'

async function fetchOneFeed(url: string, source: string): Promise<FetchedItem[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const xml = await res.text()
  const items = parseRssOrAtom(xml)
  return items.slice(0, 10).map((it) => ({ ...it, source }))
}

// Google News RSS search — używane dla custom tematów i dla predefined bez dedykowanych RSS.
async function googleNewsSearch(query: string): Promise<FetchedItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pl&gl=PL&ceid=PL:pl`
  return fetchOneFeed(url, 'Google News')
}

// Predefined topic — kombo: dedykowane FEEDS + Google News (jeśli zdefiniowany query).
async function fetchPredefined(topic: PredefinedTopic): Promise<FetchedItem[]> {
  const cacheKey = `pre:${topic}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.items

  const feeds = FEEDS[topic] || []
  const all: FetchedItem[] = []

  const results = await Promise.allSettled(feeds.map((f) => fetchOneFeed(f.url, f.source)))
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value)
  }

  // Jeśli dedykowane RSS nic nie zwróciły, spróbuj Google News z predefined query.
  if (all.length === 0 && PREDEFINED_QUERY[topic]) {
    try {
      all.push(...(await googleNewsSearch(PREDEFINED_QUERY[topic]!)))
    } catch (e) {
      console.warn('[news] google news fallback failed for', topic, (e as Error).message)
    }
  }

  if (all.length === 0) return []

  all.sort((a, b) => {
    const ta = a.pubDate ? Date.parse(a.pubDate) : 0
    const tb = b.pubDate ? Date.parse(b.pubDate) : 0
    return tb - ta
  })

  cache.set(cacheKey, { items: all, ts: Date.now() })
  return all
}

async function fetchCustom(query: string): Promise<FetchedItem[]> {
  const cacheKey = `gn:${query.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.items

  try {
    const items = await googleNewsSearch(query)
    items.sort((a, b) => {
      const ta = a.pubDate ? Date.parse(a.pubDate) : 0
      const tb = b.pubDate ? Date.parse(b.pubDate) : 0
      return tb - ta
    })
    cache.set(cacheKey, { items, ts: Date.now() })
    return items
  } catch (e) {
    console.warn('[news] custom search failed for', query, (e as Error).message)
    return []
  }
}

// =====================================================================
// Resolver — userInterests + customInterests → lista ResolvedTopic
// =====================================================================

function isPredefined(id: string): id is PredefinedTopic {
  return (PREDEFINED_TOPIC_IDS as readonly string[]).includes(id)
}

function sanitizeCustom(s: string): string {
  // Strip kontrolne chars, trim, capowanie do MAX_CUSTOM_INTEREST_LENGTH.
  return s.replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, MAX_CUSTOM_INTEREST_LENGTH)
}

function resolveInterests(
  interests: readonly string[] | undefined,
  customInterests: readonly string[] | undefined,
): ResolvedTopic[] {
  const out: ResolvedTopic[] = []

  for (const id of interests || []) {
    if (isPredefined(id)) out.push({ kind: 'predefined', id })
  }
  for (const raw of (customInterests || []).slice(0, MAX_CUSTOM_INTERESTS)) {
    const q = sanitizeCustom(raw)
    if (q) out.push({ kind: 'custom', query: q })
  }

  if (out.length === 0) {
    return DEFAULT_INTERESTS.map((id) => ({ kind: 'predefined', id }))
  }
  return out
}

// =====================================================================
// Public API
// =====================================================================

export type GetNewsArgs = {
  userId?: string
  interests?: readonly string[]
  customInterests?: readonly string[]
  date?: Date
}

/**
 * Zwraca news dnia per user.
 *
 * Wybór tematu deterministyczny: hash(userId + YYYYMMDD) % count(interests).
 * Bez userId — używa "anon" jako seed (wszyscy anonimowi widzą to samo).
 */
export async function getNewsForToday(args: GetNewsArgs = {}): Promise<NewsItem> {
  const date = args.date || new Date()
  const dateKey = date.toISOString().slice(0, 10)
  const userKey = args.userId || 'anon'

  const resolved = resolveInterests(args.interests, args.customInterests)
  const topicSeed = simpleHash(`${userKey}|${dateKey}|topic`)
  const topic = resolved[topicSeed % resolved.length]

  const itemSeed = simpleHash(`${userKey}|${dateKey}|item`)

  if (topic.kind === 'predefined') {
    const meta = TOPIC_META[topic.id]
    const items = await fetchPredefined(topic.id)
    if (items.length > 0) {
      const item = items[itemSeed % items.length]
      return {
        topic: topic.id,
        topicLabel: meta.label,
        topicEmoji: meta.emoji,
        title: item.title,
        url: item.url,
        source: item.source,
        publishedAt: item.pubDate,
        isLive: true,
      }
    }
    // Fallback do lokalnej bazy
    const fbList = FALLBACK[topic.id]
    const text = fbList[itemSeed % fbList.length]
    return {
      topic: topic.id,
      topicLabel: meta.label,
      topicEmoji: meta.emoji,
      title: text,
      url: null,
      source: 'Maraf · ciekawostki',
      publishedAt: null,
      isLive: false,
    }
  }

  // custom
  const items = await fetchCustom(topic.query)
  if (items.length > 0) {
    const item = items[itemSeed % items.length]
    return {
      topic: `custom:${topic.query}`,
      topicLabel: topic.query,
      topicEmoji: '📰',
      title: item.title,
      url: item.url,
      source: item.source,
      publishedAt: item.pubDate,
      isLive: true,
    }
  }
  return {
    topic: `custom:${topic.query}`,
    topicLabel: topic.query,
    topicEmoji: '📰',
    title: `Brak świeżych newsów dla tematu "${topic.query}".`,
    url: null,
    source: 'Google News',
    publishedAt: null,
    isLive: false,
  }
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
