import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { ALL_PERMISSIONS } from '@/lib/permissions'

export const runtime = 'nodejs'

/**
 * PATCH /api/users/[id]/permissions
 * Body: { permissions: string[] }
 *
 * Tylko admin moze edytowac permissions innych userow.
 * Walidacja: kazdy element musi byc na liscie ALL_PERMISSIONS.
 *
 * Po zapisaniu — user ktorego dotyczy zmiana musi sie wylogowac i zalogowac
 * ponownie, zeby permissions zostaly odswiezone w JWT.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.permissions)) {
    return NextResponse.json({ error: 'permissions must be array' }, { status: 400 })
  }

  // Walidacja: tylko znane identyfikatory + unikalne
  const valid = ALL_PERMISSIONS as readonly string[]
  const cleaned: string[] = Array.from(
    new Set(
      body.permissions.filter((p: unknown): p is string => typeof p === 'string' && valid.includes(p)),
    ),
  )

  const updated = await prisma.user.update({
    where: { id },
    data: { permissions: cleaned },
    select: { id: true, email: true, permissions: true },
  })

  return NextResponse.json(updated)
}
