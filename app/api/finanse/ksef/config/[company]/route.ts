import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'
import { normalizeNip, isValidNip } from '@/lib/ksef-defaults'

// PATCH /api/finanse/ksef/config/[company]
// Aktualizacja konfiguracji KSeF dla danej firmy.
// Body (wszystkie opcjonalne): { nip, token, environment, enabled, syncFromDate }
//   - token: null/'' usuwa, string nadpisuje. Maskowanie po stronie GET.
//   - environment: PROD | TEST
//   - syncFromDate: ISO date lub null
export async function PATCH(req: NextRequest, { params }: { params: { company: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Tylko admin' }, { status: 403 })

  const company = params.company === 'MARAF_DEVELOPMENT' ? 'MARAF_DEVELOPMENT' : 'MARAF'

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const data: any = {}
  if (body.nip !== undefined) {
    const n = normalizeNip(String(body.nip))
    if (!isValidNip(n)) return NextResponse.json({ error: 'Nieprawidłowy NIP (suma kontrolna)' }, { status: 400 })
    data.nip = n
  }
  if (body.token !== undefined) {
    data.token = body.token === null || String(body.token).trim() === '' ? null : String(body.token).trim()
  }
  if (body.environment !== undefined) {
    const env = String(body.environment)
    if (env !== 'PROD' && env !== 'TEST') return NextResponse.json({ error: 'environment musi być PROD lub TEST' }, { status: 400 })
    data.environment = env
  }
  if (body.enabled !== undefined) data.enabled = body.enabled === true
  if (body.syncFromDate !== undefined) {
    data.syncFromDate = body.syncFromDate ? new Date(body.syncFromDate) : null
  }

  const existing = await prisma.ksefConfig.findUnique({ where: { company }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Konfiguracja nie istnieje — wejdź na /finanse/ksef żeby ją utworzyć' }, { status: 404 })

  await prisma.ksefConfig.update({ where: { company }, data })
  return NextResponse.json({ ok: true })
}
