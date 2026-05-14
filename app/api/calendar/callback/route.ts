import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOAuthClient } from '@/lib/google-calendar'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  // UWAGA: req.url w kontenerze za reverse proxy (Coolify/Traefik) ma wewnętrzny
  // host (0.0.0.0:3000) zamiast publicznego — redirect przez new URL(..., req.url)
  // lądowałby na 0.0.0.0:3000. Bazujemy na NEXTAUTH_URL (publiczny adres aplikacji).
  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(new URL('/auth/signin', appUrl))

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/settings?error=no_code', appUrl))

  const oauth2Client = getOAuthClient()
  const { tokens } = await oauth2Client.getToken(code)

  await prisma.calendarToken.deleteMany()
  await prisma.calendarToken.create({
    data: {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  })

  return NextResponse.redirect(new URL('/settings?success=calendar_connected', appUrl))
}
