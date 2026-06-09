// Logika terminów dla modułu Sprawy.
//
// Reklamacja z tytułu rękojmi: sprzedawca ma 14 dni na ustosunkowanie się do
// żądania kupującego — brak odpowiedzi w terminie = domniemanie uznania reklamacji
// (Kodeks cywilny). Liczymy od daty wpływu (receivedAt). Sprawy urzędowe i inne
// mają termin ustawiany ręcznie (różne podstawy prawne).

import { CASE_CLOSED_STATUSES, type CaseStatus } from './types'

export const REKLAMACJA_RESPONSE_DAYS = 14

/** Domyślny termin dla typu sprawy liczony od daty wpływu. null = brak auto-terminu. */
export function defaultDeadline(type: string, receivedAt: Date | null | undefined): Date | null {
  if (!receivedAt) return null
  if (type === 'REKLAMACJA') {
    const d = new Date(receivedAt)
    d.setDate(d.getDate() + REKLAMACJA_RESPONSE_DAYS)
    return d
  }
  return null
}

export type DeadlineState = 'NONE' | 'OK' | 'SOON' | 'TODAY' | 'OVERDUE'

/**
 * Stan terminu względem dziś. Sprawy zamknięte (ROZSTRZYGNIETA/ZAMKNIETA) → NONE
 * (nie straszymy czerwienią na zamkniętych). `soonDays` = ile dni przed terminem
 * sygnalizować „zbliża się".
 */
export function deadlineState(
  deadline: Date | string | null | undefined,
  status: string,
  soonDays = 3,
): DeadlineState {
  if (!deadline) return 'NONE'
  if (CASE_CLOSED_STATUSES.includes(status as CaseStatus)) return 'NONE'
  const date = typeof deadline === 'string' ? new Date(deadline) : deadline
  if (isNaN(date.getTime())) return 'NONE'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return 'OVERDUE'
  if (diffDays === 0) return 'TODAY'
  if (diffDays <= soonDays) return 'SOON'
  return 'OK'
}

export const DEADLINE_STATE_COLORS: Record<DeadlineState, string> = {
  NONE: 'text-gray-400',
  OK: 'text-green-600',
  SOON: 'text-amber-600',
  TODAY: 'text-orange-600 font-semibold',
  OVERDUE: 'text-red-600 font-semibold',
}
