/**
 * Powitanie po porze dnia + skrót imienia.
 *
 * Priorytet wyświetlanego imienia:
 *   1. preferredName z User.preferredName (per-user, edytowalny na /profil)
 *   2. pierwsze słowo z User.name
 *   3. część przed @ z User.email
 *   4. fallback "Cześć"
 */

export type Greeting = {
  text: string // np. "Cześć Rafał"
  partOfDay: 'poranek' | 'popołudnie' | 'wieczór' | 'noc'
  partOfDayLabel: string // "dobry poranek" / "miłego popołudnia" / "spokojnego wieczoru" / "dobrej nocy"
  emoji: string
}

function firstWordCapitalized(input: string | null | undefined): string | null {
  if (!input) return null
  const s = input.trim()
  if (!s) return null
  const w = s.split(/\s+/)[0]
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

function emailLocalPart(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  const local = at > 0 ? email.slice(0, at) : email
  return firstWordCapitalized(local.replace(/[._-]+/g, ' '))
}

export function getGreeting(opts: {
  email?: string | null
  name?: string | null
  preferredName?: string | null
  date?: Date
}): Greeting {
  const date = opts.date || new Date()

  const displayName =
    firstWordCapitalized(opts.preferredName) ||
    firstWordCapitalized(opts.name) ||
    emailLocalPart(opts.email) ||
    'Cześć'

  const hour = date.getHours()
  let partOfDay: Greeting['partOfDay']
  let partOfDayLabel: string
  let emoji: string

  if (hour >= 5 && hour < 12) {
    partOfDay = 'poranek'
    partOfDayLabel = 'dobry poranek'
    emoji = '🌅'
  } else if (hour >= 12 && hour < 18) {
    partOfDay = 'popołudnie'
    partOfDayLabel = 'miłego popołudnia'
    emoji = '☀️'
  } else if (hour >= 18 && hour < 22) {
    partOfDay = 'wieczór'
    partOfDayLabel = 'spokojnego wieczoru'
    emoji = '🌆'
  } else {
    partOfDay = 'noc'
    partOfDayLabel = 'dobrej nocy'
    emoji = '🌙'
  }

  return {
    text: `Cześć ${displayName}`,
    partOfDay,
    partOfDayLabel,
    emoji,
  }
}
