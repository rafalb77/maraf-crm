'use client'
import { useEffect, useState } from 'react'
import { ExternalLink, Sunrise, Sunset, Loader2 } from 'lucide-react'
import { WeatherIcon } from './WeatherIcon'

type Greeting = {
  text: string
  partOfDay: string
  partOfDayLabel: string
  emoji: string
}

type News = {
  topic: string
  topicLabel: string
  topicEmoji: string
  title: string
  url: string | null
  source: string
  publishedAt: string | null
  isLive: boolean
}

type WeatherIconName =
  | 'sun' | 'cloud-sun' | 'cloud' | 'cloud-fog'
  | 'cloud-drizzle' | 'cloud-rain' | 'cloud-rain-wind'
  | 'cloud-snow' | 'cloud-lightning' | 'cloud-hail'

type Weather = {
  city: string
  current: {
    tempC: number
    feelsLikeC: number | null
    condition: { emoji: string; iconName: WeatherIconName; label: string }
    windKmh: number
    windDir: string
  }
  daily: {
    minC: number
    maxC: number
    sunrise: string
    sunset: string
  }
  fetchedAt: string
}

type WidgetData = {
  greeting: Greeting | null
  news: News | null
  weather: Weather | null
}

export function TopWidget() {
  const [data, setData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Timeout 10s — gdy endpoint hangs (np. po restarcie kontenera: pusty cache
    // news/weather, wolne RSS / Open-Meteo), klient wyrwie się ze spinnera
    // "Ładuję news i pogodę…" zamiast czekać w nieskończoność. Po timeout
    // traktujemy jak błąd → loading=false, data=null → strona renderuje się
    // bez widgetu (zamiast wiecznego spinnera).
    fetch('/api/dashboard/widget', { signal: AbortSignal.timeout(10000) })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Skeleton loader podczas ładowania
  if (loading) {
    return (
      <div className="rounded-2xl border p-5 mb-6 flex items-center gap-3"
           style={{
             background: 'linear-gradient(135deg, rgba(201,163,122,0.06), rgba(201,163,122,0.02))',
             borderColor: 'var(--border)',
           }}>
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Ładuję news i pogodę…</span>
      </div>
    )
  }

  // Bez danych — nic nie renderujemy (np. 401, /api/dashboard/widget zablokowany przez permission).
  if (!data || !data.greeting) {
    return null
  }

  // Jeśli i news i weather padły → samo powitanie-nagłówek, bez kart.
  if (!data.news && !data.weather) {
    return <GreetingHeader greeting={data.greeting} />
  }

  // Bento v2: nagłówek (eyebrow + H1) nad siatką, potem Pogoda (span 4) + Aktualności (span 8).
  return (
    <>
      <GreetingHeader greeting={data.greeting} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
        <div
          className="lg:col-span-4 bg-white rounded-xl border border-gray-200 p-5 v2-card-in flex flex-col"
          style={{ animationDelay: '0s' }}
        >
          {data.weather ? <WeatherCard weather={data.weather} /> : <WeatherPlaceholder />}
        </div>
        <div
          className="lg:col-span-8 bg-white rounded-xl border border-gray-200 p-5 v2-card-in"
          style={{ animationDelay: '.06s' }}
        >
          {data.news ? <NewsCard news={data.news} /> : <NewsPlaceholder />}
        </div>
      </div>
    </>
  )
}

// =====================================================================
// GreetingHeader — nagłówek pulpitu (złoty eyebrow + H1 32px), nad siatką bento
// =====================================================================

function GreetingHeader({ greeting }: { greeting: Greeting }) {
  return (
    <div className="mb-7">
      <div className="v2-eyebrow flex items-center gap-2 mb-1.5">
        <span>{greeting.emoji}</span>
        <span>{greeting.partOfDay}</span>
      </div>
      <h1
        className="text-[32px] font-bold leading-tight m-0"
        style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
      >
        {greeting.text}
      </h1>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
        {greeting.partOfDayLabel}
      </p>
    </div>
  )
}

// =====================================================================
// NewsCard
// =====================================================================

function NewsCard({ news }: { news: News }) {
  const Wrapper = news.url ? 'a' : 'div'
  const wrapperProps = news.url
    ? { href: news.url, target: '_blank', rel: 'noopener noreferrer' }
    : {}

  return (
    <div>
      <div className="flex justify-between items-center mb-2.5">
        <h2 className="text-base font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
          Aktualności
        </h2>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{news.source}</span>
      </div>
      <Wrapper
        {...(wrapperProps as any)}
        className={`group flex gap-3 items-center px-2.5 py-2 -mx-2.5 rounded-lg transition-colors ${news.url ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5' : ''}`}
      >
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold flex-shrink-0"
          style={{ background: 'rgba(201,163,122,0.15)', color: 'var(--accent)' }}
        >
          <span>{news.topicEmoji}</span>
          <span className="uppercase tracking-wide">{news.topicLabel}</span>
        </span>
        <span
          className="flex-1 min-w-0 text-sm font-medium leading-snug line-clamp-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {news.title}
          {news.url && (
            <ExternalLink
              className="inline-block w-3.5 h-3.5 ml-1 opacity-50 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--accent)' }}
            />
          )}
        </span>
        {!news.isLive && (
          <span
            className="px-1.5 py-0.5 rounded text-[9px] flex-shrink-0"
            style={{ background: 'rgba(201,163,122,0.15)', color: 'var(--accent)' }}
          >
            ciekawostka
          </span>
        )}
      </Wrapper>
    </div>
  )
}

function NewsPlaceholder() {
  return (
    <div>
      <h2 className="text-base font-semibold m-0 mb-2.5" style={{ color: 'var(--text-primary)' }}>
        Aktualności
      </h2>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Brak danych — feed RSS nieosiągalny.
      </p>
    </div>
  )
}

// =====================================================================
// WeatherCard
// =====================================================================

function WeatherCard({ weather }: { weather: Weather }) {
  const c = weather.current
  const d = weather.daily

  return (
    <div className="flex flex-col flex-1">
      <div className="flex justify-between items-baseline mb-3.5">
        <h2 className="text-base font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
          Pogoda
        </h2>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{weather.city}</span>
      </div>

      <div className="flex items-center gap-3.5">
        <WeatherIcon name={c.condition.iconName} size={42} />
        <div>
          <div
            className="text-[32px] font-bold tabular-nums"
            style={{ color: 'var(--text-primary)', lineHeight: 1.1 }}
          >
            {c.tempC}°C
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {c.condition.label} · wiatr {c.windKmh} km/h {c.windDir}
          </div>
        </div>
      </div>

      <div className="flex-1" />

      {/* Stopka: min/max + wschód/zachód (zamiast prognozy 4-dniowej — endpoint daje tylko dziś) */}
      <div
        className="grid grid-cols-4 gap-2 mt-4 pt-3.5 border-t text-xs"
        style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}
      >
        <span className="flex flex-col items-center gap-1">
          <span className="uppercase text-[11px]" style={{ letterSpacing: '.06em' }}>Min</span>
          <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{d.minC}°</span>
        </span>
        <span className="flex flex-col items-center gap-1">
          <span className="uppercase text-[11px]" style={{ letterSpacing: '.06em' }}>Max</span>
          <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{d.maxC}°</span>
        </span>
        <span className="flex flex-col items-center gap-1">
          <Sunrise className="w-3.5 h-3.5" />
          <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{d.sunrise}</span>
        </span>
        <span className="flex flex-col items-center gap-1">
          <Sunset className="w-3.5 h-3.5" />
          <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{d.sunset}</span>
        </span>
      </div>
    </div>
  )
}

function WeatherPlaceholder() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span>🌥</span>
        <h2 className="text-base font-semibold m-0" style={{ color: 'var(--text-primary)' }}>Pogoda</h2>
      </div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Brak danych
      </p>
    </div>
  )
}
