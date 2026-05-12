import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isContractor, contractorCanAccess } from '@/lib/auth-utils'

/**
 * Server-side gate dla rol CONTRACTOR (np. Konrad — kierownik podwykonawcy).
 *
 * CONTRACTOR widzi tylko sekcje Przeroby. Proba wejscia na inne strony →
 * redirect /przeroby. Proba wywolania innych endpointow API → 403.
 *
 * Authenticacja sama w sobie nie jest tu sprawdzana — niezalogowani sa
 * blokowani na poziomie strony przez (app)/layout.tsx (`if (!session)
 * redirect /auth/signin`). Middleware uzupelnia o gate ROLE.
 *
 * Matcher wyklucza: /auth/*, /api/auth/* (zeby logowanie/wylogowanie dzialalo),
 * /_next/*, static assets (pliki z kropka w nazwie).
 */
export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.email) return NextResponse.next()

  if (isContractor(token.email) && !contractorCanAccess(pathname)) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }
    return NextResponse.redirect(new URL('/przeroby', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!auth|api/auth|_next|favicon|.*\\.).*)'],
}
