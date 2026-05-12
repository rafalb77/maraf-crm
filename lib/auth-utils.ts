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

/**
 * Sprawdza czy user jest kierownikiem-podwykonawca (np. Konrad).
 *
 * CONTRACTOR ma dostep TYLKO do sekcji Przeroby (/przeroby/* + /api/przeroby/*).
 * Wszystkie inne route'y blokowane przez middleware.ts (redirect na /przeroby
 * dla stron, 403 dla API).
 *
 * Konfiguracja: NEXT_PUBLIC_CONTRACTOR_EMAIL (Coolify env). Bez ustawienia env
 * — funkcja zawsze zwraca false (nikt nie jest contractorem, fallback bezpieczny).
 *
 * NEXT_PUBLIC_ prefix bo uzywana zarowno po stronie serwera (middleware) jak
 * i klienta (Sidebar — filtrowanie linkow nav). Po zmianie env w Coolify
 * trzeba REBUILD (nie tylko restart) — NEXT_PUBLIC_ inline'owane w buildtime.
 */
export function isContractor(email?: string | null): boolean {
  const contractorEmail = process.env.NEXT_PUBLIC_CONTRACTOR_EMAIL?.trim().toLowerCase()
  if (!contractorEmail) return false
  if (!email) return false
  return email.trim().toLowerCase() === contractorEmail
}

/**
 * Czy ten path jest dozwolony dla CONTRACTOR'a.
 * Bialalista: /przeroby/*, /api/przeroby/*, /api/auth/* (logout/session).
 */
export function contractorCanAccess(pathname: string): boolean {
  if (pathname.startsWith('/przeroby')) return true
  if (pathname.startsWith('/api/przeroby')) return true
  if (pathname.startsWith('/api/auth')) return true
  return false
}
