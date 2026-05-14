import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import crypto from 'crypto'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

/**
 * POST /api/users/[id]/send-reset
 *
 * Wysyła ponownie link do ustawienia hasła. Generuje nowy token (1h),
 * poprzedni unieważnia.
 *
 * Body (opcjonalne): { kind?: 'activation' | 'reset' }
 *   - 'activation' — dla NOWEGO użytkownika który jeszcze nie aktywował konta
 *     (mail w tonie zaproszenia, podaje login)
 *   - 'reset' (default) — dla istniejącego użytkownika (mail w tonie resetu hasła)
 *
 * Link prowadzi do tej samej strony (/auth/reset-password/[token]) — różni się
 * tylko treść maila. Jeśli SMTP padnie, zwracamy `resetUrl` do ręcznego podania.
 */

function buildEmail(
  kind: 'activation' | 'reset',
  opts: { name: string | null; email: string; url: string; adminName: string },
): { subject: string; html: string; text: string } {
  const { name, email, url, adminName } = opts
  const greeting = `Cześć${name ? ` ${name}` : ''}!`

  if (kind === 'activation') {
    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
          <h1 style="color: #1f2937; font-size: 24px; margin-bottom: 16px;">Zaproszenie do CRM Maraf Development</h1>
          <p style="font-size: 16px; line-height: 1.5;">${greeting}</p>
          <p style="font-size: 16px; line-height: 1.5;">
            <strong>${adminName}</strong> zaprasza Cię do systemu <strong>CRM Maraf Development</strong>.
            Aby aktywować konto i ustawić swoje hasło, kliknij poniższy przycisk:
          </p>
          <p style="margin: 32px 0;">
            <a href="${url}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; display: inline-block;">
              Aktywuj konto
            </a>
          </p>
          <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">
            Link jest ważny przez <strong>1 godzinę</strong>. Po jego wygaśnięciu poproś administratora o wysłanie nowego.
          </p>
          <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">
            Twój login (e-mail): <strong>${email}</strong>
          </p>
          <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
            Jeśli przycisk nie działa, skopiuj poniższy link do przeglądarki:<br/>
            <span style="word-break: break-all;">${url}</span>
          </p>
        </body>
      </html>
    `
    const text = `Zaproszenie do CRM Maraf Development\n\n${greeting}\n\n${adminName} zaprasza Cie do systemu CRM Maraf Development.\nAktywuj konto i ustaw haslo (link wazny 1h):\n${url}\n\nLogin: ${email}`
    return { subject: 'Aktywacja konta — CRM Maraf Development', html, text }
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h1 style="color: #1f2937; font-size: 24px; margin-bottom: 16px;">Reset hasła — CRM Maraf Development</h1>
        <p style="font-size: 16px; line-height: 1.5;">${greeting}</p>
        <p style="font-size: 16px; line-height: 1.5;">
          Administrator wygenerował dla Ciebie nowy link do ustawienia hasła. Kliknij przycisk poniżej:
        </p>
        <p style="margin: 32px 0;">
          <a href="${url}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; display: inline-block;">
            Ustaw nowe hasło
          </a>
        </p>
        <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">
          Link jest ważny przez <strong>1 godzinę</strong>.
        </p>
        <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">
          Twój login (e-mail): <strong>${email}</strong>
        </p>
        <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
          Jeśli przycisk nie działa, skopiuj link do przeglądarki:<br/>
          <span style="word-break: break-all;">${url}</span>
        </p>
      </body>
    </html>
  `
  const text = `Reset hasla — CRM Maraf Development\n\n${greeting}\n\nKliknij w link, aby ustawic nowe haslo (wazny 1h):\n${url}\n\nLogin: ${email}`
  return { subject: 'Reset hasła — CRM Maraf Development', html, text }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  // kind z body — opcjonalne, default 'reset'
  let kind: 'activation' | 'reset' = 'reset'
  try {
    const body = await req.json()
    if (body?.kind === 'activation') kind = 'activation'
  } catch {
    // brak body / nie-JSON → zostaje default 'reset'
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1h

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: token, resetTokenExpiry: expiry },
  })

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const resetUrl = `${baseUrl}/auth/reset-password/${token}`
  const adminName = (session.user as any).name || 'Administrator'

  const { subject, html, text } = buildEmail(kind, {
    name: user.name,
    email: user.email,
    url: resetUrl,
    adminName,
  })

  let mailOk = true
  let mailError: string | null = null
  try {
    await sendEmail({ to: user.email, subject, html, text })
  } catch (e: any) {
    mailOk = false
    mailError = e?.message || 'Błąd wysyłki e-maila'
    console.error('[users.send-reset] mail error:', e?.message || e)
  }

  return NextResponse.json({
    ok: mailOk,
    kind,
    error: mailError,
    resetUrl: mailOk ? null : resetUrl, // jeśli mail padł, admin może podać link ręcznie
  })
}
