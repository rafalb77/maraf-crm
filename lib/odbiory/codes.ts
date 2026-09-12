// Kody i etykiety modułu Odbiory (czyste funkcje, klient + serwer).
//
// Kod usterki: STA-01-A-2-012 = inwestycja - budynek - klatka - kondygnacja - numer.
// Numer (seq) jest ciągły per arkusz rzutu i nigdy nie jest reużywany, więc ⑫
// oznacza tę samą usterkę na każdym wydruku i w każdym kolejnym odbiorze.

const DIACRITICS: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z',
}

export function stripDiacritics(s: string): string {
  return s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => DIACRITICS[ch] || ch)
}

/** Kod inwestycji do numeracji: Investment.code albo 3 pierwsze litery nazwy (STA z „Nova Staffa"? — nie: bierzemy ostatnie słowo). */
export function investmentCode(inv: { code?: string | null; name: string }): string {
  if (inv.code && inv.code.trim()) return stripDiacritics(inv.code.trim()).toUpperCase().slice(0, 6)
  const words = stripDiacritics(inv.name).split(/\s+/).filter(Boolean)
  const base = words.length > 1 ? words[words.length - 1] : words[0] || 'INW'
  return base.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'INW'
}

/** „B1 / Klatka C" → „B1"; null → „B1" (jedyny budynek Nova Staffa). */
export function buildingName(building: string | null | undefined): string {
  if (!building) return 'B1'
  const m = /^([A-Za-z]*\d+[A-Za-z]?)/.exec(building.trim())
  return m ? m[1].toUpperCase() : building.split('/')[0].trim().toUpperCase() || 'B1'
}

/** „B1" → „01", „B12" → „12", „A" → „A". */
export function buildingCode(building: string | null | undefined): string {
  const name = buildingName(building)
  const digits = name.replace(/\D/g, '')
  if (digits) return digits.padStart(2, '0')
  return name
}

export function defectCode(parts: {
  investmentCode: string
  building: string | null | undefined
  staircase?: string | null
  floor?: number | null
  seq: number
}): string {
  const st = parts.staircase ? parts.staircase.toUpperCase() : 'X'
  const fl = parts.floor == null ? 'X' : String(parts.floor)
  return `${parts.investmentCode}-${buildingCode(parts.building)}-${st}-${fl}-${String(parts.seq).padStart(3, '0')}`
}

export function floorName(floor: number | null | undefined, markersKey?: string | null): string {
  if (markersKey === 'pzt') return 'Teren (PZT)'
  if (floor == null) return 'Bez kondygnacji'
  if (floor === 0) return 'Parter'
  if (floor < 0) return `Kondygnacja ${floor}`
  return `${floor} piętro`
}

/** Etykieta zakresu odbioru: „Stan surowy · B1 · klatka A · 2 piętro". */
export function scopeLabel(parts: {
  stage?: string | null
  building?: string | null
  staircase?: string | null
  floor?: number | null
  markersKey?: string | null
}): string {
  const out: string[] = []
  if (parts.stage) out.push(parts.stage)
  if (parts.building) out.push(buildingName(parts.building))
  if (parts.staircase) out.push(`klatka ${parts.staircase}`)
  out.push(floorName(parts.floor, parts.markersKey))
  return out.join(' · ')
}

/** Krótka etykieta lokalu z numeru „B1.2.M28" → „M28"; „MG.14" → „MG.14". */
export function unitShortLabel(number: string | null | undefined): string {
  if (!number) return ''
  const parts = number.split('.')
  if (parts.length >= 3) return parts.slice(2).join('.')
  return number
}

export function formatDatePl(d: string | Date | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Warsaw' })
}

export function formatDateTimePl(d: string | Date | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Warsaw',
  })
}

/** Data „za N dni" jako ISO (północ lokalna). */
export function addDaysIso(days: number, from: Date = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

/** Najbliższy piątek (jeśli dziś piątek — dzisiejszy). */
export function nextFridayIso(from: Date = new Date()): string {
  const d = new Date(from)
  const day = d.getDay() // 0 nd .. 5 pt
  const delta = (5 - day + 7) % 7
  d.setDate(d.getDate() + delta)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}
