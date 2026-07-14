import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail, toFriendlyMailError } from '@/lib/mailer'
import { buildWeeklyDigest } from '@/lib/budowa-digest'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/public/budowa/weekly-digest
 * Cron — tygodniowy raport z budowy (Etap 4, decyzja Rafała nr 8: "raz w tygodniu
 * do wszystkich"). Chroniony `BUDOWA_CRON_SECRET` (query ?secret= albo Bearer).
 * Odbiorcy: wszyscy użytkownicy Z WYJĄTKIEM kont check-in-only (kierownik budowy
 * nie dostaje raportu zarządczego). Nie wysyła, gdy nic się nie wydarzyło
 * (?force=1 wymusza). Coolify scheduled task: np. poniedziałek 7:00.
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.BUDOWA_CRON_SECRET
  if (!secret) return false
  const fromQuery = new URL(req.url).searchParams.get('secret')
  const fromHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return fromQuery === secret || fromHeader === secret
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'https://crm.maraf.pl'
  const digest = await buildWeeklyDigest(baseUrl)
  if (!digest) {
    return NextResponse.json({ ok: true, sent: false, reason: 'no active investment' })
  }
  const force = new URL(req.url).searchParams.get('force') === '1'
  if (!digest.hasContent && !force) {
    return NextResponse.json({ ok: true, sent: false, reason: 'no activity this week' })
  }

  // Odbiorcy: konta zarządcze (mają jakąkolwiek permission poza samym 'checkin').
  const users = await prisma.user.findMany({ select: { email: true, permissions: true } })
  const recipients = users
    .filter((u) => {
      const perms = u.permissions || []
      const checkinOnly = perms.length === 1 && perms[0] === 'checkin'
      return !checkinOnly
    })
    .map((u) => u.email)
    .filter(Boolean)

  // fallback: admin z env, gdyby lista była pusta
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (adminEmail && !recipients.includes(adminEmail)) recipients.push(adminEmail)

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'Brak odbiorców' }, { status: 400 })
  }

  try {
    // jeden mail do całej rodziny (adresy widoczne — to firma rodzinna, OK)
    await sendEmail({
      to: recipients,
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
    })
  } catch (e) {
    const f = toFriendlyMailError(e)
    return NextResponse.json({ error: f.message }, { status: 502 })
  }

  return NextResponse.json({ ok: true, sent: true, recipients: recipients.length })
}
