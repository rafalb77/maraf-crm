'use client'
import {
  Sun,
  Cloud,
  CloudSun,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudLightning,
  CloudHail,
} from 'lucide-react'

type IconName =
  | 'sun' | 'cloud-sun' | 'cloud' | 'cloud-fog'
  | 'cloud-drizzle' | 'cloud-rain' | 'cloud-rain-wind'
  | 'cloud-snow' | 'cloud-lightning' | 'cloud-hail'

const ICON_MAP: Record<
  IconName,
  {
    Component: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>
    color: string
    animation: 'spin-slow' | 'float' | 'pulse-soft' | 'flash' | 'none'
    glow?: boolean
  }
> = {
  'sun':              { Component: Sun,            color: '#F59E0B', animation: 'spin-slow', glow: true },
  'cloud-sun':        { Component: CloudSun,       color: '#FBBF24', animation: 'float',     glow: true },
  'cloud':            { Component: Cloud,          color: '#94A3B8', animation: 'float' },
  'cloud-fog':        { Component: CloudFog,       color: '#9CA3AF', animation: 'pulse-soft' },
  'cloud-drizzle':    { Component: CloudDrizzle,   color: '#60A5FA', animation: 'pulse-soft' },
  'cloud-rain':       { Component: CloudRain,      color: '#3B82F6', animation: 'pulse-soft' },
  'cloud-rain-wind':  { Component: CloudRainWind,  color: '#2563EB', animation: 'pulse-soft' },
  'cloud-snow':       { Component: CloudSnow,      color: '#CBD5E1', animation: 'spin-slow' },
  'cloud-lightning':  { Component: CloudLightning, color: '#F59E0B', animation: 'flash' },
  'cloud-hail':       { Component: CloudHail,      color: '#A78BFA', animation: 'flash' },
}

export function WeatherIcon({
  name,
  size = 56,
  strokeWidth = 1.5,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
}) {
  const cfg = ICON_MAP[name] || ICON_MAP['cloud']
  const { Component, color, animation, glow } = cfg

  const animClass =
    animation === 'spin-slow' ? 'weather-spin'
    : animation === 'float' ? 'weather-float'
    : animation === 'pulse-soft' ? 'weather-pulse'
    : animation === 'flash' ? 'weather-flash'
    : ''

  const glowFilter = glow
    ? `drop-shadow(0 0 12px ${color}55) drop-shadow(0 0 4px ${color}88)`
    : `drop-shadow(0 2px 6px rgba(0,0,0,0.15))`

  return (
    <div
      className={animClass}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: glowFilter,
      }}
    >
      <Component
        strokeWidth={strokeWidth}
        style={{
          width: size,
          height: size,
          color,
        }}
      />
    </div>
  )
}
