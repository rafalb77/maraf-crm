/**
 * Avatar — initials z hash maila (zero infrastruktury, brak uploadu).
 *
 * Inicjały: pierwszy znak preferredName/name/email + (opcjonalnie) pierwszy znak drugiego słowa.
 * Kolor tła: deterministyczny z hash maila (paleta 8 odcieni dopasowanych do brand).
 */

const PALETTE = [
  { bg: '#C9A37A', fg: '#1F2D3F' }, // accent (akcent app)
  { bg: '#8B6F47', fg: '#FFFFFF' },
  { bg: '#4A6FA5', fg: '#FFFFFF' },
  { bg: '#5B8C5A', fg: '#FFFFFF' },
  { bg: '#A05A6E', fg: '#FFFFFF' },
  { bg: '#6F5BA0', fg: '#FFFFFF' },
  { bg: '#A07E5B', fg: '#FFFFFF' },
  { bg: '#3E5C76', fg: '#FFFFFF' },
] as const

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function initialsOf(opts: { preferredName?: string | null; name?: string | null; email?: string | null }): string {
  const source = opts.preferredName?.trim() || opts.name?.trim() || ''
  if (source) {
    const words = source.split(/\s+/).filter(Boolean)
    if (words.length === 1) return words[0].slice(0, 1).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  const local = (opts.email || '').split('@')[0] || '?'
  return local.slice(0, 1).toUpperCase() || '?'
}

export function Avatar({
  email,
  name,
  preferredName,
  size = 32,
  className,
}: {
  email?: string | null
  name?: string | null
  preferredName?: string | null
  size?: number
  className?: string
}) {
  const initials = initialsOf({ preferredName, name, email })
  const seed = (email || name || preferredName || 'anon').toLowerCase()
  const palette = PALETTE[hash(seed) % PALETTE.length]
  const fontSize = Math.round(size * 0.42)

  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold select-none ${className || ''}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${palette.bg}, color-mix(in srgb, ${palette.bg} 70%, black))`,
        color: palette.fg,
        fontSize,
        lineHeight: 1,
      }}
      aria-label={`Avatar ${initials}`}
    >
      {initials}
    </div>
  )
}
