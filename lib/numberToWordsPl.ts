// Simple Polish number-to-words converter for monetary amounts.
// Supports integers up to 999_999_999, plus grosze.

const JEDNOSCI = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć']
const NASTKI = [
  'dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście',
  'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście',
]
const DZIESIATKI = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt']
const SETKI = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset']

// Forms: [1, 2-4, 5+]
const TYSIAC = ['tysiąc', 'tysiące', 'tysięcy']
const MILION = ['milion', 'miliony', 'milionów']

function pickForm(n: number, forms: string[]): string {
  const last = n % 10
  const last2 = n % 100
  if (n === 1) return forms[0]
  if (last >= 2 && last <= 4 && (last2 < 10 || last2 >= 20)) return forms[1]
  return forms[2]
}

function threeDigits(n: number): string {
  if (n === 0) return ''
  const s = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (s) parts.push(SETKI[s])
  if (rest >= 10 && rest < 20) {
    parts.push(NASTKI[rest - 10])
  } else {
    const d = Math.floor(rest / 10)
    const j = rest % 10
    if (d) parts.push(DZIESIATKI[d])
    if (j) parts.push(JEDNOSCI[j])
  }
  return parts.filter(Boolean).join(' ')
}

function intToWords(n: number): string {
  if (n === 0) return 'zero'
  if (n < 0) return 'minus ' + intToWords(-n)

  const mln = Math.floor(n / 1_000_000)
  const tys = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000

  const parts: string[] = []
  if (mln) parts.push(threeDigits(mln) + ' ' + pickForm(mln, MILION))
  if (tys) parts.push(threeDigits(tys) + ' ' + pickForm(tys, TYSIAC))
  if (rest) parts.push(threeDigits(rest))

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Convert an amount in PLN to words. E.g. 1234.56 -> "jeden tysiąc dwieście trzydzieści cztery złote 56/100"
 */
export function amountToWordsPl(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  const zl = Math.floor(rounded)
  const gr = Math.round((rounded - zl) * 100)

  const zlWord =
    zl === 1 ? 'złoty' :
    (zl % 10 >= 2 && zl % 10 <= 4 && (zl % 100 < 10 || zl % 100 >= 20)) ? 'złote' :
    'złotych'

  const grStr = String(gr).padStart(2, '0')
  return `${intToWords(zl)} ${zlWord} ${grStr}/100`
}

/** Just the integer-to-words (no złote suffix) — for pure "słownie" contexts. */
export function integerToWordsPl(n: number): string {
  return intToWords(Math.round(n))
}
