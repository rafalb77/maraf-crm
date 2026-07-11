import { prisma } from './prisma'

/**
 * Wysyłka SMS przez bramkę SMSAPI.pl (REST, bez SDK — zwykły fetch).
 *
 * Konfiguracja w tabeli Settings (UI: /settings → „Powiadomienia o rezerwacjach"),
 * fallback na env — wzorzec getSmtpConfig z lib/mailer.ts:
 *  - sms.apiToken — token OAuth z panelu SMSAPI (Ustawienia → Tokeny API)
 *  - sms.from     — zarejestrowana nazwa nadawcy (np. "MARAF"); pusta = domyślna
 *                   bramka testowa SMSAPI
 *
 * Dokumentacja API: https://www.smsapi.pl/docs — endpoint POST /sms.do,
 * autoryzacja `Authorization: Bearer <token>`, odpowiedź JSON.
 */

export type SmsConfig = {
  token: string
  from: string
}

/** Czyta konfigurację SMS z Settings (fallback env SMSAPI_TOKEN/SMSAPI_FROM). */
export async function getSmsConfig(): Promise<SmsConfig | null> {
  const rows = await prisma.settings.findMany({
    where: { key: { in: ['sms.apiToken', 'sms.from'] } },
  })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const token = map['sms.apiToken'] || process.env.SMSAPI_TOKEN || ''
  const from = map['sms.from'] || process.env.SMSAPI_FROM || ''
  if (!token) return null
  return { token, from }
}

/**
 * Normalizuje polski numer telefonu do E.164 (+48XXXXXXXXX).
 * Pola Client.phone/phone2 to wolny tekst (spacje, myślniki, z/bez prefiksu) —
 * bez normalizacji bramka odrzuci numer. Zwraca null gdy numer nie wygląda
 * na poprawny (wtedy pomijamy SMS, nie blokujemy pozostałych kanałów).
 */
export function normalizePhonePl(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/[\s\-().]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (!/^\d+$/.test(digits)) return null

  if (digits.length === 9) digits = '48' + digits // krajowy bez prefiksu
  if (digits.startsWith('48') && digits.length === 11) {
    // Polskie komórki = konkretne prefiksy dwucyfrowe wg planu numeracji UKE
    // (45, 50, 51, 53, 57, 60, 66, 69, 72, 73, 78, 79, 88). Stacjonarne
    // odrzucamy — SMS nie dojdzie, a cron ponawiałby wysyłkę w kółko.
    if (!/^48(45|50|51|53|57|60|66|69|72|73|78|79|88)/.test(digits)) return null
    return '+' + digits
  }
  // inny kraj: akceptuj rozsądną długość E.164
  if (digits.length >= 10 && digits.length <= 15) return '+' + digits
  return null
}

// Mapowanie najczęstszych kodów błędów SMSAPI na polskie komunikaty.
const SMSAPI_ERRORS: Record<number, string> = {
  11: 'Wiadomość za długa lub błędne parametry.',
  13: 'Brak poprawnych numerów odbiorców (numer błędny lub zablokowany).',
  14: 'Niepoprawna nazwa nadawcy — musi być zarejestrowana i zaakceptowana w panelu SMSAPI.',
  101: 'Niepoprawny token API (autoryzacja odrzucona).',
  102: 'Niepoprawny login lub hasło SMSAPI.',
  103: 'Brak środków na koncie SMSAPI — doładuj konto.',
  105: 'Adres IP niedozwolony (filtr IP w panelu SMSAPI).',
}

export type SmsSendResult = {
  id: string
  points: number // koszt w punktach SMSAPI
  number: string
}

/**
 * Wysyła pojedynczy SMS. Rzuca Error z przyjaznym polskim komunikatem
 * (pole .code = kod błędu SMSAPI) gdy bramka odrzuci wysyłkę.
 */
export async function sendSms({ to, message }: { to: string; message: string }): Promise<SmsSendResult> {
  const cfg = await getSmsConfig()
  if (!cfg) throw new Error('Brak konfiguracji SMS. Ustaw token SMSAPI w panelu Ustawień.')

  const params = new URLSearchParams({
    to,
    message,
    format: 'json',
    encoding: 'utf-8',
  })
  if (cfg.from) params.set('from', cfg.from)

  let res: Response
  try {
    res = await fetch('https://api.smsapi.pl/sms.do', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e: any) {
    const err: any = new Error('Brak połączenia z bramką SMSAPI. Sprawdź internet i spróbuj ponownie.')
    err.technical = e?.message || String(e)
    err.isTransient = true
    throw err
  }

  let data: any = null
  try {
    data = await res.json()
  } catch {
    // odpowiedź nie-JSON — traktuj jak błąd bramki
  }

  if (!res.ok || data?.error) {
    const code = Number(data?.error) || res.status
    const friendly = SMSAPI_ERRORS[code] || data?.message || `Bramka SMS zwróciła błąd (kod ${code}).`
    const err: any = new Error(friendly)
    err.code = code
    err.technical = data ? JSON.stringify(data).slice(0, 500) : `HTTP ${res.status}`
    err.isTransient = res.status >= 500
    throw err
  }

  const first = data?.list?.[0]
  return {
    id: first?.id || '',
    points: Number(first?.points) || 0,
    number: first?.number || to,
  }
}
