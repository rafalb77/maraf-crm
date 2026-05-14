import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { isAnthropicConfigured, generateAdCopy } from '@/lib/ad-copy'
import { UNIT_TYPE_LABELS, canGenerateCreative, type UnitType } from '@/lib/types'

function unitTypeLabel(type: string, rooms: number | null): string {
  if (type === 'MIESZKALNY') {
    return rooms && rooms > 0 ? `Mieszkanie ${rooms}-pokojowe` : 'Mieszkanie'
  }
  return UNIT_TYPE_LABELS[type as UnitType] || 'Lokal'
}

function floorLabel(floor: number | null): string {
  if (floor === null || floor === undefined) return 'nie podano'
  if (floor === 0) return 'parter'
  if (floor < 0) return 'podziemie'
  return `${floor}. piętro`
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      {
        error:
          'Generator tekstów AI nie jest skonfigurowany — brak ANTHROPIC_API_KEY. Dodaj zmienną w Coolify (Environment Variables) i zrób rebuild aplikacji.',
      },
      { status: 503 },
    )
  }

  const unit = await prisma.unit.findUnique({ where: { id: params.id } })
  if (!unit) return NextResponse.json({ error: 'Lokal nie istnieje' }, { status: 404 })
  if (!canGenerateCreative(unit)) {
    return NextResponse.json(
      { error: 'Generowanie tekstów niedostępne dla tego lokalu (komórka/parking/garaż lub lokal sprzedany).' },
      { status: 403 },
    )
  }

  const investRow = await prisma.settings.findUnique({ where: { key: 'investmentName' } })
  const investmentName = investRow?.value || 'Inwestycja'

  try {
    const variants = await generateAdCopy({
      unitNumber: unit.number,
      unitTypeLabel: unitTypeLabel(unit.type, unit.rooms),
      rooms: unit.rooms,
      area: unit.area,
      floorLabel: floorLabel(unit.floor),
      priceGross: unit.priceGross,
      pricePerSqmGross: unit.pricePerSqmGross,
      investmentName,
    })
    return NextResponse.json({ variants })
  } catch (err: any) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: 'Klucz ANTHROPIC_API_KEY jest nieprawidłowy lub został odrzucony przez API.' },
        { status: 502 },
      )
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return NextResponse.json(
        { error: 'Klucz API nie ma uprawnień do modelu (claude-opus-4-7). Sprawdź plan konta Anthropic.' },
        { status: 502 },
      )
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'Przekroczono limit zapytań do API Anthropic. Spróbuj ponownie za chwilę.' },
        { status: 429 },
      )
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Błąd API Anthropic (${err.status}): ${err.message}` },
        { status: 502 },
      )
    }
    console.error('[ad-copy] generate error:', err)
    return NextResponse.json(
      { error: 'Błąd generowania tekstów: ' + (err?.message || 'nieznany') },
      { status: 500 },
    )
  }
}
