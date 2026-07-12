import { prisma } from './prisma'
import { getExpiringSoftReservations, type ReservationClient } from './reservations'
import { sendEmail } from './mailer'
import { getSmsConfig, sendSms, normalizePhonePl } from './sms'
import { warsawDateKey } from './tasks'
import { audit } from './audit-log'

/**
 * Automatyczne powiadomienia do KLIENTA przed wygaśnięciem rezerwacji miękkiej
 * (e-mail + SMS) oraz zadanie „Zadzwoń" na pulpicie dla handlowca — w tym samym
 * przebiegu, czyli w tym samym momencie.
 *
 * Uruchamiane cronem: POST /api/public/reservations/alerts (Coolify Scheduled
 * Task co 15 min, sekret RESERVATIONS_CRON_SECRET). Konfiguracja w Settings
 * (UI: /settings → „Powiadomienia o rezerwacjach"), klucze reservationAlerts.*.
 *
 * Idempotencja: NotificationLog.dedupeKey (unikalny, zawiera datę wygaśnięcia)
 * — wpis powstaje tylko po UDANEJ wysyłce, więc błąd wysyłki = automatyczny
 * retry przy kolejnym przebiegu. Przedłużenie rezerwacji zmienia datę → nowy
 * klucz → nowy cykl powiadomień. Zadanie pulpitu deduplikowane przez
 * Task.ruleKey RES_CALL:<unitId>:<yyyy-mm-dd> (wzorzec RES_EXPIRE).
 *
 * Grupowanie: klient z kilkoma wygasającymi lokalami (np. rezerwacja z oferty)
 * dostaje JEDEN e-mail/SMS z listą lokali zamiast osobnej wiadomości per lokal.
 */

export const RESERVATION_ALERTS_DEFAULTS = {
  hoursBefore: 48,
  emailEnabled: true,
  smsEnabled: false,
  taskEnabled: true,
  quietStart: 8, // SMS-y tylko w oknie [quietStart, quietEnd) czasu PL
  quietEnd: 20,
  emailSubject: 'Przypomnienie: rezerwacja lokalu {lokal} wygasa {data} o {godzina}',
  emailBody: `Dzień dobry {imie},

przypominamy, że Państwa rezerwacja lokalu {lokal} obowiązuje do {data} do godz. {godzina}.

Jeśli chcą Państwo podpisać umowę rezerwacyjną lub przedłużyć rezerwację, prosimy o kontakt z biurem sprzedaży — chętnie odpowiemy też na wszystkie pytania.

Pozdrawiamy
Zespół MARAF`,
  smsBody:
    'Przypominamy: rezerwacja lokalu {lokal} wygasa {data} o godz. {godzina}. Zapraszamy do kontaktu z biurem sprzedazy MARAF.',
} as const

const SETTINGS_KEYS = [
  'reservationAlerts.hoursBefore',
  'reservationAlerts.emailEnabled',
  'reservationAlerts.smsEnabled',
  'reservationAlerts.taskEnabled',
  'reservationAlerts.quietStart',
  'reservationAlerts.quietEnd',
  'reservationAlerts.emailSubject',
  'reservationAlerts.emailBody',
  'reservationAlerts.smsBody',
]

export type ReservationAlertsConfig = {
  hoursBefore: number
  emailEnabled: boolean
  smsEnabled: boolean
  taskEnabled: boolean
  quietStart: number
  quietEnd: number
  emailSubject: string
  emailBody: string
  smsBody: string
}

export async function getReservationAlertsConfig(): Promise<ReservationAlertsConfig> {
  const rows = await prisma.settings.findMany({ where: { key: { in: SETTINGS_KEYS } } })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const d = RESERVATION_ALERTS_DEFAULTS

  const int = (key: string, def: number) => {
    const n = parseInt(map[key] ?? '', 10)
    return Number.isFinite(n) && n >= 0 ? n : def
  }
  const bool = (key: string, def: boolean) => {
    const v = map[key]
    return v === undefined || v === '' ? def : v === 'true' || v === '1'
  }
  const str = (key: string, def: string) => (map[key]?.trim() ? map[key] : def)

  const hoursBefore = int('reservationAlerts.hoursBefore', d.hoursBefore)
  // Okno SMS: niepoprawna para (odwrócona/pusta/poza dobą) wyłączyłaby SMS-y
  // na stałe i bezgłośnie — wracamy wtedy do domyślnych 8-20.
  let quietStart = int('reservationAlerts.quietStart', d.quietStart)
  let quietEnd = int('reservationAlerts.quietEnd', d.quietEnd)
  if (quietStart > 23 || quietEnd > 24 || quietStart >= quietEnd) {
    quietStart = d.quietStart
    quietEnd = d.quietEnd
  }
  return {
    hoursBefore: hoursBefore > 0 ? hoursBefore : d.hoursBefore,
    emailEnabled: bool('reservationAlerts.emailEnabled', d.emailEnabled),
    smsEnabled: bool('reservationAlerts.smsEnabled', d.smsEnabled),
    taskEnabled: bool('reservationAlerts.taskEnabled', d.taskEnabled),
    quietStart,
    quietEnd,
    emailSubject: str('reservationAlerts.emailSubject', d.emailSubject),
    emailBody: str('reservationAlerts.emailBody', d.emailBody),
    smsBody: str('reservationAlerts.smsBody', d.smsBody),
  }
}

// ---------------------------------------------------------------------------
// Szablony — placeholdery {imie} {nazwisko} {lokal} {data} {godzina}
// (pojedyncze nawiasy — konwencja z masowej wysyłki /mailing)
// ---------------------------------------------------------------------------

export type TemplateVars = {
  imie: string
  nazwisko: string
  lokal: string
  data: string
  godzina: string
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (m, key) => {
    const v = (vars as Record<string, string>)[key]
    return v !== undefined ? v : m
  })
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Treść e-maila (plain text z szablonu) → prosty HTML w stylu maili systemu. */
function bodyToHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('')
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;max-width:640px;">${paragraphs}</div>`
}

/** Bieżąca godzina (0-23) w strefie Europe/Warsaw. */
function warsawHour(now: Date): number {
  return parseInt(
    new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', hour12: false }).format(now),
    10,
  )
}

function dedupeKey(unitId: string, channel: 'EMAIL' | 'SMS', expiresAt: Date): string {
  return `RES_ALERT:${unitId}:${channel}:${expiresAt.toISOString()}`
}

// ---------------------------------------------------------------------------
// Główny przebieg
// ---------------------------------------------------------------------------

export type AlertsRunResult = {
  checked: number
  emailsSent: number
  smsSent: number
  tasksCreated: number
  skipped: { noEmail: number; noPhone: number; quietHours: number; alreadySent: number; muted: number }
  errors: string[]
}

type ExpiringUnit = {
  id: string
  number: string
  reservationExpiresAt: Date
  reservedById: string | null
  reservationAlertsMuted: boolean
  reservedBy: ReservationClient | null
}

export async function runReservationAlerts(now = new Date()): Promise<AlertsRunResult> {
  const cfg = await getReservationAlertsConfig()
  const result: AlertsRunResult = {
    checked: 0,
    emailsSent: 0,
    smsSent: 0,
    tasksCreated: 0,
    skipped: { noEmail: 0, noPhone: 0, quietHours: 0, alreadySent: 0, muted: 0 },
    errors: [],
  }

  if (!cfg.emailEnabled && !cfg.smsEnabled && !cfg.taskEnabled) return result

  // Mutex między przebiegami: dwa nakładające się przebiegi (przeciągnięty tick
  // crona, ręczny GET podczas przebiegu cyklicznego) czytałyby NotificationLog
  // przed zapisem i podwoiłyby wysyłkę do klienta. Lock = unikalny klucz
  // Settings; znacznik starszy niż 14 min (crash poprzedniego) przejmujemy.
  try {
    await prisma.settings.create({ data: { key: LOCK_KEY, value: new Date().toISOString() } })
  } catch {
    const row = await prisma.settings.findUnique({ where: { key: LOCK_KEY } })
    const ts = row ? Date.parse(row.value) : NaN
    if (Number.isFinite(ts) && Date.now() - ts < LOCK_STALE_MS) {
      result.errors.push('Pominięto przebieg — poprzedni jeszcze trwa (lock).')
      return result
    }
    await prisma.settings.upsert({
      where: { key: LOCK_KEY },
      create: { key: LOCK_KEY, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    })
  }

  try {
    return await runAlertsLocked(cfg, result, now)
  } finally {
    await prisma.settings.deleteMany({ where: { key: LOCK_KEY } }).catch(() => {})
  }
}

const LOCK_KEY = 'reservationAlerts.runLock'
const LOCK_STALE_MS = 14 * 60 * 1000

async function runAlertsLocked(
  cfg: ReservationAlertsConfig,
  result: AlertsRunResult,
  now: Date,
): Promise<AlertsRunResult> {
  const inWindow = (await getExpiringSoftReservations(cfg.hoursBefore)).filter(
    (u) => !!u.reservationExpiresAt,
  ) as unknown as ExpiringUnit[]
  result.checked = inWindow.length

  // Rezerwacje wyciszone ręcznie (przełącznik na /rezerwacje) — pomijamy
  // WSZYSTKIE kanały: e-mail, SMS i zadanie „Zadzwoń".
  const expiring = inWindow.filter((u) => !u.reservationAlertsMuted)
  result.skipped.muted = inWindow.length - expiring.length
  if (expiring.length === 0) return result

  // Które lokale już obsłużone (per kanał) — jedno zapytanie zamiast N.
  const keys = expiring.flatMap((u) => [
    dedupeKey(u.id, 'EMAIL', u.reservationExpiresAt),
    dedupeKey(u.id, 'SMS', u.reservationExpiresAt),
  ])
  const sentRows = await prisma.notificationLog.findMany({
    where: { dedupeKey: { in: keys } },
    select: { dedupeKey: true },
  })
  const sentKeys = new Set(sentRows.map((r) => r.dedupeKey))

  // Grupuj po (klient, dokładny termin) — lokale rezerwowane razem (np. z jednej
  // oferty) idą w JEDNYM mailu/SMS, ale różne terminy dostają OSOBNE wiadomości:
  // szablon ma jedną {data}/{godzina} i musi być prawdziwa dla każdego
  // wymienionego lokalu.
  type AlertGroup = { clientId: string; client: ReservationClient; expiresAt: Date; units: ExpiringUnit[] }
  const groups = new Map<string, AlertGroup>()
  for (const u of expiring) {
    if (!u.reservedById || !u.reservedBy) continue
    const key = `${u.reservedById}|${u.reservationExpiresAt.toISOString()}`
    const g = groups.get(key)
    if (g) g.units.push(u)
    else groups.set(key, { clientId: u.reservedById, client: u.reservedBy, expiresAt: u.reservationExpiresAt, units: [u] })
  }

  const smsConfigured = cfg.smsEnabled ? !!(await getSmsConfig()) : false
  if (cfg.smsEnabled && !smsConfigured && groups.size > 0) {
    result.errors.push('SMS włączony, ale brak tokenu SMSAPI w Ustawieniach — SMS-y pominięte.')
  }
  const hour = warsawHour(now)
  const inQuietWindow = hour >= cfg.quietStart && hour < cfg.quietEnd

  for (const { clientId, client, expiresAt, units } of groups.values()) {
    // Treść wiadomości budowana WYŁĄCZNIE z lokali jeszcze nieobsłużonych
    // (fresh, per kanał) — nigdy nie wymieniamy ponownie już powiadomionych.
    const varsFor = (list: ExpiringUnit[]): TemplateVars => ({
      imie: client.firstName,
      nazwisko: client.lastName,
      lokal: list.map((u) => u.number).join(', '),
      data: fmtDate(expiresAt),
      godzina: fmtTime(expiresAt),
    })

    // ---- E-MAIL ----
    if (cfg.emailEnabled) {
      const fresh = units.filter((u) => !sentKeys.has(dedupeKey(u.id, 'EMAIL', u.reservationExpiresAt)))
      if (fresh.length === 0) {
        result.skipped.alreadySent += units.length
      } else if (!client.email) {
        result.skipped.noEmail++
      } else {
        const vars = varsFor(fresh)
        const subject = renderTemplate(cfg.emailSubject, vars)
        const body = renderTemplate(cfg.emailBody, vars)
        try {
          await sendEmail({
            to: client.email,
            subject,
            html: bodyToHtml(body),
            text: body,
            headers: {
              'X-Auto-Response-Suppress': 'All',
              'Auto-Submitted': 'auto-generated',
              'X-Mailer': 'MARAF CRM',
            },
          })
          result.emailsSent++
          await prisma.notificationLog.createMany({
            data: fresh.map((u) => ({
              dedupeKey: dedupeKey(u.id, 'EMAIL', u.reservationExpiresAt),
              unitId: u.id,
              clientId,
              channel: 'EMAIL',
              recipient: client.email as string,
              subject,
              body,
            })),
            skipDuplicates: true,
          })
          void prisma.activity
            .create({
              data: {
                clientId,
                type: 'EMAIL',
                title: `Automatyczne przypomnienie o rezerwacji (${vars.lokal})`,
                content: `Temat: ${subject}\nDo: ${client.email}`,
              },
            })
            .catch((e) => console.error('[reservation-alerts] activity error:', e?.message))
          void audit({
            action: 'NOTIFY_EMAIL',
            entity: 'Client',
            entityId: clientId,
            metadata: { units: fresh.map((u) => u.number), subject },
          })
        } catch (e: any) {
          // Brak wpisu w NotificationLog = retry przy następnym przebiegu.
          console.error('[reservation-alerts] email error (client ukryty):', e?.message, e?.code)
          result.errors.push(`E-mail (${vars.lokal}): ${e?.message || 'nieznany błąd'}`)
        }
      }
    }

    // ---- SMS ----
    if (cfg.smsEnabled) {
      const fresh = units.filter((u) => !sentKeys.has(dedupeKey(u.id, 'SMS', u.reservationExpiresAt)))
      const phone = normalizePhonePl(client.phone)
      if (fresh.length === 0 || !smsConfigured) {
        // już wysłane / brak konfiguracji (błąd zgłoszony raz, przed pętlą)
      } else if (!phone) {
        result.skipped.noPhone++
      } else if (!inQuietWindow) {
        // poza oknem 8-20 czasu PL — spróbujemy w kolejnym przebiegu rano
        result.skipped.quietHours++
      } else {
        const vars = varsFor(fresh)
        // Twardy limit długości (6 segmentów UCS-2) — złośliwie długi szablon
        // nie może generować nieprzewidywalnych kosztów ani permanentnego
        // błędu 11 bramki.
        const message = renderTemplate(cfg.smsBody, vars).slice(0, 402)
        try {
          await sendSms({ to: phone, message })
          result.smsSent++
          await prisma.notificationLog.createMany({
            data: fresh.map((u) => ({
              dedupeKey: dedupeKey(u.id, 'SMS', u.reservationExpiresAt),
              unitId: u.id,
              clientId,
              channel: 'SMS',
              recipient: phone,
              body: message,
            })),
            skipDuplicates: true,
          })
          void prisma.activity
            .create({
              data: {
                clientId,
                type: 'NOTATKA',
                title: `SMS: przypomnienie o rezerwacji (${vars.lokal})`,
                content: `Do: ${phone}\nTreść: ${message}`,
              },
            })
            .catch((e) => console.error('[reservation-alerts] activity error:', e?.message))
          void audit({
            action: 'NOTIFY_SMS',
            entity: 'Client',
            entityId: clientId,
            metadata: { units: fresh.map((u) => u.number) },
          })
        } catch (e: any) {
          console.error('[reservation-alerts] sms error (numer ukryty):', e?.message, e?.code)
          result.errors.push(`SMS (${vars.lokal}): ${e?.message || 'nieznany błąd'}`)
        }
      }
    }
  }

  // ---- ZADANIE NA PULPICIE („Zadzwoń do klienta") ----
  // Tworzone dla WSZYSTKICH wygasających (także bez klienta / bez kontaktu) —
  // handlowiec ma widzieć temat niezależnie od tego, czy mail/SMS wyszedł.
  if (cfg.taskEnabled) {
    const rows = expiring.map((u) => {
      const client = u.reservedBy
      const contact = client
        ? `${client.firstName} ${client.lastName}${client.phone ? `, tel. ${client.phone}` : ''}${client.email ? `, ${client.email}` : ''}`
        : 'brak przypisanego klienta'
      return {
        title: `Zadzwoń do klienta — rezerwacja miękka ${u.number} wygasa ${fmtDate(u.reservationExpiresAt)} o ${fmtTime(u.reservationExpiresAt)}`,
        description: `Klient: ${contact}. System wysyła automatyczne przypomnienia e-mail/SMS wg ustawień — czy dotarły, zweryfikujesz w aktywnościach klienta.`,
        type: 'REZERWACJA',
        source: 'RULE',
        ruleKey: `RES_CALL:${u.id}:${warsawDateKey(u.reservationExpiresAt)}`,
        dueAt: u.reservationExpiresAt,
        unitId: u.id,
        clientId: u.reservedById,
        // Kieruj do opiekuna klienta (null = pula wspólna, widoczne dla wszystkich)
        assigneeId: u.reservedBy?.ownerId ?? null,
      }
    })
    if (rows.length > 0) {
      const res = await prisma.task.createMany({ data: rows, skipDuplicates: true })
      result.tasksCreated = res.count

      // Zadanie „Zadzwoń" zastępuje wcześniejsze, łagodniejsze RES_EXPIRE dla
      // tego samego lokalu i terminu — bez tego widget pokazywałby dwa wpisy
      // o tej samej rezerwacji. Wykonywane ZAWSZE (nie tylko gdy coś powstało):
      // silnik zadań może dotworzyć RES_EXPIRE już PO powstaniu RES_CALL
      // (np. rezerwacja założona z terminem < hoursBefore) — updateMany jest
      // idempotentne, więc sprząta też te późniejsze duplikaty.
      const superseded = rows.map((r) => r.ruleKey.replace('RES_CALL:', 'RES_EXPIRE:'))
      await prisma.task.updateMany({
        where: { ruleKey: { in: superseded }, status: 'OTWARTE' },
        data: { status: 'ANULOWANE', autoCompleted: true, completedAt: now },
      })
    }
  }

  return result
}
