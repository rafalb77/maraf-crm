import { NextRequest, NextResponse } from 'next/server'
import { generateCatalogXml } from '@/lib/dane-gov-export'

export const dynamic = 'force-dynamic'

// Publiczny (bez sesji) katalog otwarte_dane XML — listuje wszystkie dzienne
// snapshoty jako zasoby. TEN URL rejestruje sie raz u ministerstwa
// (mail na kontakt@dane.gov.pl); harvester sam dociaga nowe dzienne pliki.

function baseUrl(req: NextRequest): string {
  const env = process.env.NEXTAUTH_URL
  if (env) return env.replace(/\/$/, '')
  return new URL(req.url).origin
}

export async function GET(req: NextRequest) {
  const xml = await generateCatalogXml(baseUrl(req))
  return new NextResponse(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
