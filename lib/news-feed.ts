/**
 * RSS news aggregator z fallback do lokalnej bazy "fun-facts".
 *
 * Strategia:
 *  - Topic dnia jest deterministyczny po dacie (jak data dnia → topic).
 *  - Fetch RSS dla wybranego topica, parsuj XML regexem (proste).
 *  - Jesli RSS padnie / nic nie zwroci → fallback do lokalnej bazy.
 *  - Cache w pamieci (per proces) na 6h — RSS nie zmienia sie czesciej.
 */

export type Topic = 'tech' | 'world' | 'motivation' | 'biohacking'

export type NewsItem = {
  topic: Topic
  topicLabel: string
  topicEmoji: string
  title: string
  url: string | null
  source: string
  publishedAt: string | null
  isLive: boolean // true = z RSS; false = z lokalnej bazy
}

const TOPIC_META: Record<Topic, { label: string; emoji: string }> = {
  tech: { label: 'Nowe technologie', emoji: '🚀' },
  world: { label: 'Ze świata', emoji: '🌍' },
  motivation: { label: 'Motywacja & samorozwój', emoji: '💪' },
  biohacking: { label: 'Biohacking', emoji: '🧬' },
}

// Rotacja: poniedzialek = tech, wtorek = world, sroda = biohacking,
// czwartek = tech, piatek = motivation, sobota = world, niedziela = biohacking
const WEEKDAY_TOPIC: Topic[] = [
  'biohacking',  // 0 = niedziela (JS getDay)
  'tech',        // 1 = poniedzialek
  'world',       // 2 = wtorek
  'biohacking',  // 3 = sroda
  'tech',        // 4 = czwartek
  'motivation',  // 5 = piatek
  'world',       // 6 = sobota
]

export function getTopicForToday(date = new Date()): Topic {
  return WEEKDAY_TOPIC[date.getDay()]
}

// ===================================================================
// Feedy RSS per topic. Wszystkie publiczne, bez API key.
// Zaprojektowane jako lista — losujemy/wybieramy 1 zgodnie z dniem.
// ===================================================================

// Polskie RSS — preferowane.
// Dla motivation/biohacking PL feedy sa rzadkie wiec mamy mocniejszy fallback.
const FEEDS: Record<Topic, { url: string; source: string }[]> = {
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
  // Dla motivation i biohacking polskich RSS jest niewiele. Pozostaje
  // pusta lista → automatyczny fallback do lokalnej bazy cytatów (po PL).
  motivation: [],
  biohacking: [],
}

// ===================================================================
// Fallback — kuratorowane "ciekawostki" / cytaty per topic.
// Działa offline, używane gdy RSS padnie.
// ===================================================================

const FALLBACK: Record<Topic, string[]> = {
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
}

// ===================================================================
// Cache w pamieci (per proces serwera)
// ===================================================================

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h
const cache = new Map<Topic, { items: { title: string; url: string; source: string; pubDate: string | null }[]; ts: number }>()

// ===================================================================
// Parser RSS — prosty regex, działa dla większości RSS 2.0 i Atom
// ===================================================================

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

  // RSS 2.0: <item><title>...</title><link>...</link><pubDate>...</pubDate>
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

  // Atom 1.0: <entry><title>...</title><link href="..."/><published>...</published>
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

// ===================================================================
// Fetch RSS dla topica
// ===================================================================

async function fetchTopic(topic: Topic): Promise<{ title: string; url: string; source: string; pubDate: string | null }[]> {
  const cached = cache.get(topic)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.items

  const feeds = FEEDS[topic]
  const all: { title: string; url: string; source: string; pubDate: string | null }[] = []

  // Fetch wszystkie feeds równolegle, ale obsługa błędów per feed
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const res = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MarafCRM/1.0; +https://crm.maraf.pl)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
        },
        signal: AbortSignal.timeout(8000), // 8s timeout
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      const items = parseRssOrAtom(xml)
      return items.slice(0, 10).map((it) => ({ ...it, source: feed.source }))
    }),
  )

  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value)
  }

  if (all.length === 0) return []

  // Sortuj po dacie malejąco (jeśli jest)
  all.sort((a, b) => {
    const ta = a.pubDate ? Date.parse(a.pubDate) : 0
    const tb = b.pubDate ? Date.parse(b.pubDate) : 0
    return tb - ta
  })

  cache.set(topic, { items: all, ts: Date.now() })
  return all
}

// ===================================================================
// Public API — getNewsForToday
// ===================================================================

/**
 * Zwraca jeden nagłówek news dnia. Deterministyczny per data
 * (wszyscy userzy widzą ten sam tytuł danego dnia, więc cache i
 * konsystencja są łatwe).
 */
export async function getNewsForToday(date = new Date()): Promise<NewsItem> {
  const topic = getTopicForToday(date)
  const meta = TOPIC_META[topic]
  const items = await fetchTopic(topic)

  // Deterministyczny wybór: hash z daty (YYYY-MM-DD) → index w tablicy
  const dateKey = date.toISOString().slice(0, 10)
  const seed = simpleHash(dateKey)

  if (items.length > 0) {
    const item = items[seed % items.length]
    return {
      topic,
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
  const fbList = FALLBACK[topic]
  const text = fbList[seed % fbList.length]
  return {
    topic,
    topicLabel: meta.label,
    topicEmoji: meta.emoji,
    title: text,
    url: null,
    source: 'Maraf · ciekawostki',
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
