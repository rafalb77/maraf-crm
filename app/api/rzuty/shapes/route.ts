import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Ręcznie obrysowane kontury mieszkań na rzutach (edytor w /rzuty).
// Przechowywane w Settings pod kluczem 'rzuty.shapes' jako JSON:
//   { [floorKey: string]: { [unitNumber: string]: [x,y][] } }
// Współrzędne w układzie viewportu planszy (pt, jak markers.json).

const KEY = 'rzuty.shapes'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const row = await prisma.settings.findUnique({ where: { key: KEY } })
  try {
    return NextResponse.json(row ? JSON.parse(row.value) : {})
  } catch {
    return NextResponse.json({})
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Nieprawidłowe dane obrysów' }, { status: 400 })
  }
  // Walidacja struktury: floorKey -> unitNumber -> [[x,y], ...] (min. trójkąt).
  for (const [floorKey, shapes] of Object.entries(body)) {
    if (typeof shapes !== 'object' || shapes === null) {
      return NextResponse.json({ error: `Nieprawidłowa plansza: ${floorKey}` }, { status: 400 })
    }
    for (const [num, pts] of Object.entries(shapes as Record<string, unknown>)) {
      if (
        !Array.isArray(pts) ||
        pts.length < 3 ||
        pts.some((p) => !Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
      ) {
        return NextResponse.json({ error: `Nieprawidłowy obrys lokalu ${num}` }, { status: 400 })
      }
    }
  }

  const value = JSON.stringify(body)
  await prisma.settings.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  })
  return NextResponse.json({ success: true })
}
