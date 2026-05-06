import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Generuje token resetu (32 bytes hex), zapisuje w DB z 1h ważności,
 * wysyła e-mail z linkiem.
 *
 * Z bezpieczeństwa zawsze zwraca success — niezależnie od tego czy konto
 * istnieje (zapobiega user enumeration).
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Brak adresu e-mail' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    // Zawsze zwracamy success (security best practice — nie ujawniamy czy konto istnieje)
    if (!user) {
      return NextResponse.json({ ok: true })
    }

    // Wygeneruj token i zapisz
    const token = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1h

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetTokenExpiry: expiry,
      },
    })

    // Wyślij e-mail
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const resetUrl = `${baseUrl}/auth/reset-password/${token}`

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
          <h1 style="color: #1f2937; font-size: 24px; margin-bottom: 16px;">Reset hasła</h1>
          <p style="font-size: 16px; line-height: 1.5;">
            Otrzymaliśmy żądanie zmiany hasła do Twojego konta w <strong>CRM Maraf Development</strong>.
          </p>
          <p style="font-size: 16px; line-height: 1.5;">
            Kliknij poniższy przycisk, aby ustawić nowe hasło:
          </p>
          <p style="margin: 32px 0;">
            <a href="${resetUrl}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; display: inline-block;">
              Ustaw nowe hasło
            </a>
          </p>
          <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">
            Link jest ważny przez <strong>1 godzinę</strong>. Jeśli to nie Ty, zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.
          </p>
          <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
            Jeśli przycisk nie działa, skopiuj poniższy link do przeglądarki:<br/>
            <span style="word-break: break-all;">${resetUrl}</span>
          </p>
        </body>
      </html>
    `
    const text = `Reset hasła — CRM Maraf Development\n\nKliknij w link, aby ustawić nowe hasło (ważny 1h):\n${resetUrl}\n\nJeśli to nie Ty, zignoruj tę wiadomość.`

    try {
      await sendEmail({
        to: normalizedEmail,
        subject: 'Reset hasła — CRM Maraf Development',
        html,
        text,
      })
    } catch (mailErr: any) {
      // Nie ujawniamy szczegółów mailowych użytkownikowi (security)
      console.error('[forgot-password] mail error:', mailErr?.message || mailErr)
      // Mimo błędu zwracamy success — alternatywą jest pokazanie błędu konfiguracji SMTP w UI
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[forgot-password] error:', e)
    return NextResponse.json({ error: 'Wystąpił błąd serwera' }, { status: 500 })
  }
}
