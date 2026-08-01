import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatArea(area: number): string {
  // pl-PL jak formatCurrency: „68,30 m²", nie „68.30 m²".
  return `${new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(area)} m²`
}

// Stała strefa: kontener prod działa w UTC, a te funkcje bywają wołane i na
// serwerze (SSR), i w przeglądarce — bez timeZone ten sam wpis renderowałby się
// różnie (błąd hydracji w komponentach klienckich, czasy UTC na stronach RSC).
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}
