'use client'
import { useEffect, useState } from 'react'
import { ExternalLink, Sunrise, Sunset, Wind, Loader2 } from 'lucide-react'
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
  isAdmin: boolean
}

export function TopWidget() {
  const [data, setData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/widget')
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

  // Jeśli user nie jest adminem → nie renderuj nic
  if (!data || !data.isAdmin || !data.greeting) {
    if (data?.greeting) {
      // Zwykły user też dostaje powitanie, bez news/weather
      return <SimpleGreeting greeting={data.greeting} />
    }
    return null
  }

  return (
    <div
      className="rounded-2xl border p-5 mb-6 overflow-hidden relative"
      style={{
        background:
          'linear-gradient(135deg, rgba(201,163,122,0.10) 0%, rgba(201,163,122,0.04) 50%, rgba(44,62,84,0.06) 100%)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="relative grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-5 items-start">
        {/* LEWA: Powitanie */}
        <GreetingCard greeting={data.greeting} />

        {/* ŚRODEK: News */}
        {data.news ? <NewsCard news={data.news} /> : <NewsPlaceholder />}

        {/* PRAWA: Pogoda */}
        {data.weather ? <WeatherCard weather={data.weather} /> : <WeatherPlaceholder />}
      </div>
    </div>
  )
}

// =====================================================================
// GreetingCard
// =====================================================================

function GreetingCard({ greeting }: { greeting: Greeting }) {
  return (
    <div className="lg:min-w-[180px]">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider mb-1"
           style={{ color: 'var(--text-muted)' }}>
        <span>{greeting.emoji}</span>
        <span>{greeting.partOfDay}</span>
      </div>
      <p className="text-2xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
        {greeting.text}
      </p>
      <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
        {greeting.partOfDayLabel}
      </p>
    </div>
  )
}

function SimpleGreeting({ greeting }: { greeting: Greeting }) {
  return (
    <div className="rounded-2xl border p-5 mb-6"
         style={{
           background: 'var(--surface)',
           borderColor: 'var(--border)',
         }}>
      <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {greeting.emoji} {greeting.text}
      </p>
      <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
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
    <div className="lg:px-5 lg:border-l lg:border-r" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider mb-1.5"
           style={{ color: 'var(--text-muted)' }}>
        <span>{news.topicEmoji}</span>
        <span>{news.topicLabel}</span>
        {!news.isLive && (
          <span className="px-1.5 py-0.5 rounded text-[9px]"
                style={{
                  background: 'rgba(201,163,122,0.15)',
                  color: 'var(--accent)',
                }}>
            ciekawostka
          </span>
        )}
      </div>
      <Wrapper
        {...(wrapperProps as any)}
        className={`block group ${news.url ? 'cursor-pointer' : ''}`}
      >
        <p
          className="text-base font-medium leading-snug line-clamp-3"
          style={{ color: 'var(--text-primary)' }}
        >
          {news.title}
          {news.url && (
            <ExternalLink
              className="inline-block w-3.5 h-3.5 ml-1 opacity-50 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--accent)' }}
            />
          )}
        </p>
      </Wrapper>
      <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
        {news.source}
      </p>
    </div>
  )
}

function NewsPlaceholder() {
  return (
    <div className="lg:px-5 lg:border-l lg:border-r" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider mb-1.5"
           style={{ color: 'var(--text-muted)' }}>
        <span>📰</span>
        <span>News</span>
      </div>
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
    <div className="lg:min-w-[280px] lg:text-right">
      <div className="text-xs uppercase tracking-wider mb-1.5 lg:text-right"
           style={{ color: 'var(--text-muted)' }}>
        {weather.city}
      </div>

      <div className="flex lg:justify-end items-center gap-3">
        <WeatherIcon name={c.condition.iconName} size={56} />
        <div className="flex flex-col items-start lg:items-end">
          <span className="text-4xl font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>
            {c.tempC}°
          </span>
          <span className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {c.condition.label}
          </span>
        </div>
      </div>

      <div className="flex lg:justify-end items-center gap-3 mt-2 text-xs flex-wrap"
           style={{ color: 'var(--text-muted)' }}>
        <span className="tabular-nums">
          ↓ {d.minC}° &nbsp;↑ {d.maxC}°
        </span>
        <span className="inline-flex items-center gap-1">
          <Wind className="w-3 h-3" />
          {c.windKmh} km/h {c.windDir}
        </span>
      </div>

      <div className="flex lg:justify-end items-center gap-3 mt-1 text-xs"
           style={{ color: 'var(--text-muted)' }}>
        <span className="inline-flex items-center gap-1">
          <Sunrise className="w-3 h-3" />
          {d.sunrise}
        </span>
        <span className="inline-flex items-center gap-1">
          <Sunset className="w-3 h-3" />
          {d.sunset}
        </span>
      </div>
    </div>
  )
}

function WeatherPlaceholder() {
  return (
    <div className="lg:min-w-[180px] lg:text-right">
      <div className="flex lg:justify-end items-center gap-2 text-xs uppercase tracking-wider mb-1"
           style={{ color: 'var(--text-muted)' }}>
        <span>🌥</span>
        <span>Pogoda</span>
      </div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Brak danych
      </p>
    </div>
  )
}
