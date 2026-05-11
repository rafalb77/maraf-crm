import nodemailer, { Transporter } from 'nodemailer'
import { prisma } from './prisma'

export type SmtpConfig = {
  host: string
  port: number
  secure: boolean // true for 465 (SSL), false for 587 (STARTTLS)
  user: string
  pass: string
  from: string
  fromName?: string
  allowSelfSigned?: boolean
}

export type Attachment = {
  filename: string
  content: Buffer | string
  contentType?: string
}

/** Reads SMTP config from DB Settings (key/value), falls back to env vars. */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const rows = await prisma.settings.findMany({
    where: { key: { in: ['smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass', 'smtpFrom', 'smtpFromName', 'smtpAllowSelfSigned'] } },
  })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  const host = map.smtpHost || process.env.SMTP_HOST || ''
  const portStr = map.smtpPort || process.env.SMTP_PORT || '587'
  const secureStr = map.smtpSecure || process.env.SMTP_SECURE || 'false'
  const user = map.smtpUser || process.env.SMTP_USER || ''
  const pass = map.smtpPass || process.env.SMTP_PASS || ''
  const from = map.smtpFrom || process.env.SMTP_FROM || user
  const fromName = map.smtpFromName || process.env.SMTP_FROM_NAME || ''
  const allowSelfSignedStr = map.smtpAllowSelfSigned || process.env.SMTP_ALLOW_SELF_SIGNED || 'false'

  if (!host || !user || !pass) return null

  return {
    host,
    port: parseInt(portStr, 10) || 587,
    secure: secureStr === 'true' || secureStr === '1',
    user,
    pass,
    from,
    fromName,
    allowSelfSigned: allowSelfSignedStr === 'true' || allowSelfSignedStr === '1',
  }
}

function buildTransportOptions(cfg: SmtpConfig, debug = false) {
  // Many older PL hostings (home.pl, nazwa.pl) require TLS 1.2 — TLS 1.3
  // negotiated by Node 20+ causes immediate ECONNRESET on the handshake.
  const tls: Record<string, unknown> = {
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',
    servername: cfg.host,
  }
  if (cfg.allowSelfSigned) tls.rejectUnauthorized = false

  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    logger: debug,
    debug,
  }
}

export async function createTransporter(): Promise<Transporter> {
  const cfg = await getSmtpConfig()
  if (!cfg) {
    throw new Error('Brak konfiguracji SMTP. Ustaw dane serwera w panelu Ustawień.')
  }
  return nodemailer.createTransport(buildTransportOptions(cfg))
}

// Błędy sieciowe które warto retry'ować — przeważnie chwilowe (DNS, restart trasera, timeout SMTP)
const TRANSIENT_ERROR_CODES = new Set([
  'ETIMEOUT',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',     // nodejs DNS — temporary failure
  'EDNS',
  'ESOCKET',
])

export type FriendlyMailError = {
  message: string  // przyjazny komunikat po polsku
  technical: string // oryginalny błąd
  code?: string
  isTransient: boolean
}

export function toFriendlyMailError(e: any): FriendlyMailError {
  const code = e?.code || ''
  const original = e?.message || String(e)
  const isTransient = TRANSIENT_ERROR_CODES.has(code)

  let message = original
  if (code === 'ETIMEOUT' || code === 'ETIMEDOUT') {
    message = 'Przekroczono czas oczekiwania na połączenie z serwerem SMTP. Sprawdź internet/DNS i spróbuj ponownie.'
  } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    message = `Nie można rozpoznać adresu serwera pocztowego (DNS). Sprawdź konfigurację „Host SMTP" w Ustawieniach albo połączenie sieciowe.`
  } else if (code === 'ECONNRESET') {
    message = 'Serwer SMTP zerwał połączenie. Spróbuj ponownie za chwilę.'
  } else if (code === 'ECONNREFUSED') {
    message = 'Serwer SMTP odrzucił połączenie. Sprawdź port (465/587) i czy serwer odpowiada.'
  } else if (code === 'EAUTH' || /authentication failed/i.test(original)) {
    message = 'Błąd uwierzytelniania SMTP. Sprawdź login i hasło w Ustawieniach.'
  } else if (code === 'EENVELOPE' || /sender/i.test(original)) {
    message = 'Serwer odrzucił adres nadawcy. Adres „From" musi zgadzać się z loginem SMTP.'
  }

  return { message, technical: original, code, isTransient }
}

const RETRYABLE_DELAY_MS = 1500
const MAX_RETRIES = 1

export async function sendEmail({
  to,
  subject,
  html,
  text,
  attachments,
  headers,
}: {
  to: string | string[]
  subject: string
  html: string
  text?: string
  attachments?: Attachment[]
  headers?: Record<string, string>
}) {
  const cfg = await getSmtpConfig()
  if (!cfg) throw new Error('Brak konfiguracji SMTP. Uzupełnij dane w Ustawieniach.')

  const fromAddr = cfg.fromName ? `"${cfg.fromName}" <${cfg.from}>` : cfg.from
  const payload = {
    from: fromAddr,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
    text,
    attachments,
    headers,
  }

  let lastError: any = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const transporter = nodemailer.createTransport(buildTransportOptions(cfg))
      return await transporter.sendMail(payload)
    } catch (e: any) {
      lastError = e
      const f = toFriendlyMailError(e)
      // Retry tylko dla błędów chwilowych
      if (!f.isTransient || attempt >= MAX_RETRIES) break
      // Odczekaj przed kolejną próbą
      await new Promise((r) => setTimeout(r, RETRYABLE_DELAY_MS))
    }
  }
  // Konwertuj na przyjazny błąd przy ostatecznym fail
  const f = toFriendlyMailError(lastError)
  const err: any = new Error(f.message)
  err.code = f.code
  err.technical = f.technical
  err.isTransient = f.isTransient
  throw err
}

/** Verify SMTP connection without sending. */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = await createTransporter()
    await transporter.verify()
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Błąd połączenia SMTP' }
  }
}
