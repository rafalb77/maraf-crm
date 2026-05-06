import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

/**
 * GET /api/users
 * Lista wszystkich użytkowników (bez password ani tokenów).
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      resetTokenExpiry: true, // służy tylko do statusu "czeka na aktywację"
      password: true, // sprawdzamy tylko czy nie pusty/placeholder
    },
    orderBy: { createdAt: 'asc' },
  })

  // Status: "active" jeśli user kiedykolwiek ustawił własne hasło
  // (rozpoznajemy po długości — placeholder hash ma zawsze 60 znaków bcrypt,
  //  ale i ustawione przez usera też. Lepiej trzymać flagę albo sprawdzać po
  //  obecności tokenu z przyszłą datą wygaśnięcia.)
  // Najprościej: jeśli resetTokenExpiry jest w przyszłości, user jeszcze nie aktywowany.
  const now = new Date()
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt,
      pendingActivation: u.resetTokenExpiry ? u.resetTokenExpiry > now : false,
    })),
  })
}

/**
 * POST /api/users
 * Body: { email: string, name?: string }
 *
 * Tworzy nowego użytkownika z losowym hasłem placeholder (nie do zalogowania)
 * i wysyła e-mail z linkiem aktywacyjnym (1h ważność).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const email = (body?.email || '').trim().toLowerCase()
    const name = (body?.name || '').trim() || null

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Niepoprawny adres e-mail' }, { status: 400 })
    }

    // Sprawdź czy już istnieje
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Użytkownik z tym e-mailem już istnieje' }, { status: 409 })
    }

    // Random placeholder password (32 bytes hex, nie do odgadnięcia)
    // User i tak musi go zmienić przez link aktywacyjny
    const placeholderPassword = crypto.randomBytes(32).toString('hex')
    const hashedPassword = await bcrypt.hash(placeholderPassword, 10)

    // Token aktywacyjny — 1h ważności (jak reset hasła)
    const token = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 60 * 60 * 1000)

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        resetToken: token,
        resetTokenExpiry: expiry,
      },
      select: { id: true, email: true, name: true, createdAt: true },
    })

    // Wyślij e-mail z linkiem aktywacyjnym
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const activationUrl = `${baseUrl}/auth/reset-password/${token}`
    const adminName = (session.user as any).name || 'Administrator'

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
          <h1 style="color: #1f2937; font-size: 24px; margin-bottom: 16px;">Zaproszenie do CRM Maraf Development</h1>
          <p style="font-size: 16px; line-height: 1.5;">
            Cześć${name ? ` ${name}` : ''}!
          </p>
          <p style="font-size: 16px; line-height: 1.5;">
            <strong>${adminName}</strong> dodał${adminName.endsWith('a') ? 'a' : ''} Cię do systemu <strong>CRM Maraf Development</strong>.
            Aby aktywować konto i ustawić swoje hasło, kliknij poniższy przycisk:
          </p>
          <p style="margin: 32px 0;">
            <a href="${activationUrl}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; display: inline-block;">
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
            <span style="word-break: break-all;">${activationUrl}</span>
          </p>
        </body>
      </html>
    `
    const text = `Zaproszenie do CRM Maraf Development\n\nCzesc${name ? ' ' + name : ''}!\n\n${adminName} dodal Cie do systemu CRM Maraf Development.\nAktywuj konto i ustaw haslo (link wazny 1h):\n${activationUrl}\n\nLogin: ${email}`

    let mailOk = true
    let mailError: string | null = null
    try {
      await sendEmail({
        to: email,
        subject: 'Aktywacja konta — CRM Maraf Development',
        html,
        text,
      })
    } catch (e: any) {
      mailOk = false
      mailError = e?.message || 'Błąd wysyłki e-maila'
      console.error('[users.POST] mail error:', e?.message || e)
    }

    return NextResponse.json({
      user,
      mail: { sent: mailOk, error: mailError, activationUrl: mailOk ? null : activationUrl },
    })
  } catch (e: any) {
    console.error('[users.POST] error:', e)
    return NextResponse.json({ error: e?.message || 'Wystąpił błąd serwera' }, { status: 500 })
  }
}
