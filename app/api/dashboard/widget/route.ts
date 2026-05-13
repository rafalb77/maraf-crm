import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGreeting } from '@/lib/greeting'
import { getNewsForToday } from '@/lib/news-feed'
import { getWeather } from '@/lib/weather'

export const runtime = 'nodejs'

/**
 * GET /api/dashboard/widget
 *
 * Zwraca dane do TopWidget na dashboardzie:
 *  - greeting: powitanie po preferredName/name/email + porze dnia
 *  - news: news dnia (deterministyczny per user + data) z interests/customInterests
 *  - weather: aktualna pogoda + dzienne min/max + wschód/zachód
 *
 * Permission `dashboard` jest sprawdzany w middleware.ts — tutaj zakładamy że user już przeszedł gate.
 * User.interests + customInterests czytane bezpośrednio z DB (po session.user.id) — zmiana
 * w /profil działa natychmiast bez relogowania (nie polegamy na JWT snapshot).
 *
 * Cache: news 6h, weather 30min — per proces serwera.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id || ''

  // Fresh read z DB (nie z session) żeby zmiany w /profil działały bez relogowania
  const dbUser = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { preferredName: true, interests: true, customInterests: true, name: true, email: true },
      })
    : null

  const greeting = getGreeting({
    email: dbUser?.email ?? session.user.email,
    name: dbUser?.name ?? session.user.name,
    preferredName: dbUser?.preferredName ?? null,
  })

  const [news, weather] = await Promise.all([
    getNewsForToday({
      userId,
      interests: dbUser?.interests,
      customInterests: dbUser?.customInterests,
    }).catch((e) => {
      console.warn('[widget] news error:', e?.message)
      return null
    }),
    getWeather().catch((e) => {
      console.warn('[widget] weather error:', e?.message)
      return null
    }),
  ])

  return NextResponse.json({ greeting, news, weather })
}
