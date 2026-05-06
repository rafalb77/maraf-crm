import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import crypto from 'crypto'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

/**
 * POST /api/users/[id]/send-reset
 * Wysyła ponownie link do resetu/aktywacji hasła do wskazanego użytkownika.
 * Generuje nowy token (poprzedni unieważnia).
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, name: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'Użytkownik nie istnieje' }, { status: 404 })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1h

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: token, resetTokenExpiry: expiry },
  })

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const resetUrl = `${baseUrl}/auth/reset-password/${token}`

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h1 style="color: #1f2937; font-size: 24px; margin-bottom: 16px;">Reset hasła — CRM Maraf Development</h1>
        <p style="font-size: 16px; line-height: 1.5;">
          Cześć${user.name ? ` ${user.name}` : ''}!
        </p>
        <p style="font-size: 16px; line-height: 1.5;">
          Administrator wygenerował dla Ciebie nowy link do resetu hasła. Kliknij przycisk poniżej, aby ustawić nowe hasło:
        </p>
        <p style="margin: 32px 0;">
          <a href="${resetUrl}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; display: inline-block;">
            Ustaw nowe hasło
          </a>
        </p>
        <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">
          Link jest ważny przez <strong>1 godzinę</strong>.
        </p>
        <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
          Jeśli przycisk nie działa, skopiuj link do przeglądarki:<br/>
          <span style="word-break: break-all;">${resetUrl}</span>
        </p>
      </body>
    </html>
  `
  const text = `Reset hasla — CRM Maraf Development\n\nKliknij w link, aby ustawic nowe haslo (wazny 1h):\n${resetUrl}`

  let mailOk = true
  let mailError: string | null = null
  try {
    await sendEmail({
      to: user.email,
      subject: 'Reset hasła — CRM Maraf Development',
      html,
      text,
    })
  } catch (e: any) {
    mailOk = false
    mailError = e?.message || 'Błąd wysyłki e-maila'
    console.error('[users.send-reset] mail error:', e?.message || e)
  }

  return NextResponse.json({
    ok: mailOk,
    error: mailError,
    resetUrl: mailOk ? null : resetUrl, // jeśli mail padł, admin może podać link ręcznie
  })
}
