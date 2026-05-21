/**
 * System uprawnień per-user (per-section).
 *
 * Każdy user ma listę identyfikatorów sekcji do których ma dostęp (User.permissions).
 * Middleware sprawdza per-request czy user ma permission dla pathname (mapowanie URL → permission).
 * Sidebar filtruje sekcje nawigacji po permissions.
 *
 * Admin (NEXT_PUBLIC_ADMIN_EMAIL) zawsze ma override — nie sprawdzamy jego permissions.
 *
 * Aby zmienić uprawnienia: /settings → tabela userów → checkboxy → zapis. Po zapisaniu
 * user musi się wylogować i zalogować ponownie (permissions są snapshot w JWT przy logowaniu).
 */

export const ALL_PERMISSIONS = [
  'dashboard',
  'clients',
  'units',
  'oferty',
  'sales',
  'service',
  'mailing',
  'calendar',
  'przeroby',
  'finanse',
  'statystyki',
] as const

// Sub-permissions w obrębie sekcji. Stringi z dot-notation, sprawdzane przez
// hasPermission(perms, 'finanse.approve'). Wymagają posiadania parent permission
// ('finanse') żeby w ogóle wejść do sekcji.
export const SUB_PERMISSIONS = [
  'finanse.approve',  // prawo akceptowania faktur w inboksie /finanse/do-zatwierdzenia
] as const

export type Permission = (typeof ALL_PERMISSIONS)[number]
export type SubPermission = (typeof SUB_PERMISSIONS)[number]

export const PERMISSION_LABELS: Record<Permission, string> = {
  dashboard: 'Pulpit',
  clients: 'Klienci',
  units: 'Lokale',
  oferty: 'Oferty',
  sales: 'Sprzedaż',
  service: 'Serwis',
  mailing: 'Mailing',
  calendar: 'Kalendarz',
  przeroby: 'Przeroby',
  finanse: 'Finanse',
  statystyki: 'Statystyki',
}

export const SUB_PERMISSION_LABELS: Record<SubPermission, string> = {
  'finanse.approve': 'Finanse — zatwierdzanie faktur',
}

// Kolejność preferowana — po logowaniu user ląduje na pierwszej dostępnej.
const PREFERRED_LANDING_ORDER: Permission[] = [
  'dashboard',
  'przeroby',
  'oferty',
  'sales',
  'finanse',
  'clients',
  'units',
  'service',
  'mailing',
  'calendar',
]

/**
 * Mapowanie URL pathname → wymagana permission.
 *
 * Zwraca:
 *  - Permission — gdy strona/API wymaga konkretnej sekcji
 *  - 'admin'    — gdy tylko admin (NEXT_PUBLIC_ADMIN_EMAIL) ma dostęp (settings, zarządzanie userami)
 *  - null       — gdy brak wymagań (auth, statics, root)
 */
export function getRequiredPermission(pathname: string): Permission | 'admin' | null {
  // Profil usera — każdy zalogowany ma dostęp do SWOJEGO (PATCH /api/users/me filtruje po session.user.id).
  // Musi być PRZED /api/users (które jest admin-only).
  if (pathname === '/profil' || pathname.startsWith('/profil/')) return null
  if (pathname === '/api/users/me' || pathname.startsWith('/api/users/me/')) return null

  // Strony
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname.startsWith('/clients')) return 'clients'
  if (pathname.startsWith('/units')) return 'units'
  if (pathname.startsWith('/oferty')) return 'oferty'
  if (pathname.startsWith('/sales')) return 'sales'
  if (pathname.startsWith('/service')) return 'service'
  if (pathname.startsWith('/mailing')) return 'mailing'
  if (pathname.startsWith('/calendar')) return 'calendar'
  if (pathname.startsWith('/przeroby')) return 'przeroby'
  if (pathname.startsWith('/finanse')) return 'finanse'
  if (pathname.startsWith('/statystyki')) return 'statystyki'
  if (pathname.startsWith('/settings')) return 'admin'

  // API
  if (pathname.startsWith('/api/dashboard')) return 'dashboard'
  if (pathname.startsWith('/api/clients')) return 'clients'
  if (pathname.startsWith('/api/units')) return 'units'
  if (pathname.startsWith('/api/oferty')) return 'oferty'
  if (pathname.startsWith('/api/sales')) return 'sales'
  if (pathname.startsWith('/api/service')) return 'service'
  if (pathname.startsWith('/api/mailing')) return 'mailing'
  if (pathname.startsWith('/api/calendar')) return 'calendar'
  if (pathname.startsWith('/api/przeroby')) return 'przeroby'
  if (pathname.startsWith('/api/finanse')) return 'finanse'
  if (pathname.startsWith('/api/statystyki')) return 'statystyki'

  // Admin-only API (zarządzanie userami, settings)
  if (pathname.startsWith('/api/users')) return 'admin'
  if (pathname.startsWith('/api/settings')) return 'admin'

  // Bez wymagań: /, /auth/*, /api/auth/*, statics, _next
  return null
}

/**
 * Po zalogowaniu — pierwsza dostępna sekcja dla usera.
 * Używane przez middleware przy redirect, gdy user trafi na stronę bez permission.
 */
export function getFirstAvailableUrl(permissions: readonly string[]): string {
  for (const p of PREFERRED_LANDING_ORDER) {
    if (permissions.includes(p)) return `/${p}`
  }
  return '/auth/signin?error=NoAccess'
}

export function hasPermission(permissions: readonly string[] | undefined, perm: string): boolean {
  if (!permissions) return false
  return permissions.includes(perm)
}
