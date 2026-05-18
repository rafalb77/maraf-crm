/**
 * Prosty in-memory rate limiter dla wrażliwych endpointów (login, reset hasła).
 *
 * Per-proces — nie współdzielony między instancjami. Dla Coolify (1 kontener
 * aplikacji + 1 baza) to OK. Gdy wprowadzimy klastry/skalowanie poziome,
 * przejść na Redis / DB-backed.
 *
 * Strategia: sliding window — N prób w oknie X ms per klucz (email albo IP).
 * Po przekroczeniu limit dostaje TTL równy oknu — kolejne próby blokowane
 * dopóki najstarsza próba nie wygaśnie.
 *
 * Cleanup: leniwy (przy każdym `check`) — usuwa wpisy starsze niż okno.
 */

type Entry = { timestamps: number[] }

const buckets = new Map<string, Entry>()

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterMs: number // sekundy do następnej dozwolonej próby (gdy !allowed)
}

/**
 * Sprawdź czy klucz może wykonać operację. Jeśli tak — zapisz timestamp.
 * Jeśli nie — zwróć retryAfter (czas do najstarszej próby wygasającej z okna).
 *
 * @param key      Identyfikator (email, IP, "ip:email" — wybierz po use case)
 * @param maxHits  Ile prób dozwolonych w oknie (np. 5)
 * @param windowMs Okno w ms (np. 15 * 60 * 1000 = 15 min)
 */
export function rateLimit(key: string, maxHits: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs

  let entry = buckets.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    buckets.set(key, entry)
  }

  // Usuń wpisy poza oknem (sliding window cleanup)
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

  if (entry.timestamps.length >= maxHits) {
    const oldest = entry.timestamps[0]
    const retryAfterMs = oldest + windowMs - now
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) }
  }

  // Zapisz tę próbę
  entry.timestamps.push(now)
  return {
    allowed: true,
    remaining: maxHits - entry.timestamps.length,
    retryAfterMs: 0,
  }
}

/**
 * Wyczyść bucket dla klucza (np. po udanym loginie — reset prób). Opcjonalne.
 */
export function resetRateLimit(key: string) {
  buckets.delete(key)
}

/**
 * Periodyczny cleanup całej mapy (raz na godzinę). Trzymanie milionów kluczy
 * nigdy nie odwiedzanych byłoby memory leakiem.
 *
 * UWAGA: w środowiskach z hot-reload (next dev) ten interval może się
 * mnożyć — chronimy się przez `globalThis` flag (singleton w danym procesie).
 */
declare global {
  // eslint-disable-next-line no-var
  var __rateLimitCleanupStarted: boolean | undefined
}

if (typeof globalThis !== 'undefined' && !globalThis.__rateLimitCleanupStarted) {
  globalThis.__rateLimitCleanupStarted = true
  setInterval(
    () => {
      const now = Date.now()
      const cutoff = now - 60 * 60 * 1000 // godzina
      for (const [key, entry] of buckets) {
        entry.timestamps = entry.timestamps.filter((t) => t > cutoff)
        if (entry.timestamps.length === 0) buckets.delete(key)
      }
    },
    60 * 60 * 1000, // co godzinę
  )
}
