import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { planSubvendorUnify, applySubvendorUnify } from '@/lib/subvendor-unify'

// Naprawa etykiet podwykonawcow (subVendor) — ujednolicenie do oficjalnych
// nazw kontrahentow. Tylko admin (operacja masowa na fakturach).
//
// GET            → podglad planu (nic nie zmienia)
// POST {apply:true} → wykonuje zmiany z aktualnego planu
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Tylko admin' }, { status: 403 })
  const plan = await planSubvendorUnify()
  return NextResponse.json(plan)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Tylko admin' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch {}
  if (body.apply !== true) {
    return NextResponse.json({ error: 'Brak apply:true' }, { status: 400 })
  }
  // Liczymy plan na nowo tuz przed zapisem (spojnosc — dane mogly sie zmienic).
  const plan = await planSubvendorUnify()
  const changed = await applySubvendorUnify(plan.renames)
  return NextResponse.json({ ok: true, changed, renames: plan.renames.length })
}
