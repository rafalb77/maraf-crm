/**
 * Sprawdza czy uzytkownik jest adminem.
 *
 * Konfiguracja: zmienna NEXT_PUBLIC_ADMIN_EMAIL (Coolify env).
 * NEXT_PUBLIC_ prefix bo funkcja jest uzywana zarowno po stronie serwera
 * (w layoucie /settings) jak i po stronie klienta (w Sidebar — ukrycie linka).
 * Email admina nie jest tajny — jest widoczny w bazie userow.
 *
 * - Jesli NEXT_PUBLIC_ADMIN_EMAIL nie jest ustawiona → wszyscy zalogowani sa
 *   adminami (fallback dla okresu przejsciowego, bezpieczny default — nie
 *   blokuje samego siebie zanim ustawi env).
 * - Jesli ustawiona → tylko user z tym emailem jest adminem.
 *
 * UWAGA: NEXT_PUBLIC_ vars sa inline'owane w buildtime — po zmianie env
 * w Coolify trzeba zrobic rebuild (nie tylko restart).
 */
export function isAdmin(email?: string | null): boolean {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase()
  if (!adminEmail) return true
  if (!email) return false
  return email.trim().toLowerCase() === adminEmail
}
