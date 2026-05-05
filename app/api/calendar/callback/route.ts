import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOAuthClient } from '@/lib/google-calendar'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(new URL('/auth/signin', req.url))

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/settings?error=no_code', req.url))

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

  return NextResponse.redirect(new URL('/settings?success=calendar_connected', req.url))
}
