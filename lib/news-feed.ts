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

const FEEDS: Record<Topic, { url: string; source: string }[]> = {
  tech: [
    { url: 'https://hnrss.org/frontpage', source: 'Hacker News' },
    { url: 'https://feeds.arstechnica.com/arstechnica/index', source: 'Ars Technica' },
  ],
  world: [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera' },
  ],
  motivation: [
    { url: 'https://jamesclear.com/feed', source: 'James Clear' },
    { url: 'https://markmanson.net/feed', source: 'Mark Manson' },
  ],
  biohacking: [
    { url: 'https://daveasprey.com/feed/', source: 'Dave Asprey' },
    { url: 'https://bengreenfieldlife.com/feed/', source: 'Ben Greenfield' },
  ],
}

// ===================================================================
// Fallback — kuratorowane "ciekawostki" / cytaty per topic.
// Działa offline, używane gdy RSS padnie.
// ===================================================================

const FALLBACK: Record<Topic, string[]> = {
  tech: [
    'Pierwszy komputer na świecie ENIAC ważył 30 ton i miał moc obliczeniową słabszą od dzisiejszego kalkulatora.',
    'GPT-4 ma ~1,76 biliona parametrów — to ~10× więcej niż GPT-3 z 2020 r.',
    'Chip M-class Apple\'a wykonuje 11 bilionów operacji na sekundę przy zużyciu 5W energii.',
    'Każda sekunda na YouTube to 500 godzin nowego materiału.',
    'Fotony z czarnej dziury M87 dotarły do nas po 53 milionach lat.',
  ],
  world: [
    'Co minutę na świecie rodzi się 250 dzieci, a 100 osób umiera.',
    'Oceany pochłaniają około 30% CO₂ wyemitowanego przez ludzkość.',
    'Według WHO 99% ludności oddycha powietrzem niezgodnym z normami czystości.',
    'Najbogatszy 1% ludności świata posiada więcej majątku niż reszta razem wzięta.',
    'Jeden lot transatlantycki to średnio 1 tona CO₂ na pasażera.',
  ],
  motivation: [
    'James Clear: „Codziennie 1% lepszy = 37× lepszy w skali roku."',
    'Mark Manson: „Wartość Twojego życia mierzy się nie ilością problemów, lecz ich jakością."',
    'Naval Ravikant: „Czytaj to, co Cię ekscytuje — nie to, co modne."',
    'Cal Newport: „Deep work to umiejętność XXI wieku, której większość już nie posiada."',
    'David Goggins: „Najbardziej niedoceniana umiejętność: konsekwencja w nudzie."',
  ],
  biohacking: [
    'Ekspozycja na zimno (10 min, 14°C) zwiększa norepinefrynę o 200–300%.',
    'Sen poniżej 6 h = wzrost ryzyka demencji o 30% (badanie z 2021 r.).',
    'Krótka 20-min drzemka po południu poprawia uczenie się o ~30%.',
    'Spożycie 200 mg L-teaniny + 100 mg kofeiny = lepsza koncentracja niż sama kofeina.',
    'Zone 2 cardio 3×/tyg po 45 min = +12% mitochondrii w 8 tygodni.',
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
