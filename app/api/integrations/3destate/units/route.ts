/**
 * Publiczny endpoint integracyjny dla 3D Estate.
 * 3DE odpytuje co 15-30 min (model pull), zwracamy listę wszystkich lokali.
 *
 * **NIE wymaga sesji NextAuth** — to zewnętrzny system. Autoryzacja przez X-API-Key.
 * Endpoint celowo POZA route group `(app)`, żeby nie podlegał logice redirectu do `/auth/signin`.
 *
 * Patrz: docs/integracja-3destate-decyzje.md, lib/3destate.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeUnit, validateApiKey, getClientIp } from '@/lib/3destate'

// Force dynamic — wynik zależy od bazy, nie statyczny.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Ładujemy konfigurację z Settings (klucz API, opcjonalny IP whitelist, prospekt URL).
  const settingsRows = await prisma.settings.findMany({
    where: {
      key: { in: ['threeDEstateApiKey', 'threeDEstateAllowedIp', 'prospektInformacyjnyUrl'] },
    },
  })
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]))
  const storedKey = settings.threeDEstateApiKey || null
  const allowedIp = (settings.threeDEstateAllowedIp || '').trim() || null
  const prospektUrl = (settings.prospektInformacyjnyUrl || '').trim() || null

  // Jeśli klucz nie jest skonfigurowany — endpoint jest wyłączony.
  if (!storedKey) {
    return NextResponse.json(
      { error: 'Integration disabled (no API key configured)' },
      { status: 503 }
    )
  }

  // Walidacja API key (X-API-Key header).
  const providedKey = req.headers.get('x-api-key')
  if (!validateApiKey(providedKey, storedKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Opcjonalna walidacja IP — tylko jeśli admin skonfigurował whitelist w Settings.
  if (allowedIp) {
    const clientIp = getClientIp(req)
    if (clientIp !== allowedIp) {
      return NextResponse.json(
        { error: 'Forbidden (IP not allowed)', clientIp },
        { status: 403 }
      )
    }
  }

  // Bazowy URL aplikacji — używany do budowy absolutnych URL-i do PDF-ów.
  // Pobieramy z requestu (3DE wystawia request na nasz publiczny adres), żeby
  // automatycznie używać tego samego origin co używa 3DE.
  const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`

  // Pobierz wszystkie lokale. W przyszłości można dodać filtrowanie per inwestycja
  // poprzez parametr query `?investment=<slug>` — na razie mamy jedną inwestycję.
  const units = await prisma.unit.findMany({
    orderBy: { number: 'asc' },
  })

  const serialized = units.map((u) => serializeUnit(u, baseUrl, prospektUrl))

  return NextResponse.json(serialized, {
    headers: {
      // Bez cache — 3DE chce widzieć aktualny stan przy każdym pollu.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
