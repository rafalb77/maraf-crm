import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { FINANSE_COMPANY_COOKIE } from '@/lib/finanse-company'

// POST /api/finanse/company { company: 'MARAF' | 'MARAF_DEVELOPMENT' }
// Ustawia aktywna firme (cookie) dla calego modulu Finanse.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const company = body.company === 'MARAF_DEVELOPMENT' ? 'MARAF_DEVELOPMENT' : 'MARAF'

  const res = NextResponse.json({ ok: true, company })
  res.cookies.set(FINANSE_COMPANY_COOKIE, company, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  return res
}
