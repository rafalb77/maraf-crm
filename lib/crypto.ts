import crypto from 'crypto'

/**
 * Szyfrowanie wrażliwych pól osobowych klientów (PESEL, dowód, imiona rodziców,
 * adres) — at-rest w bazie. Chroni przed wyciekiem dumpu bazy / backupu /
 * przejęciem DATABASE_URL: bez ENCRYPTION_KEY te kolumny są nieczytelne.
 *
 * Algorytm: AES-256-GCM (authenticated — wykrywa manipulację ciphertextem).
 * Klucz: `ENCRYPTION_KEY` w env — 64 znaki hex (32 bajty). Wygeneruj:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Format zaszyfrowanej wartości: `enc::v1::<base64(iv[12] | tag[16] | ciphertext)>`
 * Prefiks `enc::v1::` jest UNIKALNY i służy do wykrywania czy wartość jest już
 * zaszyfrowana — dzięki temu:
 *  - encryptField jest idempotentne (nie szyfruje podwójnie),
 *  - decryptField jest no-op dla zwykłego tekstu (legacy plaintext przechodzi bez zmian),
 *  - deepDecrypt może bezpiecznie przejść CAŁY wynik zapytania i odszyfrować tylko
 *    stringi z tym prefiksem (nie tknie niczego innego) — pokrywa też nested includes.
 */

export const ENC_PREFIX = 'enc::v1::'

// Pola modelu Client szyfrowane at-rest. NIE szyfrujemy firstName/lastName/email/
// phone (używane w wyszukiwaniu /api/clients) ani city/zipCode (filtry).
export const CLIENT_ENCRYPTED_FIELDS = [
  'pesel',
  'nip',
  'idNumber',
  'fatherName',
  'motherName',
  'address',
] as const

let cachedKey: Buffer | null = null
let warnedNoKey = false

function getKey(): Buffer | null {
  if (cachedKey) return cachedKey
  const rawEnv = process.env.ENCRYPTION_KEY
  if (!rawEnv) return null
  // Toleruj otaczające cudzysłowy/apostrofy i białe znaki (częsty błąd przy
  // wklejaniu wartości w panelu Coolify).
  const raw = rawEnv.trim().replace(/^["']|["']$/g, '').trim()
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      `ENCRYPTION_KEY musi być 64 znakami hex (32 bajty). Otrzymano: ${raw.length} znaków. ` +
        'Wygeneruj: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }
  cachedKey = Buffer.from(raw, 'hex')
  return cachedKey
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX)
}

/**
 * Szyfruje pojedynczą wartość. Zwraca:
 *  - null/undefined/'' bez zmian (puste pola zostają puste),
 *  - już zaszyfrowane bez zmian (idempotencja),
 *  - jeśli brak ENCRYPTION_KEY → zwraca plaintext + jednorazowe ostrzeżenie
 *    (rezylientne: aplikacja nie pada zanim admin ustawi klucz; migracja
 *    domknie szyfrowanie po ustawieniu klucza).
 */
export function encryptField(plain: string | null | undefined): string | null | undefined {
  if (plain == null || plain === '') return plain
  if (isEncrypted(plain)) return plain
  const key = getKey()
  if (!key) {
    if (!warnedNoKey) {
      console.warn('[crypto] ENCRYPTION_KEY nie ustawiony — dane osobowe zapisywane PLAINTEXT. Ustaw klucz i uruchom scripts/encrypt-existing-clients.js')
      warnedNoKey = true
    }
    return plain
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64')
}

/**
 * Odszyfrowuje wartość. No-op dla zwykłego tekstu (brak prefiksu). Rzuca jeśli
 * dane są zaszyfrowane a klucza brak / jest błędny (głośna awaria — lepsze niż
 * cicho zwrócić śmieci).
 */
export function decryptField(stored: string | null | undefined): string | null | undefined {
  if (stored == null || stored === '') return stored
  if (!isEncrypted(stored)) return stored
  const key = getKey()
  if (!key) throw new Error('[crypto] Dane zaszyfrowane, ale ENCRYPTION_KEY nie jest ustawiony.')
  const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/** Szyfruje podzbiór pól Client w obiekcie data (write-path). Mutuje kopię, zwraca nową. */
export function encryptClientData<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = { ...data }
  for (const f of CLIENT_ENCRYPTED_FIELDS) {
    if (f in out && typeof out[f] === 'string') {
      out[f] = encryptField(out[f] as string)
    }
  }
  return out as T
}

/**
 * Rekurencyjnie przechodzi dowolny wynik zapytania i odszyfrowuje KAŻDY string
 * zaczynający się od ENC_PREFIX. Bezpieczne dla całego grafu (nested includes,
 * tablice) — nie tyka stringów bez prefiksu, Date, Buffer, liczb itd.
 */
export function deepDecrypt<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === 'string') {
    return (isEncrypted(value) ? decryptField(value) : value) as T
  }
  if (value == null || typeof value !== 'object') return value
  if (value instanceof Date || Buffer.isBuffer(value)) return value
  if (seen.has(value as object)) return value
  seen.add(value as object)

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = deepDecrypt(value[i], seen)
    }
    return value
  }
  const obj = value as Record<string, unknown>
  for (const k of Object.keys(obj)) {
    obj[k] = deepDecrypt(obj[k], seen)
  }
  return value
}
