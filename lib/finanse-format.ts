// Helpery formatujące dla modułu Finanse.

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'
}

export function fmtMoneyShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' mln zł'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + ' tys. zł'
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' zł'
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDateShort(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
}

/** "za 3 dni" / "5 dni temu" / "dzisiaj". Tylko dni — bez godzin. */
export function fmtDaysFromNow(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  const now = new Date()
  const dayMs = 86400000
  const diff = Math.round((date.setHours(0, 0, 0, 0) - new Date(now.setHours(0, 0, 0, 0)).getTime()) / dayMs)
  if (diff === 0) return 'dzisiaj'
  if (diff === 1) return 'jutro'
  if (diff === -1) return 'wczoraj'
  if (diff > 0) return `za ${diff} ${diff < 5 ? 'dni' : 'dni'}`
  return `${-diff} dni temu`
}

/**
 * Kwota faktycznie należna podwykonawcy = brutto minus potrącenia
 * (kaucja gwarancyjna + koszty budowy + prąd). Dla faktur bez potrąceń = brutto.
 * To kwota którą trzeba przelać; kaucja jest zwracana osobno po okresie gwarancji.
 */
export function payableAmount(inv: {
  amountGross: number
  deposit?: number | null
  buildingCosts?: number | null
  electricity?: number | null
}): number {
  const ded = (inv.deposit || 0) + (inv.buildingCosts || 0) + (inv.electricity || 0)
  return Math.round((inv.amountGross - ded) * 100) / 100
}

export function isOverdue(dueDate: Date | string | null | undefined, status: string): boolean {
  if (!dueDate) return false
  if (status === 'OPLACONA' || status === 'ANULOWANA') return false
  const date = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  if (isNaN(date.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date.getTime() < today.getTime()
}
