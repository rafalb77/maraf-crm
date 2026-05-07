/**
 * Powitanie po porze dnia + skrót imienia.
 * Dla admina (NEXT_PUBLIC_ADMIN_EMAIL) zawsze "Rafał" niezależnie od pola name w bazie.
 */

export type Greeting = {
  text: string // np. "Cześć Rafał"
  partOfDay: 'poranek' | 'popołudnie' | 'wieczór' | 'noc'
  partOfDayLabel: string // "dobry poranek" / "miłego popołudnia" / "spokojnego wieczoru" / "dobrej nocy"
  emoji: string
}

const ADMIN_DISPLAY_NAME = 'Rafał'

function firstName(input: string | null | undefined): string {
  if (!input) return 'Cześć'
  const s = input.trim()
  if (!s) return 'Cześć'
  // Bierz pierwsze słowo + capitalize (na wypadek "rafał boruch")
  const w = s.split(/\s+/)[0]
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

export function getGreeting(opts: {
  email?: string | null
  name?: string | null
  date?: Date
}): Greeting {
  const date = opts.date || new Date()
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase()
  const isAdminUser = !!(opts.email && adminEmail && opts.email.trim().toLowerCase() === adminEmail)

  const displayName = isAdminUser ? ADMIN_DISPLAY_NAME : firstName(opts.name || opts.email)

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
