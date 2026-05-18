import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'

export const runtime = 'nodejs'

/**
 * GET /api/auth/reset-password?token=...
 * Sprawdza czy token istnieje i nie wygasł.
 * Używane przez stronę resetu do walidacji przed pokazaniem formularza.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Brak tokenu' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { resetToken: token },
    select: { id: true, resetTokenExpiry: true },
  })

  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    return NextResponse.json({ error: 'Link wygasł lub jest nieprawidłowy' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * POST /api/auth/reset-password
 * Body: { token: string, password: string }
 * Resetuje hasło i czyści token.
 */
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Brak tokenu' }, { status: 400 })
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Hasło musi mieć co najmniej 8 znaków' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { resetToken: token },
    })

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return NextResponse.json({ error: 'Link wygasł lub jest nieprawidłowy' }, { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    })

    const meta = extractRequestMeta(req)
    void audit({
      action: 'PASSWORD_RESET',
      userId: user.id,
      userEmail: user.email,
      entity: 'User',
      entityId: user.id,
      path: req.nextUrl.pathname,
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[reset-password] error:', e)
    return NextResponse.json({ error: 'Wystąpił błąd serwera' }, { status: 500 })
  }
}
