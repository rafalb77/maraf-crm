import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { getGreeting } from '@/lib/greeting'
import { getNewsForToday } from '@/lib/news-feed'
import { getWeather } from '@/lib/weather'

export const runtime = 'nodejs'

/**
 * GET /api/dashboard/widget
 *
 * Zwraca dane do TopWidget na dashboardzie:
 *  - greeting: powitanie po imieniu + porze dnia
 *  - news: news dnia (deterministyczny per data)
 *  - weather: aktualna pogoda + dzienne min/max + wschód/zachód
 *
 * Uwaga: news + weather mają wewnętrzne cache (per proces serwera).
 * News - 6h, weather - 30min.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Tylko admin widzi widget (per ustalenie z userem)
  // Pozostali userzy dostaną pusty obiekt — UI nie wyrenderuje sekcji
  const userIsAdmin = isAdmin(session.user.email)

  const greeting = getGreeting({
    email: session.user.email,
    name: session.user.name,
  })

  if (!userIsAdmin) {
    return NextResponse.json({ greeting, news: null, weather: null, isAdmin: false })
  }

  // Równolegle — news i weather są niezależne
  const [news, weather] = await Promise.all([
    getNewsForToday().catch((e) => {
      console.warn('[widget] news error:', e?.message)
      return null
    }),
    getWeather().catch((e) => {
      console.warn('[widget] weather error:', e?.message)
      return null
    }),
  ])

  return NextResponse.json({ greeting, news, weather, isAdmin: true })
}
