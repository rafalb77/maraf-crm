import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSmtpConfig } from '@/lib/mailer'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to } = await req.json()
  if (!to) return NextResponse.json({ error: 'Brak adresu' }, { status: 400 })

  const cfg = await getSmtpConfig()
  if (!cfg) return NextResponse.json({ error: 'Brak konfiguracji SMTP' }, { status: 400 })

  // Capture debug log from nodemailer
  const debugLog: string[] = []
  const customLogger = {
    level: () => {},
    trace: (...a: any[]) => debugLog.push(`[trace] ${formatArgs(a)}`),
    debug: (...a: any[]) => debugLog.push(`[debug] ${formatArgs(a)}`),
    info: (...a: any[]) => debugLog.push(`[info]  ${formatArgs(a)}`),
    warn: (...a: any[]) => debugLog.push(`[warn]  ${formatArgs(a)}`),
    error: (...a: any[]) => debugLog.push(`[error] ${formatArgs(a)}`),
    fatal: (...a: any[]) => debugLog.push(`[fatal] ${formatArgs(a)}`),
  }

  const tls: Record<string, unknown> = {
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',
    servername: cfg.host,
  }
  if (cfg.allowSelfSigned) tls.rejectUnauthorized = false

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    logger: customLogger as any,
    debug: true,
  })

  const fromAddr = cfg.fromName ? `"${cfg.fromName}" <${cfg.from}>` : cfg.from

  try {
    await transporter.sendMail({
      from: fromAddr,
      to,
      subject: 'Test wysyłki — MARAF Development CRM',
      html: `<p>To jest testowa wiadomość z systemu CRM.</p>
        <p>Konfiguracja SMTP działa poprawnie.</p>
        <hr>
        <p style="font-size:12px;color:#888">Host: ${cfg.host}:${cfg.port} ${cfg.secure ? '(SSL)' : '(STARTTLS)'}<br>Nadawca: ${fromAddr}</p>`,
      text: 'Test wysyłki — konfiguracja SMTP działa poprawnie.',
    })
    return NextResponse.json({ success: true, log: debugLog })
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.message || 'Błąd wysyłki',
        code: e?.code,
        command: e?.command,
        response: e?.response,
        log: debugLog.slice(-40), // last 40 lines
      },
      { status: 500 },
    )
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      try { return JSON.stringify(a) } catch { return String(a) }
    })
    .join(' ')
}
