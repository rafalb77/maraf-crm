import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isAdmin } from '@/lib/auth-utils'
import { getRequiredPermission, getFirstAvailableUrl } from '@/lib/permissions'

/**
 * Server-side gate per-permission.
 *
 * Czyta permissions z JWT (snapshot przy logowaniu — patrz lib/auth.ts jwt callback).
 * Sprawdza pathname → wymagana permission (lib/permissions.ts):
 *  - admin (NEXT_PUBLIC_ADMIN_EMAIL) ma override, przepuszczamy wszystko
 *  - permission match → przepuść
 *  - brak permission → 403 JSON dla /api/*, redirect na pierwszą dostępną sekcję dla stron
 *  - required === 'admin' i user nie jest adminem → jak wyżej
 *
 * Authenticacja sama w sobie nie jest tu sprawdzana — niezalogowani sa blokowani
 * na poziomie strony przez (app)/layout.tsx. Middleware uzupelnia o gate PERMISSIONS.
 *
 * Po update permissions w /settings user musi się wylogować i zalogować ponownie
 * (token JWT jest snapshot-em).
 */
export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.email) return NextResponse.next()

  // Per-konto limit sesji (cookie żyje 30 dni — patrz lib/auth.ts session.maxAge):
  // kierownik budowy (checkinOnly) 30 dni, wszyscy inni 8h od logowania (token.authAt).
  // Token bez authAt (sprzed wdrożenia) traktujemy jak wygasły — jednorazowy re-login.
  const authAt = typeof token.authAt === 'number' ? token.authAt : 0
  const sessionLimitMs =
    token.checkinOnly === true ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000
  if (Date.now() - authAt > sessionLimitMs) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ error: 'Sesja wygasła — zaloguj się ponownie' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }
    return NextResponse.redirect(new URL('/auth/signin', req.url))
  }

  // Admin override — zawsze ma wszystko.
  if (isAdmin(token.email)) return NextResponse.next()

  const required = getRequiredPermission(pathname)
  if (required === null) return NextResponse.next()

  const permissions = (token.permissions as string[] | undefined) || []

  // 'admin' wymagany — tylko admin (już sprawdzony wyżej), zwykły user dostaje deny.
  if (required === 'admin') {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ error: 'Forbidden — admin only' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }
    return NextResponse.redirect(new URL(getFirstAvailableUrl(permissions), req.url))
  }

  if (permissions.includes(required)) return NextResponse.next()

  // Brak permission.
  if (pathname.startsWith('/api/')) {
    return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }
  return NextResponse.redirect(new URL(getFirstAvailableUrl(permissions), req.url))
}

export const config = {
  matcher: ['/((?!auth|api/auth|_next|favicon|.*\\.).*)'],
}
