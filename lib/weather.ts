/**
 * Pogoda z Open-Meteo (free, bez API key).
 * Domyslnie Lodz (51.76, 19.46) — mozna zmienic w env:
 *   WEATHER_LAT, WEATHER_LON, WEATHER_CITY
 * Cache w pamieci na 30 min (per proces serwera).
 */

const DEFAULT_LAT = 51.8556
const DEFAULT_LON = 19.4051
const DEFAULT_CITY = 'Zgierz'
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 min

// Mapowanie WMO weather codes → emoji + opis (skrócone)
// Pełna lista: https://open-meteo.com/en/docs (Weather Variable Documentation)
const WMO: Record<number, { emoji: string; label: string }> = {
  0: { emoji: '☀️', label: 'bezchmurnie' },
  1: { emoji: '🌤', label: 'głównie słonecznie' },
  2: { emoji: '⛅', label: 'częściowe zachmurzenie' },
  3: { emoji: '☁️', label: 'pochmurno' },
  45: { emoji: '🌫', label: 'mgła' },
  48: { emoji: '🌫', label: 'mgła osadzająca' },
  51: { emoji: '🌦', label: 'mżawka słaba' },
  53: { emoji: '🌦', label: 'mżawka' },
  55: { emoji: '🌦', label: 'mżawka silna' },
  61: { emoji: '🌧', label: 'deszcz słaby' },
  63: { emoji: '🌧', label: 'deszcz' },
  65: { emoji: '🌧', label: 'deszcz silny' },
  71: { emoji: '🌨', label: 'śnieg słaby' },
  73: { emoji: '🌨', label: 'śnieg' },
  75: { emoji: '🌨', label: 'śnieg silny' },
  80: { emoji: '🌦', label: 'przelotne opady' },
  81: { emoji: '🌧', label: 'przelotne opady' },
  82: { emoji: '⛈', label: 'silne opady' },
  95: { emoji: '⛈', label: 'burza' },
  96: { emoji: '⛈', label: 'burza z gradem' },
  99: { emoji: '⛈', label: 'silna burza z gradem' },
}

const WIND_DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

function windDirLabel(deg: number): string {
  const idx = Math.round(deg / 22.5) % 16
  return WIND_DIRS[idx]
}

export type Weather = {
  city: string
  current: {
    tempC: number
    feelsLikeC: number | null
    condition: { emoji: string; label: string }
    windKmh: number
    windDir: string
  }
  daily: {
    minC: number
    maxC: number
    sunrise: string // "06:32"
    sunset: string  // "18:42"
  }
  fetchedAt: string
}

let cache: { data: Weather; ts: number } | null = null

export async function getWeather(): Promise<Weather | null> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data

  const lat = parseFloat(process.env.WEATHER_LAT || '') || DEFAULT_LAT
  const lon = parseFloat(process.env.WEATHER_LON || '') || DEFAULT_LON
  const city = process.env.WEATHER_CITY || DEFAULT_CITY

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset` +
    `&timezone=auto&forecast_days=1`

  try {
    const res = await fetch(url, {
      // Server-side fetch (Node) — bez CORS issues
      next: { revalidate: 1800 }, // 30 min
    })
    if (!res.ok) return cache?.data ?? null
    const json = await res.json()

    const code = json.current?.weather_code as number | undefined
    const condition = (code != null && WMO[code]) || { emoji: '🌥', label: 'pochmurno' }
    const sunrise = String(json.daily?.sunrise?.[0] || '').slice(11, 16)
    const sunset = String(json.daily?.sunset?.[0] || '').slice(11, 16)

    const data: Weather = {
      city,
      current: {
        tempC: Math.round(json.current?.temperature_2m ?? 0),
        feelsLikeC:
          json.current?.apparent_temperature != null
            ? Math.round(json.current.apparent_temperature)
            : null,
        condition,
        windKmh: Math.round(json.current?.wind_speed_10m ?? 0),
        windDir: windDirLabel(json.current?.wind_direction_10m ?? 0),
      },
      daily: {
        minC: Math.round(json.daily?.temperature_2m_min?.[0] ?? 0),
        maxC: Math.round(json.daily?.temperature_2m_max?.[0] ?? 0),
        sunrise,
        sunset,
      },
      fetchedAt: new Date().toISOString(),
    }
    cache = { data, ts: Date.now() }
    return data
  } catch (e) {
    console.warn('[weather] fetch error:', (e as any)?.message)
    return cache?.data ?? null
  }
}
